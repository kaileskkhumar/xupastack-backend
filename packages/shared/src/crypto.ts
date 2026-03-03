/**
 * Crypto helpers using Web Crypto API.
 * Compatible with Cloudflare Workers and Node.js 16+.
 */

export async function hmacSign(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return uint8ToHex(new Uint8Array(sig));
}

export async function hmacVerify(
  secret: string,
  data: string,
  signature: string
): Promise<boolean> {
  const expected = await hmacSign(secret, data);
  return timingSafeEqual(expected, signature);
}

export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(data)
  );
  return uint8ToHex(new Uint8Array(digest));
}

export function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return uint8ToHex(arr);
}

export function generateId(): string {
  return generateToken(16);
}

/** Build the HMAC signature string for strict-mode server-to-server requests. */
export async function buildHmacSignature(
  secret: string,
  ts: string,
  method: string,
  path: string,
  bodyHash: string
): Promise<string> {
  const data = `${ts}\n${method}\n${path}\n${bodyHash}`;
  return hmacSign(secret, data);
}

/** Verify an incoming request's HMAC signature (strict mode). */
export async function verifyHmacRequest(
  request: Request,
  secret: string,
  maxAgeSeconds = 300
): Promise<boolean> {
  const ts = request.headers.get("x-xupastack-ts");
  const sig = request.headers.get("x-xupastack-sig");
  if (!ts || !sig) return false;

  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(now - tsNum) > maxAgeSeconds) return false;

  const url = new URL(request.url);
  const body = await request.clone().arrayBuffer();
  const bodyHash =
    body.byteLength > 0
      ? await sha256Hex(new TextDecoder().decode(body))
      : "";

  const expected = await buildHmacSignature(
    secret,
    ts,
    request.method,
    url.pathname + url.search,
    bodyHash
  );
  return timingSafeEqual(expected, sig);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
