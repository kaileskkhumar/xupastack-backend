import { Hono } from "hono";
import { dashboardHtml } from "@xupastack/ui-embed";
import { GatewayConfigSchema } from "@xupastack/shared";
import type { Env } from "./env";

const CONFIG_KV_KEY = "gateway:config";

const dash = new Hono<{ Bindings: Env }>();

/** GET /__xupastack – serve dashboard UI */
dash.get("/", (c) => {
  return new Response(dashboardHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

/** GET /__xupastack/health */
dash.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

/** GET /__xupastack/api/config – return current config */
dash.get("/api/config", async (c) => {
  const raw = await c.env.CONFIG.get(CONFIG_KV_KEY);
  if (!raw) return c.json({ error: "config_not_found" }, 404);
  return new Response(raw, { headers: { "Content-Type": "application/json" } });
});

/** PUT /__xupastack/api/config – update config (admin token required) */
dash.put("/api/config", async (c) => {
  const authHeader = c.req.header("authorization");
  const expectedToken = c.env.ADMIN_TOKEN;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = GatewayConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  await c.env.CONFIG.put(CONFIG_KV_KEY, JSON.stringify(parsed.data));
  return c.json({ ok: true, config: parsed.data });
});

export { dash as dashboardRouter, CONFIG_KV_KEY };
