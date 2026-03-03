# XupaStack Deploy Runbook

## Prerequisites

- Cloudflare account with Workers, D1, KV, and Durable Objects enabled
- `wrangler` CLI authenticated: `npx wrangler login`
- pnpm ≥ 9 and Node.js ≥ 20

---

## Part 1 — Managed Gateway (api.xupastack.com + *.gw.xupastack.com)

### 1. DNS & Zone setup (Cloudflare dashboard)

1. Add `xupastack.com` to your Cloudflare account
2. Create DNS records:
   - `api.xupastack.com` → proxied (Worker route handles it)
   - `*.gw.xupastack.com` → proxied (wildcard; Worker route handles it)

### 2. Create D1 database

```bash
npx wrangler d1 create xupastack-db
# Copy the database_id into:
#   apps/api/wrangler.toml → [[d1_databases]] database_id
#   apps/gateway-managed/wrangler.toml → [[d1_databases]] database_id
```

### 3. Run migrations

```bash
npx wrangler d1 migrations apply xupastack-db --remote
# (from repo root, wrangler auto-discovers apps/api/drizzle/migrations/)
cd apps/api
npx wrangler d1 migrations apply xupastack-db
```

### 4. Create KV namespaces

```bash
# For Console API (config tokens)
npx wrangler kv namespace create "xupastack-config-tokens"
# Copy id → apps/api/wrangler.toml [[kv_namespaces]] id

# For Managed Gateway (app config cache)
npx wrangler kv namespace create "xupastack-gateway-cache"
# Copy id → apps/gateway-managed/wrangler.toml [[kv_namespaces]] id
```

### 5. Set secrets

```bash
cd apps/api

# GitHub OAuth app credentials (create at https://github.com/settings/apps)
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# Random 32-char string
npx wrangler secret put SESSION_SECRET

# Resend API key (https://resend.com)
npx wrangler secret put EMAIL_PROVIDER_KEY

# "From" address, e.g. "XupaStack <noreply@xupastack.com>"
npx wrangler secret put EMAIL_FROM
```

### 6. Deploy Console API

```bash
cd apps/api
npx wrangler deploy
```

Then in the Cloudflare dashboard:
- Workers → Routes → Add route: `api.xupastack.com/*` → `xupastack-api`

### 7. Deploy Managed Gateway

```bash
cd apps/gateway-managed
npx wrangler deploy
```

Then in the Cloudflare dashboard:
- Workers → Routes → Add route: `*.gw.xupastack.com/*` → `xupastack-gateway-managed`

### 8. Verify

```bash
curl https://api.xupastack.com/health
# → {"ok":true,"ts":"..."}

curl https://testslug.gw.xupastack.com/rest/v1/
# → {"error":"app_not_found"} (expected until an app is created)
```

---

## Part 2 — Self-Host Gateway (user's Cloudflare account, via CLI)

Users run:

```bash
npx create-xupastack@latest --import https://api.xupastack.com/apps/<id>/config.json
```

This performs all steps automatically. See [packages/create-xupastack/README.md] for details.

### Manual steps (if CLI fails)

1. Copy `packages/selfhost-template/` to a new directory
2. Update `wrangler.toml`: worker name, KV namespace ID
3. Create KV namespace: `npx wrangler kv namespace create "xupastack-myapp-config"`
4. Write config: `npx wrangler kv key put --namespace-id <id> "gateway:config" '<json>'`
5. Set secret: `echo "<token>" | npx wrangler secret put ADMIN_TOKEN`
6. Deploy: `npx wrangler deploy`

---

## Part 3 — GitHub OAuth Setup

1. Create a GitHub OAuth App at https://github.com/settings/applications/new
   - Homepage URL: `https://xupastack.com`
   - Callback URL: `https://api.xupastack.com/auth/github/callback`
2. Copy Client ID and Secret into the secrets above

---

## Part 4 — Email (Resend)

1. Sign up at https://resend.com
2. Verify your sending domain
3. Create an API key and set `EMAIL_PROVIDER_KEY`
4. Set `EMAIL_FROM` to a verified sender address

---

## Verification Checklist

- [ ] `GET https://api.xupastack.com/health` → 200
- [ ] GitHub OAuth flow completes and sets session cookie
- [ ] Email magic link flow delivers email and creates session
- [ ] `POST /apps` creates an app with a managed proxy URL
- [ ] `GET /apps/:id/config.json` returns `{configUrl, expiresAt}`
- [ ] `GET /apps/:id/config?token=...` returns raw GatewayConfig
- [ ] Managed gateway routes `<slug>.gw.xupastack.com` to upstream
- [ ] Monthly cap response: `{"error":"managed_capacity_reached",...}`
- [ ] Self-host template deploys and `/__xupastack` serves dashboard
