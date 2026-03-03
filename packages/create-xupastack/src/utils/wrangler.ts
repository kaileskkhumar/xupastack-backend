import { execSync } from "child_process";

function run(cmd: string, opts?: { cwd?: string }): string {
  return execSync(cmd, {
    encoding: "utf-8" as const,
    stdio: "pipe" as const,
    cwd: opts?.cwd,
  }).trim();
}

export interface KVNamespaceInfo {
  id: string;
  title: string;
}

/** Create a KV namespace and return its ID */
export function createKvNamespace(title: string): string {
  const output = run(`npx wrangler kv namespace create "${title}" --json`);
  const parsed = JSON.parse(output) as { id: string };
  return parsed.id;
}

/** Write a string value into a KV namespace */
export function putKvValue(namespaceId: string, key: string, value: string): void {
  run(`npx wrangler kv key put --namespace-id "${namespaceId}" "${key}" '${value.replace(/'/g, "'\\''")}'`);
}

/** Deploy a Worker from a directory */
export function deployWorker(cwd: string): string {
  return run("npx wrangler deploy", { cwd });
}

/** Get the current account ID */
export function getAccountId(): string | null {
  try {
    const output = run("npx wrangler whoami --json");
    const parsed = JSON.parse(output) as { account_id?: string };
    return parsed.account_id ?? null;
  } catch {
    return null;
  }
}
