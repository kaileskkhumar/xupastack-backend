import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { apps } from "../db/schema";
import type { Env } from "../env";
import type { SessionUser } from "../auth/session";
import { generateToken, ConfigTokenPayloadSchema } from "@xupastack/shared";
import type { GatewayConfig } from "@xupastack/shared";

interface Variables {
  user: SessionUser;
}

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const CONFIG_TOKEN_TTL = 10 * 60; // 10 minutes

// GET /apps/:id/config.json  – generate short-lived signed config URL
router.get("/:id/config.json", async (c) => {
  const user = c.get("user");
  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, c.req.param("id")), eq(apps.userId, user.id)))
    .limit(1);

  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const token = generateToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + CONFIG_TOKEN_TTL;

  // Store {appId, expiresAt} in KV keyed by the token, with TTL
  await c.env.CONFIG_TOKENS.put(
    `ct:${token}`,
    JSON.stringify({ appId: rows[0].id, expiresAt }),
    { expirationTtl: CONFIG_TOKEN_TTL }
  );

  const configUrl = `${c.env.API_BASE_URL}/apps/${rows[0].id}/config?token=${token}`;
  return c.json({ configUrl, expiresAt: new Date(expiresAt * 1000).toISOString() });
});

// GET /apps/:id/config?token=...  – return raw config JSON if token valid
// This route is public (no session required) but protected by short-lived token.
router.get("/:id/config", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "missing_token" }, 400);

  const entry = await c.env.CONFIG_TOKENS.get(`ct:${token}`);
  if (!entry) return c.json({ error: "invalid_or_expired_token" }, 401);

  // Delete token FIRST to minimise the TOCTOU window.
  // Two simultaneous requests could both read the entry before either deletes it
  // (KV is eventually consistent), but delete-first makes the window as small as possible.
  await c.env.CONFIG_TOKENS.delete(`ct:${token}`);

  // Use Zod to validate the stored payload rather than a bare cast.
  const parsed = ConfigTokenPayloadSchema.safeParse(JSON.parse(entry));
  if (!parsed.success) {
    return c.json({ error: "invalid_token_payload" }, 401);
  }
  const payload = parsed.data;

  // Defense-in-depth: check expiry explicitly even though KV TTL should handle it.
  if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
    return c.json({ error: "token_expired" }, 401);
  }

  // Verify token is for this app
  if (payload.appId !== c.req.param("id")) {
    return c.json({ error: "token_app_mismatch" }, 401);
  }

  const { getDb } = await import("../db/client");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(apps)
    .where(eq(apps.id, payload.appId))
    .limit(1);

  if (!rows[0]) return c.json({ error: "not_found" }, 404);

  const app = rows[0];

  let allowedOrigins: string[];
  let enabledServices: GatewayConfig["enabledServices"];
  try {
    allowedOrigins = JSON.parse(app.allowedOriginsJson) as string[];
    enabledServices = JSON.parse(app.enabledServicesJson) as GatewayConfig["enabledServices"];
  } catch {
    console.error("[config-export] failed to parse JSON fields for app", payload.appId);
    return c.json({ error: "internal_server_error" }, 500);
  }

  const config: GatewayConfig = {
    upstreamHost: app.upstreamHost,
    allowedOrigins,
    allowCredentials: Boolean(app.allowCredentials),
    enabledServices,
    rateLimitPerMin: app.rateLimitPerMin,
    strictMode: Boolean(app.strictMode),
    rewriteLocationHeaders: Boolean(app.rewriteLocationHeaders),
  };

  return c.json(config);
});

export { router as configExportRouter };
