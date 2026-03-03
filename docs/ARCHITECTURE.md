# XupaStack Architecture

## Request Flows

### Self-Host Gateway

```
Browser/App
    │
    │  HTTPS  any.path.com/*
    ▼
Cloudflare Edge (user's account)
    │
    ▼
selfhost-template Worker
    │
    ├─ /__xupastack/*  ──────────────────► Dashboard UI (static HTML)
    │                                         └─ PUT /__xupastack/api/config
    │                                              (requires ADMIN_TOKEN)
    │
    └─ /* (proxied paths)
         │
         ├─ Allowlist check (/rest/v1/, /auth/v1/, /storage/v1/, ...)
         ├─ Load config from KV (30s in-memory cache)
         ├─ CORS handling
         ├─ Strict mode (origin / HMAC check)
         ├─ Location header rewrite
         │
         ▼
    Supabase Upstream (user's project)
         │
         ▼
    Response (streaming, no buffer)
         │
         ▼
    Browser/App
```

---

### Managed Gateway

```
Browser/App
    │
    │  HTTPS  <slug>.gw.xupastack.com/*
    ▼
Cloudflare Edge (XupaStack account)
    │
    ▼
gateway-managed Worker
    │
    ├─ Extract slug from subdomain
    ├─ Config cache lookup (memory → KV → D1)
    │     └─ If disabled → 403
    │
    ├─ Monthly cap check ──────────────────► MonthlyCapDO (global + per-app)
    │     └─ If exceeded → 429 {"error":"managed_capacity_reached",...}
    │
    ├─ Rate limit check ───────────────────► RateLimiterDO (per-app, per-minute)
    │     └─ If exceeded → 429
    │
    └─ Proxy (shared proxy logic)
         │
         ▼
    Supabase Upstream
         │
         ▼
    Response (streaming)
         │
         ▼
    Browser/App
```

---

### Console API (Authentication)

```
Browser (xupastack.com)
    │
    │  HTTPS  api.xupastack.com
    ▼
api Worker (Hono)
    │
    ├─ CORS: allow only https://xupastack.com
    │
    ├─ GitHub OAuth flow:
    │    GET /auth/github/start
    │         │
    │         ▼ redirect
    │    GitHub → GET /auth/github/callback?code=&state=
    │         │
    │         ▼
    │    Exchange code → get user → upsert D1 → create session → set cookie
    │
    ├─ Email magic link flow:
    │    POST /auth/email/start  { email }
    │         │
    │         ▼
    │    Rate limit check (IP + email, in-memory)
    │    Generate token → hash → store in D1
    │    Send email via Resend
    │
    │    GET /auth/email/callback?token=
    │         │
    │         ▼
    │    Hash token → look up in D1 → validate single-use + expiry
    │    Upsert user → create session → set cookie → redirect
    │
    └─ Authenticated endpoints (/me, /apps/*, /auth/logout)
         Cookie: xs_session (HttpOnly, Secure, SameSite=Lax, Domain=.xupastack.com)
```

---

### CLI: npx create-xupastack --import <url>

```
$ npx create-xupastack@latest --import https://api.xupastack.com/apps/<id>/config.json

Step 1: Fetch config.json  →  { configUrl, expiresAt }
Step 2: Fetch configUrl    →  GatewayConfig JSON
Step 3: Scaffold selfhost-template into ./xupastack-<slug>/
Step 4: npx wrangler kv namespace create  →  KV ID
Step 5: wrangler kv key put "gateway:config" <json>
Step 6: Generate ADMIN_TOKEN → save to ~/.xupastack/<slug>/admin-token.txt
Step 7: echo $ADMIN_TOKEN | wrangler secret put ADMIN_TOKEN
Step 8: wrangler deploy
Step 9: Print Gateway URL, Dashboard URL, env var snippets
```

---

## Data Stores

| Store | Contents | Access |
|-------|---------|--------|
| D1 (xupastack-db) | users, sessions, email_magic_links, apps | Console API only |
| KV: CONFIG_TOKENS | Short-lived config download tokens (10 min TTL) | Console API write, CLI read |
| KV: APP_CONFIG_CACHE | Cached app configs (60s TTL) | Managed gateway read |
| KV: CONFIG (per self-host) | GatewayConfig JSON | Self-host Worker |
| DurableObject: RateLimiterDO | Per-minute request counters | Managed gateway |
| DurableObject: MonthlyCapDO | Monthly request counters (global + per-app) | Managed gateway |

---

## Packages

```
packages/shared         Shared types, proxy logic, CORS, crypto, email providers
packages/selfhost-template   Worker template deployed into user's CF account
packages/ui-embed       Static dashboard HTML (embedded in selfhost-template)
packages/create-xupastack    CLI: scaffold + deploy + doctor

apps/api                Console API Worker (auth, apps CRUD, config export)
apps/gateway-managed    Managed multi-tenant gateway Worker
```
