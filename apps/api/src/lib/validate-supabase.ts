/**
 * Pure Supabase URL validation logic.
 * Exported as standalone functions so they can be unit-tested without Hono.
 */

export type SupabaseValidationOk = {
  ok: true;
  normalizedUpstreamHost: string;
};

export type SupabaseValidationError = {
  ok: false;
  error: "invalid_format" | "unreachable" | "not_supabase";
};

export type SupabaseValidationResult =
  | SupabaseValidationOk
  | SupabaseValidationError;

// RFC-1918 / loopback / link-local ranges that must be blocked (SSRF prevention)
const FORBIDDEN_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,           // 0.x.x.x (unspecified / broadcast)
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,    // link-local / APIPA
  /^::1$/,          // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,   // IPv6 unique-local (fc00::/7)
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,        // IPv6 link-local
];

export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return FORBIDDEN_HOST_PATTERNS.some((p) => p.test(h));
}

/** Normalise an arbitrary user-supplied URL to its HTTPS origin. */
export function normalizeOrigin(rawUrl: string): {
  ok: true;
  origin: string;
} | { ok: false } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "https:") return { ok: false };
  if (isForbiddenHost(parsed.hostname)) return { ok: false };

  return { ok: true, origin: `https://${parsed.host}` };
}

const PROBE_PATHS = ["/auth/v1/health", "/rest/v1/"] as const;
const PROBE_TIMEOUT_MS = 3000;

/**
 * Probe the upstream to confirm it looks like a Supabase instance.
 * Returns "ok" when any probe path returns HTTP < 500.
 *   — 2xx means fully accessible
 *   — 4xx (e.g. 401 "No API key") is still proof the Supabase service is running
 * Returns "unreachable" when every probe throws (timeout / DNS / TLS).
 * Returns "not_supabase" when we can connect but every path returns 5xx.
 */
export async function probeSupabase(
  origin: string,
  fetchFn: typeof fetch = fetch
): Promise<"ok" | "unreachable" | "not_supabase"> {
  let anyReachable = false;

  for (const path of PROBE_PATHS) {
    try {
      const res = await fetchFn(`${origin}${path}`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "User-Agent": "xupastack-validator/1.0" },
      });
      // Any sub-500 response from a Supabase-specific path confirms the service is running.
      // 401 ("No API key found") is the most common response — it IS Supabase.
      if (res.status < 500) return "ok";
      // 5xx → server-side error; keep trying next path
      anyReachable = true;
    } catch {
      // Network / timeout → keep trying next path
    }
  }

  return anyReachable ? "not_supabase" : "unreachable";
}

/** Full validation: format + SSRF check + probe. */
export async function validateSupabaseUrl(
  rawUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<SupabaseValidationResult> {
  const normalized = normalizeOrigin(rawUrl);
  if (!normalized.ok) {
    return { ok: false, error: "invalid_format" };
  }

  const probeResult = await probeSupabase(normalized.origin, fetchFn);
  if (probeResult === "ok") {
    return { ok: true, normalizedUpstreamHost: normalized.origin };
  }
  return { ok: false, error: probeResult };
}
