import { mkdir, writeFile, readFile, cp } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";
import ora from "ora";
import pc from "picocolors";
import { resolveImport } from "../utils/config";
import { createKvNamespace, putKvValue, deployWorker } from "../utils/wrangler";
import { generateToken } from "@xupastack/shared";

// From dist/index.js → ../../ → packages/ → selfhost-template/
const SELFHOST_TEMPLATE_DIR = resolve(
  new URL(".", import.meta.url).pathname,
  "../../selfhost-template"
);

export async function runImport(importValue: string, opts: { out?: string }): Promise<void> {
  console.log(pc.bold("\n  XupaStack Self-Host Setup\n"));

  // ── Step 1: Download config ──────────────────────────────────────────────
  const spinner = ora("Downloading config…").start();
  let config: Awaited<ReturnType<typeof resolveImport>>["config"];
  let slug: string;

  try {
    const result = await resolveImport(importValue);
    config = result.config;
    // Derive slug from the hostname of upstreamHost
    slug = new URL(config.upstreamHost).hostname.split(".")[0] ?? "myapp";
    spinner.succeed(`Config downloaded (upstream: ${config.upstreamHost})`);
  } catch (err) {
    spinner.fail(`Failed to download config: ${(err as Error).message}`);
    process.exit(1);
  }

  const projectName = opts.out ?? `xupastack-${slug}`;
  const outDir = resolve(process.cwd(), projectName);

  // ── Step 2: Scaffold selfhost-template ────────────────────────────────────
  spinner.start("Scaffolding gateway project…");
  try {
    if (existsSync(outDir)) {
      spinner.warn(`Directory ${outDir} already exists, skipping scaffold`);
    } else {
      await cp(SELFHOST_TEMPLATE_DIR, outDir, {
        recursive: true,
        filter: (src) => !src.includes(`${sep}node_modules${sep}`) && !src.endsWith(`${sep}node_modules`),
      });
      // Update wrangler.toml worker name
      const wranglerPath = join(outDir, "wrangler.toml");
      let wrangler = await readFile(wranglerPath, "utf-8");
      wrangler = wrangler.replace(
        "xupastack-selfhost-REPLACE_SLUG",
        `xupastack-selfhost-${slug}`
      );
      await writeFile(wranglerPath, wrangler);
    }
    spinner.succeed(`Project scaffolded at ${pc.cyan(outDir)}`);
  } catch (err) {
    spinner.fail(`Scaffold failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Step 3: Create KV namespace ──────────────────────────────────────────
  spinner.start("Creating KV namespace…");
  let kvId: string;
  try {
    kvId = createKvNamespace(`xupastack-${slug}-config`);
    // Update wrangler.toml with the real KV ID
    const wranglerPath = join(outDir, "wrangler.toml");
    let wrangler = await readFile(wranglerPath, "utf-8");
    wrangler = wrangler.replace("REPLACE_WITH_YOUR_KV_ID", kvId);
    await writeFile(wranglerPath, wrangler);
    spinner.succeed(`KV namespace created (${pc.cyan(kvId)})`);
  } catch (err) {
    spinner.fail(`KV creation failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Step 4: Write config to KV ───────────────────────────────────────────
  spinner.start("Writing config to KV…");
  try {
    putKvValue(kvId, "gateway:config", JSON.stringify(config));
    spinner.succeed("Config written to KV");
  } catch (err) {
    spinner.fail(`KV write failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Step 5: Generate ADMIN_TOKEN ─────────────────────────────────────────
  spinner.start("Generating ADMIN_TOKEN…");
  const adminToken = generateToken(32);
  const tokenDir = join(homedir(), ".xupastack", slug);
  const tokenFile = join(tokenDir, "admin-token.txt");
  try {
    await mkdir(tokenDir, { recursive: true });
    await writeFile(tokenFile, adminToken, { mode: 0o600 });
    spinner.succeed(`ADMIN_TOKEN saved to ${pc.cyan(tokenFile)} (printed once below)`);
  } catch (err) {
    spinner.warn(`Could not save token file: ${(err as Error).message}`);
  }

  // Set secret via wrangler
  spinner.start("Setting ADMIN_TOKEN secret…");
  try {
    const { execSync } = await import("child_process");
    execSync(
      `echo "${adminToken}" | npx wrangler secret put ADMIN_TOKEN`,
      { cwd: outDir, stdio: "pipe" }
    );
    spinner.succeed("ADMIN_TOKEN secret set");
  } catch (err) {
    spinner.warn(`Could not set secret automatically. Run manually:\n  echo "${adminToken}" | npx wrangler secret put ADMIN_TOKEN`);
  }

  // ── Step 6: Deploy with wrangler ─────────────────────────────────────────
  spinner.start("Deploying Worker…");
  let gatewayUrl: string;
  try {
    const output = deployWorker(outDir);
    // Parse the deployed URL from wrangler output
    const match = output.match(/https?:\/\/[^\s]+\.workers\.dev/);
    gatewayUrl = match?.[0] ?? `https://xupastack-selfhost-${slug}.YOUR_SUBDOMAIN.workers.dev`;
    spinner.succeed(`Worker deployed: ${pc.cyan(gatewayUrl)}`);
  } catch (err) {
    spinner.fail(`Deployment failed: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  }

  // ── Step 7: Print summary ─────────────────────────────────────────────────
  console.log(`
${pc.bold("  ✅ XupaStack Self-Host deployed successfully!")}

  ${pc.bold("Gateway URL:")}     ${pc.cyan(gatewayUrl)}
  ${pc.bold("Dashboard URL:")}   ${pc.cyan(gatewayUrl + "/__xupastack")}
  ${pc.bold("Admin Token:")}     ${pc.yellow(adminToken)}
                    ${pc.dim("(saved to " + tokenFile + ")")}

  ${pc.bold("Use these env vars in your frontend:")}

    SUPABASE_URL=${pc.cyan(gatewayUrl)}
    SUPABASE_ANON_KEY=<your-supabase-anon-key>

  ${pc.bold("To run health check:")}
    ${pc.dim("npx create-xupastack doctor --gateway " + gatewayUrl)}
`);
}
