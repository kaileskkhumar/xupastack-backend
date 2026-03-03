/**
 * Gateway diagnostics — pure logic, no framework coupling.
 * All fetch calls are injectable so the suite can run without real HTTP.
 */

export interface DiagnosticsResult {
  authOk: boolean;
  restOk: boolean;
  /** null when storage is not in the app's enabledServices list */
  storageOk: boolean | null;
  notes: string[];
}

interface ProbeResult {
  status: number;
  ok: boolean;
}

/** Single probe: returns null on network error / timeout. */
async function probeOne(
  url: string,
  fetchFn: typeof fetch
): Promise<ProbeResult | null> {
  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "xupastack-diagnostics/1.0" },
    });
    return { status: res.status, ok: res.ok };
  } catch {
    return null;
  }
}

/**
 * Cloudflare edge returns 52x codes when the origin is unreachable.
 * 520 Unknown Error, 521 Web Server Down, 522 Timed Out,
 * 523 Origin Unreachable, 524 Gateway Timeout, 525–527 TLS/SSL errors.
 */
function isCfOriginError(status: number): boolean {
  return status >= 520 && status <= 527;
}

export async function runDiagnostics(
  gatewayUrl: string,
  enabledServices: string[],
  fetchFn: typeof fetch = fetch
): Promise<DiagnosticsResult> {
  const base = gatewayUrl.replace(/\/+$/, "");
  const storageEnabled = enabledServices.includes("storage");

  // Run all probes in parallel — total wall-time ~3 s
  const [auth, rest, storage] = await Promise.all([
    probeOne(`${base}/auth/v1/health`, fetchFn),
    probeOne(`${base}/rest/v1/`, fetchFn),
    storageEnabled
      ? probeOne(`${base}/storage/v1/health`, fetchFn)
      : Promise.resolve(null),
  ]);

  const authOk = auth?.ok === true;
  const restOk = rest !== null && !isCfOriginError(rest.status);
  const storageOk = storageEnabled
    ? storage !== null && !isCfOriginError((storage as ProbeResult).status)
    : null;

  const notes: string[] = [];

  if (!authOk && !restOk) {
    notes.push(
      "Gateway could not reach any Supabase service. " +
        "Verify your upstream URL is correct and the project is active."
    );
  } else {
    if (!authOk) {
      notes.push(
        auth === null
          ? "Auth service timed out (GoTrue may be starting up)."
          : `Auth health check returned ${auth.status}. GoTrue may be disabled.`
      );
    }
    if (!restOk) {
      notes.push(
        rest === null
          ? "REST API timed out."
          : `REST API returned ${rest.status} — gateway may not be routing correctly.`
      );
    }
  }

  if (storageEnabled && storageOk === false) {
    notes.push(
      storage === null
        ? "Storage service timed out."
        : `Storage returned ${(storage as ProbeResult).status}. Storage may be disabled.`
    );
  }

  if (authOk && restOk && (storageOk === true || storageOk === null)) {
    notes.push("All checked services are reachable.");
  }

  return { authOk, restOk, storageOk, notes };
}
