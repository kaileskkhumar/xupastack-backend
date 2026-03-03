import { describe, it, expect } from "vitest";

// Unit test the cap response format
describe("managed_capacity_reached response", () => {
  it("produces the expected JSON shape", () => {
    const payload = {
      error: "managed_capacity_reached",
      message:
        "Managed capacity reached. Switch to self-host mode (free) to keep your app online.",
      self_host_url: "https://xupastack.com/quickstart",
    };

    expect(payload.error).toBe("managed_capacity_reached");
    expect(payload.self_host_url).toContain("quickstart");
    expect(payload.message).toContain("self-host");
  });
});

describe("rewriteLocationHeader", () => {
  it("rewrites upstream host in Location header", async () => {
    const { rewriteLocationHeader } = await import("@xupastack/shared");
    const rewritten = rewriteLocationHeader(
      "https://xyz.supabase.co/auth/v1/callback",
      "https://xyz.supabase.co",
      "myslug.gw.xupastack.com"
    );
    expect(rewritten).toBe("https://myslug.gw.xupastack.com/auth/v1/callback");
  });

  it("leaves non-upstream locations unchanged", async () => {
    const { rewriteLocationHeader } = await import("@xupastack/shared");
    const original = "https://other-host.com/callback";
    const rewritten = rewriteLocationHeader(
      original,
      "https://xyz.supabase.co",
      "myslug.gw.xupastack.com"
    );
    expect(rewritten).toBe(original);
  });
});
