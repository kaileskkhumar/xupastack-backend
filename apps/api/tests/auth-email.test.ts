import { describe, it, expect, vi, beforeEach } from "vitest";
import { sha256Hex, generateToken } from "@xupastack/shared";

// We test the magic-link helpers in isolation without a real DB.
// For integration tests against a real D1, use wrangler dev or miniflare.

describe("sha256Hex", () => {
  it("produces deterministic hex digests", async () => {
    const h1 = await sha256Hex("hello");
    const h2 = await sha256Hex("hello");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("different inputs produce different digests", async () => {
    const h1 = await sha256Hex("hello");
    const h2 = await sha256Hex("world");
    expect(h1).not.toBe(h2);
  });
});

describe("generateToken", () => {
  it("produces unique tokens", () => {
    const t1 = generateToken(32);
    const t2 = generateToken(32);
    expect(t1).not.toBe(t2);
    expect(t1).toHaveLength(64); // 32 bytes → 64 hex chars
  });
});

describe("session cookie", async () => {
  const { parseSessionCookie } = await import("../src/auth/session");

  it("parses the session cookie from a cookie header", () => {
    const sid = parseSessionCookie("xs_session=abc123; other=xyz");
    expect(sid).toBe("abc123");
  });

  it("returns null when cookie is missing", () => {
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie("other=xyz")).toBeNull();
  });
});
