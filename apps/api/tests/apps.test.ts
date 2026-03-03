import { describe, it, expect } from "vitest";
import { CreateAppSchema, UpdateAppSchema } from "@xupastack/shared";

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

  it("rejects wildcard allowedOrigins combined with allowCredentials:true", () => {
    const result = CreateAppSchema.safeParse({
      name: "Bad CORS",
      slug: "bad-cors",
      upstreamHost: "https://xyz.supabase.co",
      allowedOrigins: ["*"],
      allowCredentials: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts allowCredentials:true with specific origins", () => {
    const result = CreateAppSchema.safeParse({
      name: "Good CORS",
      slug: "good-cors",
      upstreamHost: "https://xyz.supabase.co",
      allowedOrigins: ["https://myapp.com"],
      allowCredentials: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts wildcard allowedOrigins when allowCredentials is false", () => {
    const result = CreateAppSchema.safeParse({
      name: "Open CORS",
      slug: "open-cors",
      upstreamHost: "https://xyz.supabase.co",
      allowedOrigins: ["*"],
      allowCredentials: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateAppSchema", () => {
  it("rejects wildcard allowedOrigins combined with allowCredentials:true", () => {
    const result = UpdateAppSchema.safeParse({
      allowedOrigins: ["*"],
      allowCredentials: true,
    });
    expect(result.success).toBe(false);
  });
});
