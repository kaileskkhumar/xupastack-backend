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
