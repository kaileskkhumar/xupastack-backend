import { describe, it, expect } from "vitest";
import { dashboardRouter } from "../src/dashboard";

// Minimal in-memory KV mock for testing without Miniflare
function makeEnv(config?: object, adminToken = "test-secret") {
  const store = new Map<string, string>();
  if (config) {
    store.set("gateway:config", JSON.stringify(config));
  }
  return {
    CONFIG: {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    },
    ADMIN_TOKEN: adminToken,
  };
}

const validConfig = {
  upstreamHost: "https://xyz.supabase.co",
  allowedOrigins: ["*"],
  allowCredentials: false,
  enabledServices: ["rest", "auth"],
  rateLimitPerMin: 100,
  strictMode: false,
  rewriteLocationHeaders: true,
};

describe("GET /__xupastack/health", () => {
  it("returns ok:true", async () => {
    const req = new Request("http://worker/__xupastack/health");
    const res = await dashboardRouter.fetch(
      new Request("http://worker/health"),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe("GET /__xupastack/api/config", () => {
  it("returns 404 when config is not set", async () => {
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config"),
      makeEnv()
    );
    expect(res.status).toBe(404);
  });

  it("returns config JSON when set", async () => {
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config"),
      makeEnv(validConfig)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as typeof validConfig;
    expect(body.upstreamHost).toBe(validConfig.upstreamHost);
  });
});

describe("PUT /__xupastack/api/config", () => {
  it("requires Authorization header", async () => {
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validConfig),
      }),
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it("rejects wrong token", async () => {
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify(validConfig),
      }),
      makeEnv(undefined, "correct-token")
    );
    expect(res.status).toBe(401);
  });

  it("accepts valid config with correct token", async () => {
    const env = makeEnv();
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: JSON.stringify(validConfig),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("rejects invalid config shape", async () => {
    const res = await dashboardRouter.fetch(
      new Request("http://worker/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: JSON.stringify({ invalid: true }),
      }),
      makeEnv()
    );
    expect(res.status).toBe(400);
  });
});
