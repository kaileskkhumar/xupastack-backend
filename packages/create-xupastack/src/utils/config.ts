import type { GatewayConfig } from "@xupastack/shared";
import { GatewayConfigSchema } from "@xupastack/shared";

export interface ConfigImportResult {
  config: GatewayConfig;
  slug: string;
}

/** Fetch config from a configUrl (returned by the Console API) */
export async function fetchConfig(configUrl: string): Promise<GatewayConfig> {
  const res = await fetch(configUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch config (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const parsed = GatewayConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid config: ${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  return parsed.data;
}

/**
 * Resolve an --import value which may be:
 *  - a URL returning { configUrl, expiresAt }  (Console API /apps/:id/config.json)
 *  - a URL returning raw GatewayConfig JSON
 *  - a local file path
 */
export async function resolveImport(
  importValue: string
): Promise<{ configUrl: string; config: GatewayConfig }> {
  let configUrl = importValue;
  let raw: unknown;

  if (importValue.startsWith("http://") || importValue.startsWith("https://")) {
    const res = await fetch(importValue);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${importValue}`);
    }
    raw = await res.json();

    // If the response contains a configUrl property, follow it
    if (
      raw &&
      typeof raw === "object" &&
      "configUrl" in raw &&
      typeof (raw as Record<string, unknown>).configUrl === "string"
    ) {
      configUrl = (raw as { configUrl: string }).configUrl;
      const configRes = await fetch(configUrl);
      if (!configRes.ok) {
        throw new Error(`HTTP ${configRes.status} fetching config from ${configUrl}`);
      }
      raw = await configRes.json();
    }
  } else {
    // Local file
    const { readFile } = await import("fs/promises");
    const content = await readFile(importValue, "utf-8");
    raw = JSON.parse(content);
  }

  const parsed = GatewayConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config: ${JSON.stringify(parsed.error.issues, null, 2)}`);
  }

  return { configUrl, config: parsed.data };
}
