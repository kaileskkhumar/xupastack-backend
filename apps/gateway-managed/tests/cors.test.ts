import { describe, it, expect } from "vitest";
import { applyCors } from "@xupastack/shared";
import type { GatewayConfig } from "@xupastack/shared";

const baseConfig: GatewayConfig = {
  upstreamHost: "https://xyz.supabase.co",
  allowedOrigins: ["https://myapp.com"],
  allowCredentials: false,
  enabledServices: ["rest", "auth"],
  rateLimitPerMin: 100,
  strictMode: false,
  rewriteLocationHeaders: true,
};

function makeReq(origin?: string, method = "GET"): Request {
  const headers: HeadersInit = {};
  if (origin) headers["origin"] = origin;
  return new Request("https://slug.gw.xupastack.com/rest/v1/users", {
    method,
    headers,
  });
}

describe("CORS handling", () => {
  it("sets ACAO to exact origin when allowCredentials=false and origin is in list", async () => {
    const resp = applyCors(
      new Response("ok"),
      makeReq("https://myapp.com"),
      baseConfig,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-origin")).toBe("https://myapp.com");
    expect(resp.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("sets ACAO to origin (never *) when allowCredentials=true", async () => {
    const config = { ...baseConfig, allowCredentials: true };
    const resp = applyCors(
      new Response("ok"),
      makeReq("https://myapp.com"),
      config,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-origin")).toBe("https://myapp.com");
    expect(resp.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not set ACAO for disallowed origin", () => {
    const resp = applyCors(
      new Response("ok"),
      makeReq("https://evil.com"),
      baseConfig,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("uses wildcard * when allowedOrigins=['*'] and allowCredentials=false", () => {
    const config = { ...baseConfig, allowedOrigins: ["*"] };
    const resp = applyCors(
      new Response("ok"),
      makeReq("https://any-origin.com"),
      config,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("reflects exact origin when allowedOrigins=['*'] and allowCredentials=true", () => {
    const config = { ...baseConfig, allowedOrigins: ["*"], allowCredentials: true };
    const resp = applyCors(
      new Response("ok"),
      makeReq("https://any-origin.com"),
      config,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-origin")).toBe("https://any-origin.com");
    expect(resp.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("sets preflight headers on OPTIONS", () => {
    const resp = applyCors(
      new Response(null, { status: 204 }),
      makeReq("https://myapp.com", "OPTIONS"),
      baseConfig,
      "req-id"
    );
    expect(resp.headers.get("access-control-allow-methods")).toBeTruthy();
    expect(resp.headers.get("access-control-allow-headers")).toBeTruthy();
  });
});
