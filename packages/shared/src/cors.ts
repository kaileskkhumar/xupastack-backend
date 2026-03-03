import type { GatewayConfig } from "./schemas";

const ALLOW_HEADERS =
  "Authorization, Content-Type, apikey, x-client-info, x-xupastack-ts, x-xupastack-sig";
const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const MAX_AGE = "86400";

/**
 * Applies CORS headers to an already-built Response.
 * Returns a new Response with CORS headers set.
 */
export function applyCors(
  response: Response,
  request: Request,
  config: GatewayConfig,
  requestId: string
): Response {
  const headers = new Headers(response.headers);
  setCorsHeaders(headers, request, config, requestId);

  if (request.method === "OPTIONS") {
    headers.set("access-control-allow-methods", ALLOW_METHODS);
    headers.set("access-control-allow-headers", ALLOW_HEADERS);
    headers.set("access-control-max-age", MAX_AGE);
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Mutates the given Headers object with CORS values.
 * Use this when you already have a Headers instance and don't want to clone the body.
 */
export function setCorsHeaders(
  headers: Headers,
  request: Request,
  config: GatewayConfig,
  requestId: string
): void {
  headers.set("x-xupastack-request-id", requestId);

  const origin = request.headers.get("origin");
  if (!origin) return;

  const isWildcard = config.allowedOrigins.includes("*");
  const isAllowed =
    isWildcard || config.allowedOrigins.includes(origin);

  if (!isAllowed) return;

  if (config.allowCredentials) {
    // spec: when credentials=true, MUST NOT use wildcard
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  } else {
    headers.set(
      "access-control-allow-origin",
      isWildcard ? "*" : origin
    );
  }

  headers.set("access-control-expose-headers", "x-xupastack-request-id");
}
