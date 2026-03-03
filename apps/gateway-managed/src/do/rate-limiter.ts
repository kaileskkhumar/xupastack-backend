/**
 * RateLimiterDO – per-app fixed-window rate limiting (requests/minute).
 *
 * Storage key: "window:<YYYY-MM-DD-HH-MM>" → count
 * ID pattern:  use DurableObjectNamespace.idFromName(slug)
 */
export class RateLimiterDO {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit") ?? "100";
    const limit = parseInt(limitParam, 10);

    const now = new Date();
    const windowKey = `window:${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}`;

    const count = ((await this.storage.get<number>(windowKey)) ?? 0) + 1;
    await this.storage.put(windowKey, count);

    // Expire old keys (keep only current window + 1 previous)
    void this.pruneOld(windowKey);

    if (count > limit) {
      return new Response(JSON.stringify({ allowed: false, count, limit }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ allowed: true, count, limit }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async pruneOld(currentKey: string): Promise<void> {
    const all = await this.storage.list<number>({ prefix: "window:" });
    const keys = [...all.keys()].sort();
    const keepFrom = keys.indexOf(currentKey) - 1;
    for (let i = 0; i < keepFrom; i++) {
      const key = keys[i];
      if (key !== undefined) await this.storage.delete(key);
    }
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
