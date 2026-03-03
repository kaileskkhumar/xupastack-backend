import { handleProxy, generateId } from "@xupastack/shared";
import type { Env } from "./env";
import { getAppConfig } from "./config-cache";
import { RateLimiterDO } from "./do/rate-limiter";
import { MonthlyCapDO } from "./do/monthly-cap";

export { RateLimiterDO, MonthlyCapDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = generateId();

    // ── Extract slug from subdomain ───────────────────────────────────────
    // Host format: <slug>-gw.xupastack.com
    const hostParts = url.hostname.split(".");
    const firstPart = hostParts[0]; // e.g. "india-demo-gw"

    if (!firstPart || !firstPart.endsWith("-gw") || hostParts.length < 3) {
      return jsonError("invalid_host", 400, requestId);
    }

    const slug = firstPart.slice(0, -3); // strip trailing "-gw"

    if (!slug) {
      return jsonError("invalid_host", 400, requestId);
    }

    // ── Load app config ───────────────────────────────────────────────────
    const appMeta = await getAppConfig(slug, env);

    if (!appMeta) {
      return jsonError("app_not_found", 404, requestId);
    }

    if (appMeta.status === "disabled") {
      return jsonError("app_disabled", 403, requestId);
    }

    const { config } = appMeta;

    // ── Monthly cap check (global + per-app) ──────────────────────────────
    const [globalCapRes, appCapRes] = await Promise.all([
      fetchDO(env.MONTHLY_CAP, "global", `/?action=increment&cap=${env.GLOBAL_CAP_PER_MONTH}`),
      fetchDO(env.MONTHLY_CAP, `app:${slug}`, `/?action=increment&cap=${env.PER_APP_CAP_PER_MONTH}`),
    ]);

    if (!globalCapRes.allowed || !appCapRes.allowed) {
      return new Response(
        JSON.stringify({
          error: "managed_capacity_reached",
          message:
            "Managed capacity reached. Switch to self-host mode (free) to keep your app online.",
          self_host_url: env.SELF_HOST_QUICKSTART_URL,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "x-xupastack-request-id": requestId,
          },
        }
      );
    }

    // ── Per-app rate limit ────────────────────────────────────────────────
    const rateLimitRes = await fetchDO(
      env.RATE_LIMITER,
      `rl:${slug}`,
      `/?limit=${config.rateLimitPerMin}`
    );

    if (!rateLimitRes.allowed) {
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "x-xupastack-request-id": requestId,
            "retry-after": "60",
          },
        }
      );
    }

    // ── Proxy ─────────────────────────────────────────────────────────────
    return handleProxy(request, { config, mode: "managed", requestId });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(error: string, status: number, requestId: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-xupastack-request-id": requestId,
    },
  });
}

async function fetchDO(
  ns: DurableObjectNamespace,
  name: string,
  path: string
): Promise<{ allowed: boolean; current?: number; count?: number }> {
  const id = ns.idFromName(name);
  const stub = ns.get(id);
  const res = await stub.fetch(`http://do${path}`);
  return (await res.json()) as { allowed: boolean; current?: number; count?: number };
}
