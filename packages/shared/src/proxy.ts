import type { GatewayConfig } from "./schemas";
import { applyCors, setCorsHeaders } from "./cors";
import { verifyHmacRequest } from "./crypto";

// Headers that must not be forwarded (hop-by-hop per RFC 7230)
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const SERVICE_PREFIX_MAP: Record<string, string> = {
  rest: "/rest/v1/",
  auth: "/auth/v1/",
  storage: "/storage/v1/",
  functions: "/functions/v1/",
  graphql: "/graphql/v1/",
  realtime: "/realtime/v1/websocket",
};

export function isAllowedPath(
  pathname: string,
  enabledServices: string[]
): boolean {
  for (const service of enabledServices) {
    const prefix = SERVICE_PREFIX_MAP[service];
    if (!prefix) continue;

    if (pathname === prefix) return true;

    // For prefixes ending with '/', startsWith is sufficient (the '/' guards namespace)
    // For bare prefixes (e.g. realtime), only allow exact match or sub-paths with '/'
    // — this ensures query strings (e.g. "?apikey=abc") don't accidentally match
    if (prefix.endsWith("/")) {
      if (pathname.startsWith(prefix)) return true;
    } else {
      if (pathname.startsWith(prefix + "/")) return true;
    }
  }
  return false;
}

export function stripHopByHop(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const key of HOP_BY_HOP) {
    out.delete(key);
  }
  return out;
}

export function rewriteLocationHeader(
  locationValue: string,
  upstreamHost: string,
  requestHost: string
): string {
  try {
    const locUrl = new URL(locationValue);
    const upUrl = new URL(upstreamHost);
    if (locUrl.host === upUrl.host) {
      locUrl.host = requestHost;
      locUrl.protocol = "https:";
      return locUrl.toString();
    }
  } catch {
    // not a fully-qualified URL, return as-is
  }
  return locationValue;
}

export interface ProxyOptions {
  config: GatewayConfig;
  mode: "selfhost" | "managed";
  requestId: string;
  /** Optional HMAC secret for strict-mode server-to-server auth */
  hmacSecret?: string;
}

export async function handleProxy(
  request: Request,
  options: ProxyOptions
): Promise<Response> {
  const { config, mode, requestId, hmacSecret } = options;
  const url = new URL(request.url);

  // ── CORS preflight ────────────────────────────────────────────────────────
  if (request.method === "OPTIONS") {
    return applyCors(
      new Response(null, { status: 204 }),
      request,
      config,
      requestId
    );
  }

  // ── Allowlist check ───────────────────────────────────────────────────────
  if (!isAllowedPath(url.pathname, config.enabledServices)) {
    return applyCors(
      new Response(JSON.stringify({ error: "path_not_allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      config,
      requestId
    );
  }

  // ── Strict mode ───────────────────────────────────────────────────────────
  if (config.strictMode) {
    const origin = request.headers.get("origin");

    // Browser request: enforce origin allowlist
    if (origin) {
      if (
        !config.allowedOrigins.includes("*") &&
        !config.allowedOrigins.includes(origin)
      ) {
        return applyCors(
          new Response(JSON.stringify({ error: "origin_not_allowed" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
          request,
          config,
          requestId
        );
      }
    } else if (hmacSecret) {
      // Server-to-server: verify HMAC signature
      const valid = await verifyHmacRequest(request, hmacSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  // ── Build upstream request ────────────────────────────────────────────────
  const upstreamBase = config.upstreamHost.replace(/\/$/, "");
  const upstreamUrl = `${upstreamBase}${url.pathname}${url.search}`;

  const reqHeaders = stripHopByHop(request.headers);
  // Override host to upstream
  reqHeaders.set("host", new URL(config.upstreamHost).host);

  // ── WebSocket proxy ───────────────────────────────────────────────────────
  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() === "websocket") {
    return handleWebSocket(
      request,
      upstreamUrl,
      reqHeaders,
      config,
      mode,
      requestId
    );
  }

  // ── Regular HTTP proxy (streaming, no buffering) ──────────────────────────
  const upstreamResp = await fetch(
    new Request(upstreamUrl, {
      method: request.method,
      headers: reqHeaders,
      body: request.body,
      redirect: "manual",
    })
  );

  const respHeaders = stripHopByHop(upstreamResp.headers);
  respHeaders.set("via", "xupastack");
  respHeaders.set("x-xupastack-request-id", requestId);
  respHeaders.set("x-xupastack-mode", mode);

  if (config.rewriteLocationHeaders) {
    const loc = upstreamResp.headers.get("location");
    if (loc) {
      respHeaders.set(
        "location",
        rewriteLocationHeader(loc, config.upstreamHost, url.host)
      );
    }
  }

  setCorsHeaders(respHeaders, request, config, requestId);

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: respHeaders,
  });
}

async function handleWebSocket(
  request: Request,
  upstreamUrl: string,
  reqHeaders: Headers,
  config: GatewayConfig,
  mode: "selfhost" | "managed",
  requestId: string
): Promise<Response> {
  // Convert http(s) to ws(s)
  const wsUrl = upstreamUrl.replace(/^https?/, (p) =>
    p === "https" ? "wss" : "ws"
  );

  // Cloudflare Workers: fetch() with WebSocket upgrade headers returns a
  // Response with status 101 and a .webSocket property for transparent proxying.
  const wsResp = await fetch(wsUrl, {
    headers: reqHeaders,
    method: "GET",
  });

  if (wsResp.status !== 101) {
    return new Response(
      JSON.stringify({ error: "websocket_upgrade_failed" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const respHeaders = new Headers(wsResp.headers);
  respHeaders.set("via", "xupastack");
  respHeaders.set("x-xupastack-request-id", requestId);
  respHeaders.set("x-xupastack-mode", mode);

  return new Response(null, {
    status: 101,
    headers: respHeaders,
    // webSocket is a Cloudflare Workers-specific ResponseInit field
    webSocket: (wsResp as unknown as { webSocket: WebSocket }).webSocket,
  } as unknown as ResponseInit);
}
