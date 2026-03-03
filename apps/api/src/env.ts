import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  CONFIG_TOKENS: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  EMAIL_PROVIDER_KEY: string;
  EMAIL_FROM: string;
  ENVIRONMENT: string;
  CONSOLE_ORIGIN: string;
  API_BASE_URL: string;
  MANAGED_GW_BASE: string;
}

const REQUIRED_STRING_KEYS: (keyof Env)[] = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "SESSION_SECRET",
  "EMAIL_PROVIDER_KEY",
  "EMAIL_FROM",
  "CONSOLE_ORIGIN",
  "API_BASE_URL",
  "MANAGED_GW_BASE",
];

/** Throws with a clear message if any required secret is missing or empty. */
export function validateEnv(env: Env): void {
  const missing: string[] = [];
  for (const key of REQUIRED_STRING_KEYS) {
    const val = env[key];
    if (typeof val !== "string" || val.trim() === "") {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty required environment variables: ${missing.join(", ")}`
    );
  }
}
