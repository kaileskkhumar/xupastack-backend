import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { apps } from "../db/schema";
import type { Env } from "../env";
import type { SessionUser } from "../auth/session";
import { CreateAppSchema, UpdateAppSchema } from "@xupastack/shared";
import { validateSlugFormat } from "../lib/slug";
import { validateSupabaseUrl } from "../lib/validate-supabase";
import { runDiagnostics } from "../lib/diagnostics";
import { getSnippet, getSnippets, SUPPORTED_STACKS, type Stack } from "../lib/snippets";

interface Variables {
  user: SessionUser;
}

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Consent fields required on app creation
const ConsentSchema = z.object({
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "termsAccepted must be true" }),
  }),
  termsVersion: z.string().min(1),
  privacyVersion: z.string().min(1),
  aupVersion: z.string().min(1),
});

/** Derive the publicly-visible gateway URL for this app. */
function computeGatewayUrl(row: typeof apps.$inferSelect): string | null {
  return row.mode === "managed" ? row.proxyUrl : row.selfhostGatewayUrl;
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToApp(row: typeof apps.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    mode: row.mode,
    status: row.status,
    // upstreamHost kept for back-compat; upstreamUrl is the preferred alias
    upstreamHost: row.upstreamHost,
    upstreamUrl: row.upstreamHost,
    gatewayUrl: computeGatewayUrl(row),
    allowedOrigins: safeJsonParse<string[]>(row.allowedOriginsJson, []),
    allowCredentials: Boolean(row.allowCredentials),
    enabledServices: safeJsonParse<string[]>(row.enabledServicesJson, []),
    rateLimitPerMin: row.rateLimitPerMin,
    strictMode: Boolean(row.strictMode),
    rewriteLocationHeaders: Boolean(row.rewriteLocationHeaders),
    proxyUrl: row.proxyUrl,
    selfhostGatewayUrl: row.selfhostGatewayUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Static routes first (must come before /:id) ───────────────────────────────

// GET /apps/slug-check?slug=...
router.get("/slug-check", async (c) => {
  const slug = c.req.query("slug") ?? "";

  const fmt = validateSlugFormat(slug);
  if (!fmt.ok) {
    return c.json(
      { available: false, error: "invalid_format", reason: fmt.reason },
      400
    );
  }

  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.slug, slug))
    .limit(1);

  return c.json({ available: rows.length === 0 });
});

// ── Collection routes ──────────────────────────────────────────────────────────

// POST /apps
router.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parsedApp = CreateAppSchema.safeParse(body);
  if (!parsedApp.success) {
    return c.json(
      { error: "validation_error", issues: parsedApp.error.issues },
      400
    );
  }

  const parsedConsent = ConsentSchema.safeParse(body);
  if (!parsedConsent.success) {
    return c.json({ error: "terms_not_accepted" }, 400);
  }

  const data = parsedApp.data;
  const consent = parsedConsent.data;

  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const existing = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.slug, data.slug))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: "slug_taken" }, 409);
  }

  const urlResult = await validateSupabaseUrl(data.upstreamHost);
  if (!urlResult.ok) {
    return c.json({ error: "invalid_supabase_url", detail: urlResult.error }, 400);
  }
  const normalizedHost = urlResult.normalizedUpstreamHost;

  const proxyUrl =
    data.mode === "managed"
      ? c.env.MANAGED_GW_BASE.replace("{slug}", data.slug)
      : null;

  const ip =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for") ??
    "unknown";
  const userAgent = c.req.header("user-agent") ?? "";
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .insert(apps)
    .values({
      userId: user.id,
      name: data.name,
      slug: data.slug,
      mode: data.mode,
      upstreamHost: normalizedHost,
      allowedOriginsJson: JSON.stringify(data.allowedOrigins),
      allowCredentials: data.allowCredentials,
      enabledServicesJson: JSON.stringify(data.enabledServices),
      rateLimitPerMin: data.rateLimitPerMin,
      strictMode: data.strictMode,
      rewriteLocationHeaders: data.rewriteLocationHeaders,
      proxyUrl,
      termsAcceptedAt: now,
      termsVersion: consent.termsVersion,
      privacyVersion: consent.privacyVersion,
      aupVersion: consent.aupVersion,
      termsAcceptIp: ip,
      termsAcceptUserAgent: userAgent,
    })
    .returning();

  return c.json(rowToApp(result[0]!), 201);
});

