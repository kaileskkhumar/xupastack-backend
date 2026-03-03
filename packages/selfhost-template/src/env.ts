import type { KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  CONFIG: KVNamespace;
  ADMIN_TOKEN: string;
  ENVIRONMENT?: string;
}
