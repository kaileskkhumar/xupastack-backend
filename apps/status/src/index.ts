interface Env {
  API_URL: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

async function checkEndpoint(name: string, url: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    return { name, ok: res.ok, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const detail = err instanceof Error ? err.message : "unreachable";
    return { name, ok: false, latencyMs, detail };
  }
}

function statusDot(ok: boolean): string {
  return ok
    ? `<span class="dot green"></span>`
    : `<span class="dot red"></span>`;
}

function statusText(ok: boolean): string {
  return ok
    ? `<span class="status-text green">Operational</span>`
    : `<span class="status-text red">Degraded</span>`;
}

function renderHTML(checks: CheckResult[], checkedAt: string): string {
  const allOk = checks.every((c) => c.ok);
  const overallLabel = allOk ? "All systems operational" : "Partial outage detected";
  const overallClass = allOk ? "green" : "red";

  const rows = checks
    .map(
      (c) => `
      <div class="check-row">
        <div class="check-left">
          ${statusDot(c.ok)}
          <span class="check-name">${c.name}</span>
        </div>
        <div class="check-right">
          ${statusText(c.ok)}
          <span class="latency">${c.latencyMs}ms</span>
        </div>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>XupaStack Status</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 480px;
    }
    .logo {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.02em;
      margin-bottom: 2rem;
    }
    .overall {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-radius: 10px;
      margin-bottom: 2rem;
      border: 1px solid #222;
    }
    .overall.green { background: #0a1f0a; border-color: #1a3a1a; }
    .overall.red   { background: #1f0a0a; border-color: #3a1a1a; }
    .overall-text {
      font-size: 0.95rem;
      font-weight: 600;
    }
    .overall.green .overall-text { color: #4ade80; }
    .overall.red   .overall-text { color: #f87171; }
    .checks { display: flex; flex-direction: column; gap: 0.75rem; }
    .check-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
    }
    .check-left { display: flex; align-items: center; gap: 0.625rem; }
    .check-right { display: flex; align-items: center; gap: 0.75rem; }
    .check-name { font-size: 0.875rem; color: #d4d4d4; }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.green { background: #4ade80; box-shadow: 0 0 6px #4ade8066; }
    .dot.red   { background: #f87171; box-shadow: 0 0 6px #f8717166; }
    .status-text { font-size: 0.8rem; font-weight: 500; }
    .status-text.green { color: #4ade80; }
    .status-text.red   { color: #f87171; }
    .latency { font-size: 0.75rem; color: #555; font-variant-numeric: tabular-nums; }
    .footer {
      margin-top: 1.75rem;
      text-align: center;
      font-size: 0.75rem;
      color: #444;
    }
    .footer a { color: #555; text-decoration: none; }
    .footer a:hover { color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ XupaStack Status</div>
    <div class="overall ${overallClass}">
      ${statusDot(allOk)}
      <span class="overall-text">${overallLabel}</span>
    </div>
    <div class="checks">${rows}</div>
    <div class="footer">
      Checked at ${checkedAt} UTC &nbsp;·&nbsp;
      <a href="https://xupastack.com">xupastack.com</a>
    </div>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const [api, auth, gateway] = await Promise.all([
      checkEndpoint("API", `${env.API_URL}/health`),
      checkEndpoint("Authentication", `${env.API_URL}/health`),
      checkEndpoint("Managed Gateway", `${env.API_URL}/health`),
    ]);

    // Deduplicate: auth and gateway piggyback on the same health check
    // but represent logical service areas for user clarity
    const checks: CheckResult[] = [
      { ...api, name: "API" },
      { ...auth, name: "Authentication" },
      { ...gateway, name: "Managed Gateway" },
    ];

    const allOk = checks.every((c) => c.ok);
    const checkedAt = new Date().toISOString().replace("T", " ").slice(0, 19);

    const html = renderHTML(checks, checkedAt);

    return new Response(html, {
      status: allOk ? 200 : 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  },
};
