# XupaStack Security Model

## Threat Model

### Assets

- Supabase upstream host + anon key (used by end users)
- XupaStack session cookies (auth)
- Email magic link tokens
- ADMIN_TOKEN for self-host dashboard
- GitHub OAuth credentials

### Threats

| Threat | Mitigation |
|--------|-----------|
| Key exfiltration | We never store Supabase anon keys; only `upstreamHost` |
| Payload inspection | No body logging in gateway or API. Workers log errors only. |
| CSRF on console API | CORS origin allowlist enforced (`CONSOLE_ORIGIN` = `https://xupastack.com` only) |
| Session fixation | Session IDs are cryptographically random (32-byte hex) |
| Magic link replay | Tokens are single-use; marked `used_at` immediately on consumption |
| Magic link theft | Tokens expire in 15 min; only SHA-256 hash stored in DB (raw token only in email) |
| Origin spoofing (managed) | Strict mode enforces origin allowlist; server-to-server uses HMAC-SHA256 |
| Admin dashboard abuse | ADMIN_TOKEN required for PUT config; token is stored only in `~/.xupastack/` |
| Path traversal (gateway) | Strict allowlist: only `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/functions/v1/`, `/graphql/v1/`, `/realtime/v1/websocket` |
| Open redirect (Location) | Location headers rewritten to strip upstream host |
| DoS via managed gateway | Per-app rate limit (DO) + monthly caps (DO) |
| Credential leakage | `allowCredentials=true` always reflects exact origin, never `*` |

---

## Self-Host vs Managed Trust

### Self-Host (recommended)

- Gateway runs in **your own Cloudflare account**
- Config stored in **your own KV namespace**
- ADMIN_TOKEN stored only in `~/.xupastack/<slug>/admin-token.txt`
- Zero operator trust required after deployment
- Upstream Supabase key never leaves your browser

### Managed

- Gateway runs in operator's (XupaStack) Cloudflare account
- Operator can see aggregate request metrics (status buckets only)
- No request/response body logging ever
- Subject to monthly caps (enforced server-side)
- Suitable for quick demos and MVPs

---

## Logging Policy

- **Gateway** (both self-host and managed): no request/response body logging
- Errors are logged via Cloudflare Workers `console.error()`
- **Managed gateway** logs: aggregate per-app status bucket counts (2xx/4xx/5xx)
- **Console API**: logs auth events (login/logout, no PII in log messages)

---

## HMAC Strict Mode

When `strictMode: true`, server-to-server requests must include:

```
x-xupastack-ts: <unix timestamp (seconds)>
x-xupastack-sig: <HMAC-SHA256(secret, ts + "\n" + METHOD + "\n" + path + "\n" + bodyHash)>
```

Signatures are valid for 300 seconds. Use `buildHmacSignature()` from `@xupastack/shared`.

---

## Responsible Disclosure

Please report security issues to security@xupastack.com. We aim to respond within 48 hours.
