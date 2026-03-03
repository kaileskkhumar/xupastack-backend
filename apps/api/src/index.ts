import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "./env";
import { getDb } from "./db/client";
import {
  parseSessionCookie,
  validateSession,
  createSession,
  deleteSession,
  buildSessionCookie,
} from "./auth/session";
import {
  buildGithubAuthUrl,
  consumeState,
  exchangeCodeForToken,
  getGithubUser,
  upsertGithubUser,
} from "./auth/github";
import {
  startMagicLink,
  consumeMagicLink,
  upsertEmailUser,
} from "./auth/email";
import { appsRouter } from "./routes/apps";
import { configExportRouter } from "./routes/config-export";
import { validateRouter } from "./routes/validate";
import type { SessionUser } from "./auth/session";

interface Variables {
  user: SessionUser;
}

type AppEnv = { Bindings: Env; Variables: Variables };

const app = new Hono<AppEnv>();

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = c.env.CONSOLE_ORIGIN; // https://xupastack.com

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin, allowed),
    });
  }

  await next();

  // Mutate response headers
  const h = c.res.headers;
  for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
    if (v) h.set(k, v);
  }
});

function corsHeaders(
  origin: string | undefined,
  allowed: string
): Record<string, string> {
  const out: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
  if (origin === allowed) {
    out["access-control-allow-origin"] = origin;
  }
  return out;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const cookieHeader = c.req.header("cookie");
  const sessionId = parseSessionCookie(cookieHeader ?? null);
  if (!sessionId) return c.json({ error: "unauthorized" }, 401);

  const db = getDb(c.env.DB);
  const user = await validateSession(db, sessionId);
  if (!user) return c.json({ error: "unauthorized" }, 401);

  c.set("user", user);
  await next();
};

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ ok: true, ts: new Date().toISOString() })
);

// ── Public: probe Supabase reachability from Cloudflare Workers edge ──────────
// Used by the landing page "Test if you're affected" widget.
// No auth required — rate-limit is handled by Cloudflare.

app.post("/public/probe-supabase", async (c) => {
  const body = await c.req.json().catch(() => null) as { url?: string } | null;
  if (!body?.url || typeof body.url !== "string") {
    return c.json({ ok: false, error: "invalid_format" }, 400);
  }
  const { validateSupabaseUrl } = await import("./lib/validate-supabase");
  const result = await validateSupabaseUrl(body.url);
  return c.json(result, result.ok ? 200 : 400);
});

// ── Legal versions (public) ───────────────────────────────────────────────────

const LEGAL_VERSIONS = {
  termsVersion: "2026-03-03",
  privacyVersion: "2026-03-03",
  aupVersion: "2026-03-03",
} as const;

app.get("/legal/versions", (c) => c.json(LEGAL_VERSIONS));

// ── Session ───────────────────────────────────────────────────────────────────

app.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
});

app.post("/auth/logout", requireAuth, async (c) => {
  const cookieHeader = c.req.header("cookie");
  const sessionId = parseSessionCookie(cookieHeader ?? null);
  if (sessionId) {
    const db = getDb(c.env.DB);
    await deleteSession(db, sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSessionCookie("", true),
    },
  });
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

app.get("/auth/github/start", async (c) => {
  const next = c.req.query("next") ?? "/";
  const { url } = await buildGithubAuthUrl(
    c.env.GITHUB_CLIENT_ID,
    next,
    c.env.API_BASE_URL,
    c.env.CONFIG_TOKENS
  );
  return c.redirect(url, 302);
});

app.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const consoleOrigin = c.env.CONSOLE_ORIGIN;

  if (!code || !state) {
    return c.redirect(`${consoleOrigin}/auth/error?reason=missing_params`, 302);
  }

  const next = await consumeState(state, c.env.CONFIG_TOKENS);
  if (next === null) {
    return c.redirect(`${consoleOrigin}/auth/error?reason=invalid_state`, 302);
  }

  try {
    const token = await exchangeCodeForToken(
      code,
      c.env.GITHUB_CLIENT_ID,
      c.env.GITHUB_CLIENT_SECRET
    );
    const ghUser = await getGithubUser(token);
    const db = getDb(c.env.DB);
    const userId = await upsertGithubUser(db, ghUser);
    const sessionId = await createSession(db, userId);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${consoleOrigin}${next}`,
        "Set-Cookie": buildSessionCookie(sessionId),
      },
    });
  } catch (err) {
    console.error("[github/callback]", err);
    return c.redirect(`${consoleOrigin}/auth/error?reason=github_error`, 302);
  }
});

// ── Email magic link ──────────────────────────────────────────────────────────

app.post("/auth/email/start", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    email?: string;
    next?: string;
  } | null;

  if (!body?.email || typeof body.email !== "string") {
    return c.json({ error: "missing_email" }, 400);
  }

  const ip =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for") ??
    "unknown";
  const userAgent = c.req.header("user-agent") ?? "";
  const nextPath = body.next ?? "/";
  const db = getDb(c.env.DB);

  const result = await startMagicLink({
    db,
    email: body.email,
    ip,
    userAgent,
    nextPath,
    apiBaseUrl: c.env.API_BASE_URL,
    emailProviderKey: c.env.EMAIL_PROVIDER_KEY,
    emailFrom: c.env.EMAIL_FROM,
  });

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400 | 429);
  }

  return c.json({ ok: true });
});

app.get("/auth/email/callback", async (c) => {
  const rawToken = c.req.query("token");
  const next = c.req.query("next") ?? "/";
  const consoleOrigin = c.env.CONSOLE_ORIGIN;

  if (!rawToken) {
    return c.redirect(`${consoleOrigin}/auth/error?reason=missing_token`, 302);
  }

  const db = getDb(c.env.DB);
  const result = await consumeMagicLink({ db, rawToken });

  if ("error" in result) {
    return c.redirect(`${consoleOrigin}/auth/error?reason=${result.error}`, 302);
  }

  const userId = await upsertEmailUser(db, result.email);
  const sessionId = await createSession(db, userId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${consoleOrigin}${result.nextPath}`,
      "Set-Cookie": buildSessionCookie(sessionId),
    },
  });
});

// ── Apps (auth required) ──────────────────────────────────────────────────────

app.use("/apps/*", requireAuth);
app.route("/apps", appsRouter);

// ── Validate (auth required) ──────────────────────────────────────────────────

app.use("/validate/*", requireAuth);
app.route("/validate", validateRouter);

// Config export: GET /apps/:id/config.json requires auth
app.use("/apps/:id/config.json", requireAuth);
app.route("/apps", configExportRouter);

// Public config download endpoint (token-protected, no session required)
// Already mounted above via configExportRouter at /apps/:id/config

// ── 404 ───────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_server_error" }, 500);
});

export default app;
