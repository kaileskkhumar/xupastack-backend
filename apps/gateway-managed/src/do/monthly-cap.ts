/**
 * MonthlyCapDO – global and per-app monthly request counter.
 *
 * Storage key: "month:<YYYY-MM>" → count
 * Use one global DO (idFromName("global")) and one per app (idFromName(slug)).
 */
export class MonthlyCapDO {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const cap = parseInt(url.searchParams.get("cap") ?? "0", 10);
    const action = url.searchParams.get("action") ?? "check";

    const now = new Date();
    const monthKey = `month:${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;

    if (action === "reset") {
      await this.storage.put(monthKey, 0);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // action === "increment"
    const current = ((await this.storage.get<number>(monthKey)) ?? 0) + 1;
    await this.storage.put(monthKey, current);

    const allowed = cap <= 0 || current <= cap;

    return new Response(
      JSON.stringify({ allowed, current, cap, month: monthKey }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
