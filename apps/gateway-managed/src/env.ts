import type {
  D1Database,
  KVNamespace,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  APP_CONFIG_CACHE: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  MONTHLY_CAP: DurableObjectNamespace;
  GLOBAL_CAP_PER_MONTH: string;
  PER_APP_CAP_PER_MONTH: string;
  SELF_HOST_QUICKSTART_URL: string;
}
