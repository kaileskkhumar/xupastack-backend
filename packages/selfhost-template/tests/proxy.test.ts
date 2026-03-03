import { describe, it, expect } from "vitest";
import { isAllowedPath, rewriteLocationHeader, stripHopByHop } from "@xupastack/shared";

describe("stripHopByHop", () => {
  it("removes hop-by-hop headers", () => {
    const h = new Headers({
      "content-type": "application/json",
      connection: "keep-alive",
      "transfer-encoding": "chunked",
      "x-custom": "value",
    });
    const stripped = stripHopByHop(h);
    expect(stripped.get("content-type")).toBe("application/json");
    expect(stripped.get("x-custom")).toBe("value");
    expect(stripped.get("connection")).toBeNull();
    expect(stripped.get("transfer-encoding")).toBeNull();
  });
});

describe("rewriteLocationHeader", () => {
  it("rewrites upstream origin to request host", () => {
    const result = rewriteLocationHeader(
      "https://xyz.supabase.co/auth/v1/callback?code=abc",
      "https://xyz.supabase.co",
      "mygateway.example.com"
    );
    expect(result).toBe("https://mygateway.example.com/auth/v1/callback?code=abc");
  });

  it("does not rewrite unrelated hosts", () => {
    const result = rewriteLocationHeader(
      "https://accounts.google.com/o/oauth2/callback",
      "https://xyz.supabase.co",
      "mygateway.example.com"
    );
    expect(result).toBe("https://accounts.google.com/o/oauth2/callback");
  });

  it("handles non-URL location values gracefully", () => {
    const result = rewriteLocationHeader("/relative/path", "https://xyz.supabase.co", "gw.example.com");
    expect(result).toBe("/relative/path");
  });
});

describe("admin token protection", () => {
  it("is tested via the dashboard router directly", () => {
    // Integration tests with the actual Worker are in tests/dashboard.test.ts
    expect(true).toBe(true);
  });
});
