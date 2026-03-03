import type { GatewayConfig } from "@xupastack/shared";
import type { Env } from "./env";

// L1: in-memory (per-isolate, ~30s TTL)
const memCache = new Map<string, { config: GatewayConfig; status: string; expiresAt: number }>();
const MEM_TTL_MS = 30_000;

const KV_TTL_SECONDS = 60;

export interface AppMeta {
  config: GatewayConfig;
  status: string; // "active" | "disabled"
}

export async function getAppConfig(
  slug: string,
  env: Env
): Promise<AppMeta | null> {
  // ── L1: memory ───────────────────────────────────────────────────────────
  const cached = memCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return { config: cached.config, status: cached.status };
  }

  // ── L2: KV ───────────────────────────────────────────────────────────────
  const kvKey = `app-config:${slug}`;
  const kvValue = await env.APP_CONFIG_CACHE.get(kvKey, "json") as AppMeta | null;
  if (kvValue) {
    memCache.set(slug, {
      config: kvValue.config,
      status: kvValue.status,
      expiresAt: Date.now() + MEM_TTL_MS,
    });
    return kvValue;
  }

  // ── L3: D1 ───────────────────────────────────────────────────────────────
  const result = await env.DB.prepare(
    `SELECT upstream_host, allowed_origins_json, allow_credentials,
            enabled_services_json, rate_limit_per_min, strict_mode,
            rewrite_location_headers, status
       FROM apps WHERE slug = ? LIMIT 1`
  )
    .bind(slug)
    .first<{
      upstream_host: string;
      allowed_origins_json: string;
      allow_credentials: number;
      enabled_services_json: string;
      rate_limit_per_min: number;
      strict_mode: number;
      rewrite_location_headers: number;
      status: string;
    }>();

  if (!result) return null;

  let allowedOrigins: string[];
  let enabledServices: GatewayConfig["enabledServices"];
  try {
    allowedOrigins = JSON.parse(result.allowed_origins_json) as string[];
  } catch {
    console.warn(`[config-cache] failed to parse allowed_origins_json for slug "${slug}" — defaulting to []`);
    allowedOrigins = [];
  }
  try {
    enabledServices = JSON.parse(result.enabled_services_json) as GatewayConfig["enabledServices"];
  } catch {
    console.warn(`[config-cache] failed to parse enabled_services_json for slug "${slug}" — defaulting to all services`);
    enabledServices = ["rest", "auth", "storage", "functions", "graphql", "realtime"];
  }

  const config: GatewayConfig = {
    upstreamHost: result.upstream_host,
    allowedOrigins,
    allowCredentials: Boolean(result.allow_credentials),
    enabledServices,
    rateLimitPerMin: result.rate_limit_per_min,
    strictMode: Boolean(result.strict_mode),
    rewriteLocationHeaders: Boolean(result.rewrite_location_headers),
  };

  const appMeta: AppMeta = { config, status: result.status };

  // Populate KV cache
  await env.APP_CONFIG_CACHE.put(kvKey, JSON.stringify(appMeta), {
    expirationTtl: KV_TTL_SECONDS,
  });

  // Populate memory cache
  memCache.set(slug, {
    config,
    status: result.status,
    expiresAt: Date.now() + MEM_TTL_MS,
  });

  return appMeta;
}

/** Invalidate both memory and KV caches for a slug. */
export async function invalidateAppConfig(
  slug: string,
  env: Env
): Promise<void> {
  memCache.delete(slug);
  await env.APP_CONFIG_CACHE.delete(`app-config:${slug}`);
}
