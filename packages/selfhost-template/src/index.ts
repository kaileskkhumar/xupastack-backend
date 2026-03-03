import { handleProxy, generateId, GatewayConfigSchema } from "@xupastack/shared";
import type { GatewayConfig } from "@xupastack/shared";
import type { Env } from "./env";
import { dashboardRouter, CONFIG_KV_KEY } from "./dashboard";

// In-memory config cache (cleared on Worker restart, ~30s TTL)
let cachedConfig: GatewayConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadConfig(env: Env): Promise<GatewayConfig | null> {
  if (cachedConfig && Date.now() < cacheExpiresAt) return cachedConfig;

  const raw = await env.CONFIG.get(CONFIG_KV_KEY);
  if (!raw) return null;

  const parsed = GatewayConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return null;

  cachedConfig = parsed.data;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedConfig;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = generateId();

    // ── Dashboard routes (__xupastack) ────────────────────────────────────
    if (
      url.pathname === "/__xupastack" ||
      url.pathname.startsWith("/__xupastack/")
    ) {
      const stripped = url.pathname.replace(/^\/__xupastack/, "") || "/";
      const dashUrl = new URL(stripped + url.search, url.origin);
      return dashboardRouter.fetch(new Request(dashUrl.toString(), request), env);
    }

    // ── Load config ───────────────────────────────────────────────────────
    const config = await loadConfig(env);
    if (!config) {
      return new Response(
        JSON.stringify({ error: "gateway_not_configured" }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "x-xupastack-request-id": requestId,
          },
        }
      );
    }

    // ── Proxy ─────────────────────────────────────────────────────────────
    return handleProxy(request, { config, mode: "selfhost", requestId });
  },
};
