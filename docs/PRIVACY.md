# XupaStack Privacy Policy

## What We Store (Console API)

| Data | Purpose | Retention |
|------|---------|-----------|
| GitHub user ID, display name, avatar URL | Account creation | Until account deleted |
| Email address (if email auth) | Account creation | Until account deleted |
| Session IDs (hashed by D1) | Auth | 30 days or until logout |
| Email magic link token hash | Single-use auth | 15 min (auto-expired) |
| App configuration (name, slug, upstreamHost, CORS settings) | Gateway routing | Until app deleted |

**We never store:**
- Supabase anon keys or service-role keys
- Request/response bodies from the gateway
- End-user data passing through the gateway

---

## Managed Gateway Metrics

The managed gateway collects only **aggregate** counters:

- Monthly request count per app (for cap enforcement)
- No IP addresses, no request bodies, no response bodies
- Status-bucket counts (2xx/3xx/4xx/5xx) per app per hour

These counters are stored in Cloudflare Durable Objects and automatically reset monthly.

---

## Self-Host Mode

When you self-host:
- Your gateway runs in **your** Cloudflare account
- XupaStack collects **nothing** from self-hosted gateways
- Config is stored in your KV namespace

---

## Third-Party Services

| Service | Purpose |
|---------|---------|
| Cloudflare Workers/D1/KV | Infrastructure |
| GitHub OAuth | Authentication |
| Resend | Transactional email |

---

## Data Deletion

To delete your account and all associated data, contact support@xupastack.com or use the account deletion option in the console.
