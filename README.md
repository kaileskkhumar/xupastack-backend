# XupaStack — Backend

> Open-source Cloudflare gateway that keeps Supabase working when `supabase.co` is blocked by ISPs.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Website:** [xupastack.com](https://xupastack.com) · **Console:** [xupastack.com/console](https://xupastack.com/console)

---

## What is XupaStack?

Supabase has been blocked by Indian ISPs (Jio, Airtel, ACT) since February 2026, affecting 365,000+ developers. XupaStack is a transparent proxy that routes Supabase traffic through Cloudflare Workers — one URL change, no code changes, no key changes.

- **Self-host** — deploy to your own Cloudflare account (free tier works)
- **Managed** — use our hosted gateway at `{slug}-gw.xupastack.com`

---

## Monorepo Structure

```
apps/
  api/                  # REST API (Hono + Cloudflare Workers D1)
  gateway-managed/      # Managed gateway (Cloudflare Workers + Durable Objects)

packages/
  shared/               # Proxy logic, schemas, CORS — shared across apps
  selfhost-template/    # Deploy-your-own gateway template
  create-xupastack/     # CLI: npx create-xupastack
  ui-embed/             # Embedded dashboard UI for self-hosted gateways
```

---

## Self-Host Quickstart

The fastest way to get your own gateway running:

```bash
npx create-xupastack
```

Or deploy manually from `packages/selfhost-template` — see its [README](packages/selfhost-template/README.md).

---

## Development

**Requirements:** Node 18+, pnpm, Wrangler CLI

```bash
# Install dependencies
pnpm install

# Run API locally
cd apps/api && wrangler dev

# Run managed gateway locally
cd apps/gateway-managed && wrangler dev

# Run tests
pnpm test
```

---

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[AGPL-3.0](LICENSE) — free to use, modify, and self-host. If you run a modified version as a public service, you must open-source your changes.
