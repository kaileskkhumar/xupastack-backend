import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isForbiddenHost,
  normalizeOrigin,
  probeSupabase,
  validateSupabaseUrl,
} from "../src/lib/validate-supabase";

// ── isForbiddenHost ────────────────────────────────────────────────────────────

describe("isForbiddenHost — SSRF prevention", () => {
  const blocked = [
    "localhost",
    "LOCALHOST",
    "127.0.0.1",
    "127.0.0.2",
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.20.5.5",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.100.5",
    "169.254.0.1",
    "169.254.169.254", // AWS metadata
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
  ];

  for (const host of blocked) {
    it(`blocks ${host}`, () => {
      expect(isForbiddenHost(host)).toBe(true);
    });
  }

  const allowed = [
    "api.example.com",
    "supabase.co",
    "abcdefgh.supabase.co",
    "192.0.2.1", // TEST-NET-1, not private in the blocked list
    "203.0.113.5",
    "8.8.8.8",
  ];

  for (const host of allowed) {
    it(`allows ${host}`, () => {
      expect(isForbiddenHost(host)).toBe(false);
    });
  }
});

// ── normalizeOrigin ────────────────────────────────────────────────────────────

describe("normalizeOrigin", () => {
  it("extracts https origin from a URL with path", () => {
    const result = normalizeOrigin(
      "https://abcdef.supabase.co/rest/v1/users"
    );
    expect(result).toEqual({ ok: true, origin: "https://abcdef.supabase.co" });
  });

  it("preserves non-default port", () => {
    const result = normalizeOrigin("https://example.com:8443/api");
    expect(result).toEqual({ ok: true, origin: "https://example.com:8443" });
  });

  it("strips trailing slash from bare origin", () => {
    const result = normalizeOrigin("https://example.supabase.co/");
    expect(result).toEqual({ ok: true, origin: "https://example.supabase.co" });
  });

  it("rejects http (non-HTTPS)", () => {
    expect(normalizeOrigin("http://example.supabase.co")).toEqual({ ok: false });
  });

  it("rejects invalid URL", () => {
    expect(normalizeOrigin("not-a-url")).toEqual({ ok: false });
  });

  it("rejects empty string", () => {
    expect(normalizeOrigin("")).toEqual({ ok: false });
  });

  it("rejects private IP", () => {
    expect(normalizeOrigin("https://192.168.1.1")).toEqual({ ok: false });
  });

  it("rejects localhost", () => {
    expect(normalizeOrigin("https://localhost:5432")).toEqual({ ok: false });
  });
});

// ── probeSupabase ──────────────────────────────────────────────────────────────

describe("probeSupabase", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns ok when /auth/v1/health returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/auth/v1/health");
  });

  it("returns ok when /auth/v1/health returns 401 (Supabase requires apikey)", async () => {
    // This is the most common real-world case: Supabase returns 401 without a key.
    // It proves the Supabase auth service is running.
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("falls back to /rest/v1/ when health returns 500", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 }) // /auth/v1/health → 500
      .mockResolvedValueOnce({ ok: true, status: 200 }); // /rest/v1/ → 200
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns not_supabase when reachable but all paths return 5xx", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 });
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toBe("not_supabase");
  });

  it("returns unreachable when all probes throw (timeout/network)", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("network error"));
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toBe("unreachable");
  });

  it("returns not_supabase if first probe is non-2xx and second throws", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 }) // reachable but error
      .mockRejectedValueOnce(new Error("network error"));
    const result = await probeSupabase(
      "https://xyz.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    // We already got a response (non-2xx), so "anyReachable" is true
    expect(result).toBe("not_supabase");
  });
});

// ── validateSupabaseUrl (full pipeline) ───────────────────────────────────────

describe("validateSupabaseUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns ok with normalized host for valid Supabase URL", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await validateSupabaseUrl(
      "https://abcdef.supabase.co/rest/v1/",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({
      ok: true,
      normalizedUpstreamHost: "https://abcdef.supabase.co",
    });
  });

  it("returns invalid_format for http URL", async () => {
    const mockFetch = vi.fn();
    const result = await validateSupabaseUrl(
      "http://project.supabase.co",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "invalid_format" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns invalid_format for localhost", async () => {
    const mockFetch = vi.fn();
    const result = await validateSupabaseUrl(
      "https://localhost:3000",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "invalid_format" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns invalid_format for private IP", async () => {
    const mockFetch = vi.fn();
    const result = await validateSupabaseUrl(
      "https://192.168.0.5/api",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "invalid_format" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns unreachable when probe cannot connect", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await validateSupabaseUrl(
      "https://nonexistent.example.com",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "unreachable" });
  });

  it("returns not_supabase when probe connects but gets 5xx everywhere", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 });
    const result = await validateSupabaseUrl(
      "https://notsupabase.example.com",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "not_supabase" });
  });

  it("normalizes URL with trailing path to bare origin", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await validateSupabaseUrl(
      "https://proj.supabase.co/rest/v1/users?select=*",
      mockFetch as unknown as typeof fetch
    );
    expect(result).toEqual({
      ok: true,
      normalizedUpstreamHost: "https://proj.supabase.co",
    });
  });
});
