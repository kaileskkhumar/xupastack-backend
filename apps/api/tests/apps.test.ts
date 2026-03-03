import { describe, it, expect } from "vitest";
import { CreateAppSchema } from "@xupastack/shared";

describe("CreateAppSchema", () => {
  it("accepts valid app creation payload", () => {
    const result = CreateAppSchema.safeParse({
      name: "My App",
      slug: "my-app",
      mode: "managed",
      upstreamHost: "https://xyz.supabase.co",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabledServices).toContain("rest");
      expect(result.data.rateLimitPerMin).toBe(600);
    }
  });

  it("rejects invalid slug characters", () => {
    const result = CreateAppSchema.safeParse({
      name: "Bad Slug",
      slug: "My App!",
      upstreamHost: "https://xyz.supabase.co",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing upstreamHost", () => {
    const result = CreateAppSchema.safeParse({
      name: "No Host",
      slug: "no-host",
    });
    expect(result.success).toBe(false);
  });

  it("rejects upstreamHost that is not a URL", () => {
    const result = CreateAppSchema.safeParse({
      name: "Bad Host",
      slug: "bad-host",
      upstreamHost: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
