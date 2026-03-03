#!/usr/bin/env node
import { Command } from "commander";
import { runImport } from "./commands/import";
import { runDoctor } from "./commands/doctor";

const program = new Command();

program
  .name("create-xupastack")
  .description("XupaStack CLI — scaffold and deploy a self-hosted Supabase gateway")
  .version("0.1.0");

program
  .command("import")
  .alias("default") // npx create-xupastack@latest --import ... runs this
  .description("Import a config and scaffold + deploy a self-host gateway")
  .requiredOption("--import <url-or-path>", "Config URL (from Console) or local file path")
  .option("--out <dir>", "Output directory name (default: xupastack-<slug>)")
  .action(async (opts: { import: string; out?: string }) => {
    await runImport(opts.import, opts.out !== undefined ? { out: opts.out } : {});
  });

program
  .command("doctor")
  .description("Run health checks against a deployed gateway")
  .requiredOption("--gateway <url>", "Gateway base URL (e.g. https://mygw.example.com)")
  .action(async (opts: { gateway: string }) => {
    await runDoctor(opts.gateway);
  });

// Allow: npx create-xupastack@latest --import <url>
// (top-level --import flag maps to the import subcommand)
if (process.argv.slice(2).includes("--import")) {
  const importIdx = process.argv.indexOf("--import");
  process.argv.splice(2, 0, "import");
  // Shift --import into proper position
  if (importIdx >= 0) {
    const val = process.argv.splice(importIdx + 1, 2);
    process.argv.push(...val);
  }
}

program.parse(process.argv);