// GET /apps
router.get("/", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db.select().from(apps).where(eq(apps.userId, user.id));
  return c.json(rows.map(rowToApp));
});

// ── Resource routes (:id) ──────────────────────────────────────────────────────

// GET /apps/:id
router.get("/:id", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);

  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json(rowToApp(rows[0]));
});

// PUT /apps/:id
router.put("/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateAppSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const existing = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);

  if (!existing[0]) return c.json({ error: "not_found" }, 404);

  const data = parsed.data;

  let normalizedHost: string | undefined;
  if (data.upstreamHost !== undefined) {
    const urlResult = await validateSupabaseUrl(data.upstreamHost);
    if (!urlResult.ok) {
      return c.json({ error: "invalid_supabase_url", detail: urlResult.error }, 400);
    }
    normalizedHost = urlResult.normalizedUpstreamHost;
  }

  // selfhostGatewayUrl may only be set on selfhost apps
  if (data.selfhostGatewayUrl !== undefined && existing[0].mode !== "selfhost") {
    return c.json({ error: "selfhostGatewayUrl can only be set on selfhost apps" }, 400);
  }

  const updated = await db
    .update(apps)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(normalizedHost !== undefined && { upstreamHost: normalizedHost }),
      ...(data.allowedOrigins !== undefined && {
        allowedOriginsJson: JSON.stringify(data.allowedOrigins),
      }),
      ...(data.allowCredentials !== undefined && {
        allowCredentials: data.allowCredentials,
      }),
      ...(data.enabledServices !== undefined && {
        enabledServicesJson: JSON.stringify(data.enabledServices),
      }),
      ...(data.rateLimitPerMin !== undefined && {
        rateLimitPerMin: data.rateLimitPerMin,
      }),
      ...(data.strictMode !== undefined && { strictMode: data.strictMode }),
      ...(data.rewriteLocationHeaders !== undefined && {
        rewriteLocationHeaders: data.rewriteLocationHeaders,
      }),
      ...(data.selfhostGatewayUrl !== undefined && {
        selfhostGatewayUrl: data.selfhostGatewayUrl,
      }),
      updatedAt: now,
    })
    .where(eq(apps.id, c.req.param("id")))
    .returning();

  return c.json(rowToApp(updated[0]!));
});

// POST /apps/:id/deactivate
router.post("/:id/deactivate", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const updated = await db
    .update(apps)
    .set({ status: "disabled", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(apps.id, c.req.param("id")))
    .returning();

  return c.json(rowToApp(updated[0]!));
});

// POST /apps/:id/activate
router.post("/:id/activate", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const updated = await db
    .update(apps)
    .set({ status: "active", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(apps.id, c.req.param("id")))
    .returning();

  return c.json(rowToApp(updated[0]!));
});

// POST /apps/:id/diagnostics
router.post("/:id/diagnostics", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);

  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const app = rows[0];
  const gatewayUrl = computeGatewayUrl(app);

  if (!gatewayUrl) {
    return c.json({
      authOk: false,
      restOk: false,
      storageOk: null,
      notes: ["Gateway URL is not configured for this app."],
    });
  }

  const enabledServices = safeJsonParse<string[]>(app.enabledServicesJson, []);
  const result = await runDiagnostics(gatewayUrl, enabledServices);
  return c.json(result);
});

// GET /apps/:id/snippets?stack=<stack>
router.get("/:id/snippets", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);

  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const app = rows[0];
  const gatewayUrl = computeGatewayUrl(app);

  if (!gatewayUrl) {
    return c.json({ error: "gateway_not_configured" }, 400);
  }

  const stackParam = c.req.query("stack");

  if (stackParam) {
    if (!(SUPPORTED_STACKS as readonly string[]).includes(stackParam)) {
      return c.json(
        {
          error: "unknown_stack",
          supported: SUPPORTED_STACKS,
        },
        400
      );
    }
    const snippet = getSnippet(gatewayUrl, stackParam as Stack);
    return c.json({ stack: stackParam, snippet });
  }

  return c.json({ snippets: getSnippets(gatewayUrl) });
});

// DELETE /apps/:id
router.delete("/:id", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  await db.delete(apps).where(eq(apps.id, c.req.param("id")));
  return c.json({ deleted: true });
});

export { router as appsRouter };
