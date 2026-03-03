import pc from "picocolors";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const TIMEOUT_MS = 10_000;

async function checkHttp(
  name: string,
  url: string
): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ok = res.status < 500;
    return { name, ok, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message };
  }
}

async function checkWebSocket(gatewayUrl: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const wsUrl =
      gatewayUrl.replace(/^https/, "wss").replace(/^http/, "ws") +
      "/realtime/v1/websocket?apikey=TEST&vsn=1.0.0";

    try {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        resolve({ name: "Realtime WebSocket", ok: false, detail: "Timeout" });
      }, TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        resolve({ name: "Realtime WebSocket", ok: true, detail: "Handshake OK" });
      };

      ws.onerror = (e) => {
        clearTimeout(timer);
        resolve({
          name: "Realtime WebSocket",
          ok: false,
          detail: "Connection error (upstream may not support realtime)",
        });
      };
    } catch (err) {
      resolve({ name: "Realtime WebSocket", ok: false, detail: (err as Error).message });
    }
  });
}

export async function runDoctor(
  gatewayUrl: string
): Promise<void> {
  const base = gatewayUrl.replace(/\/$/, "");
  console.log(pc.bold(`\n  XupaStack Doctor — ${base}\n`));

  const checks: Array<() => Promise<CheckResult>> = [
    () => checkHttp("Gateway health", `${base}/__xupastack/health`),
    () => checkHttp("REST endpoint", `${base}/rest/v1/`),
    () => checkHttp("Auth endpoint", `${base}/auth/v1/`),
    () => checkHttp("Storage endpoint", `${base}/storage/v1/`),
    () => checkWebSocket(base),
  ];

  const results = await Promise.allSettled(checks.map((fn) => fn()));

  let allOk = true;
  for (const result of results) {
    const check: CheckResult =
      result.status === "fulfilled"
        ? result.value
        : { name: "Unknown", ok: false, detail: result.reason as string };

    const icon = check.ok ? pc.green("✅") : pc.red("❌");
    const detail = check.detail ? pc.dim(` (${check.detail})`) : "";
    console.log(`  ${icon}  ${check.name}${detail}`);

    if (!check.ok) allOk = false;
  }

  console.log();

  if (!allOk) {
    console.log(pc.yellow("  Some checks failed. Common fixes:"));
    console.log("  • REST/Auth: ensure the upstream Supabase project is reachable");
    console.log("  • Storage: might require authentication — 400/401 is acceptable");
    console.log(
      "  • WebSocket: only needed if you use Supabase Realtime. Check wrangler.toml enabledServices."
    );
    console.log("  • All: run `npx wrangler tail` to see live error logs");
    console.log();
  } else {
    console.log(pc.green("  All checks passed! Your gateway is healthy."));
    console.log();
  }
}
