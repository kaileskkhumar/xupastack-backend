import { describe, it, expect, vi, afterEach } from "vitest";
import { runDiagnostics } from "../src/lib/diagnostics";

type FakeResponse = { status: number; ok: boolean };

/** Build a mock fetch that returns a given response or throws. */
function mockFetch(
  responses: Array<FakeResponse | Error>
): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[call++];
    if (!r) throw new Error("unexpected extra fetch call");
    if (r instanceof Error) throw r;
    return r as unknown as Response;
  }) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

// ── All services healthy ───────────────────────────────────────────────────────

describe("all services healthy", () => {
  it("reports authOk+restOk+storageOk and a success note", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },  // /auth/v1/health
      { status: 200, ok: true },  // /rest/v1/
      { status: 200, ok: true },  // /storage/v1/health
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest", "storage"],
      fetch
    );
    expect(result.authOk).toBe(true);
    expect(result.restOk).toBe(true);
    expect(result.storageOk).toBe(true);
    expect(result.notes).toEqual(["All checked services are reachable."]);
  });
});

// ── Auth failures ──────────────────────────────────────────────────────────────

describe("auth endpoint failures", () => {
  it("authOk false when health returns non-2xx", async () => {
    const fetch = mockFetch([
      { status: 503, ok: false }, // auth not ok
      { status: 200, ok: true },  // rest ok
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],
      fetch
    );
    expect(result.authOk).toBe(false);
    expect(result.restOk).toBe(true);
    expect(result.notes.some((n) => n.includes("503"))).toBe(true);
  });

  it("authOk false on timeout (throws)", async () => {
    const fetch = mockFetch([
      new Error("AbortError"),    // auth times out
      { status: 200, ok: true },  // rest ok
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],
      fetch
    );
    expect(result.authOk).toBe(false);
    expect(result.restOk).toBe(true);
    expect(result.notes.some((n) => /timed out/i.test(n))).toBe(true);
  });
});

// ── REST failures (52x Cloudflare errors) ─────────────────────────────────────

describe("REST 52x Cloudflare origin errors", () => {
  it("restOk false for 521 (Web Server Down)", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },  // auth ok
      { status: 521, ok: false }, // CF 521
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],
      fetch
    );
    expect(result.restOk).toBe(false);
    expect(result.authOk).toBe(true);
    expect(result.notes.some((n) => n.includes("521") || n.includes("routing"))).toBe(true);
  });

  it("restOk false for 522 (Connection Timeout)", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },
      { status: 522, ok: false },
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["rest"],
      fetch
    );
    expect(result.restOk).toBe(false);
  });

  it("restOk true for 401 (auth needed — gateway is working)", async () => {
    const fetch = mockFetch([
      { status: 401, ok: false }, // auth health 401
      { status: 401, ok: false }, // rest 401 — reachable, just needs a key
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["rest"],
      fetch
    );
    // 401 is NOT a 52x — rest is reachable
    expect(result.restOk).toBe(true);
  });

  it("restOk true for 404 (unexpected path, but gateway is routing)", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },
      { status: 404, ok: false },
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["rest"],
      fetch
    );
    expect(result.restOk).toBe(true);
  });
});

// ── Storage skipped when not in enabledServices ────────────────────────────────

describe("storage not in enabledServices", () => {
  it("storageOk is null and only 2 fetch calls are made", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200, ok: true });
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],           // no "storage"
      fn as unknown as typeof fetch
    );
    expect(result.storageOk).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── Storage failures ───────────────────────────────────────────────────────────

describe("storage endpoint failures", () => {
  it("storageOk false for 523", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },  // auth
      { status: 200, ok: true },  // rest
      { status: 523, ok: false }, // storage CF error
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest", "storage"],
      fetch
    );
    expect(result.storageOk).toBe(false);
    expect(result.notes.some((n) => /storage/i.test(n))).toBe(true);
  });

  it("storageOk false on timeout", async () => {
    const fetch = mockFetch([
      { status: 200, ok: true },
      { status: 200, ok: true },
      new Error("timeout"),
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest", "storage"],
      fetch
    );
    expect(result.storageOk).toBe(false);
  });
});

// ── All services unreachable ───────────────────────────────────────────────────

describe("all services unreachable", () => {
  it("returns all false with a gateway-level error note", async () => {
    const fetch = mockFetch([
      new Error("ECONNREFUSED"),
      new Error("ECONNREFUSED"),
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],
      fetch
    );
    expect(result.authOk).toBe(false);
    expect(result.restOk).toBe(false);
    expect(result.notes.some((n) => /could not reach/i.test(n))).toBe(true);
  });

  it("handles 52x for both auth and rest", async () => {
    const fetch = mockFetch([
      { status: 524, ok: false },
      { status: 524, ok: false },
    ]);
    const result = await runDiagnostics(
      "https://slug.gw.xupastack.com",
      ["auth", "rest"],
      fetch
    );
    // auth is false (not .ok), rest is false (52x)
    expect(result.authOk).toBe(false);
    expect(result.restOk).toBe(false);
  });
});

// ── URL normalisation (trailing slash stripped) ────────────────────────────────

describe("gatewayUrl normalisation", () => {
  it("strips trailing slash before building probe URLs", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200, ok: true });
    await runDiagnostics(
      "https://slug.gw.xupastack.com/",  // trailing slash
      ["rest"],
      fn as unknown as typeof fetch
    );
    expect(fn.mock.calls[0]![0]).toBe(
      "https://slug.gw.xupastack.com/auth/v1/health"
    );
  });
});
