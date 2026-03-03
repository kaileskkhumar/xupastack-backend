import { eq, and, gt, isNull } from "drizzle-orm";
import { emailMagicLinks, users } from "../db/schema";
import type { Db } from "../db/client";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  generateToken,
  sha256Hex,
  ResendEmailProvider,
  buildMagicLinkEmail,
} from "@xupastack/shared";

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min

// KV-backed rate limiter: shared across all Worker isolates.
// Uses CONFIG_TOKENS KV with an "rl:" prefix to avoid new infrastructure.
async function checkRateLimitKv(
  kv: KVNamespace,
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  const kvKey = `rl:${key}`;
  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) return false;
  // Increment with a sliding expiry — not perfectly atomic but far better than
  // in-memory which resets on every isolate restart or multi-region request.
  await kv.put(kvKey, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

export interface StartMagicLinkOpts {
  db: Db;
  rateLimitKv: KVNamespace;
  email: string;
  ip: string;
  userAgent: string;
  nextPath: string;
  apiBaseUrl: string;
  emailProviderKey: string;
  emailFrom: string;
}

export async function startMagicLink(
  opts: StartMagicLinkOpts
): Promise<{ ok: true } | { error: string; status: number }> {
  const { db, rateLimitKv, email, ip, userAgent, nextPath, apiBaseUrl, emailProviderKey, emailFrom } =
    opts;

  // Rate limit by email (3 per 5 min) and IP (10 per 5 min)
  const [emailOk, ipOk] = await Promise.all([
    checkRateLimitKv(rateLimitKv, `email:${email}`, 3, 5 * 60),
    checkRateLimitKv(rateLimitKv, `ip:${ip}`, 10, 5 * 60),
  ]);
  if (!emailOk || !ipOk) {
    return { error: "rate_limit_exceeded", status: 429 };
  }

  const rawToken = generateToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  const inserted = await db
    .insert(emailMagicLinks)
    .values({
      email: email.toLowerCase().trim(),
      tokenHash,
      expiresAt,
      ip,
      userAgent,
      nextPath,
    })
    .returning({ id: emailMagicLinks.id });

  const linkId = inserted[0]?.id;

  // Build the magic link URL. The token is in the URL, so we add
  // Referrer-Policy: strict-origin-when-cross-origin on the callback response
  // to prevent the token leaking via the Referer header.
  const magicLinkUrl =
    `${apiBaseUrl}/auth/email/callback` +
    `?token=${encodeURIComponent(rawToken)}` +
    `&next=${encodeURIComponent(nextPath)}`;

  const { html, text } = buildMagicLinkEmail(magicLinkUrl);
  const provider = new ResendEmailProvider(emailProviderKey);

  try {
    await provider.send({
      to: email,
      from: emailFrom,
      subject: "Sign in to XupaStack",
      html,
      text,
    });
  } catch (err) {
    console.error("[magic-link] email send failed:", err);
    // Burn the token so it can never be used — the user must request a new one.
    if (linkId) {
      await db
        .update(emailMagicLinks)
        .set({ usedAt: Math.floor(Date.now() / 1000) })
        .where(eq(emailMagicLinks.id, linkId));
    }
    return { error: "email_send_failed", status: 500 };
  }

  return { ok: true };
}

export interface ConsumeMagicLinkOpts {
  db: Db;
  rawToken: string;
}

export interface MagicLinkResult {
  email: string;
  nextPath: string;
}

export async function consumeMagicLink(
  opts: ConsumeMagicLinkOpts
): Promise<MagicLinkResult | { error: string; status: number }> {
  const { db, rawToken } = opts;

  const tokenHash = await sha256Hex(rawToken);
  const now = Math.floor(Date.now() / 1000);

  const rows = await db
    .select()
    .from(emailMagicLinks)
    .where(
      and(
        eq(emailMagicLinks.tokenHash, tokenHash),
        gt(emailMagicLinks.expiresAt, now),
        isNull(emailMagicLinks.usedAt)
      )
    )
    .limit(1);

  const link = rows[0];
  if (!link) {
    return { error: "invalid_or_expired_token", status: 400 };
  }

  // Mark as used
  await db
    .update(emailMagicLinks)
    .set({ usedAt: now })
    .where(eq(emailMagicLinks.id, link.id));

  return { email: link.email, nextPath: link.nextPath };
}

export async function upsertEmailUser(
  db: Db,
  email: string
): Promise<string> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = generateToken(16);
  await db.insert(users).values({
    id,
    email: email.toLowerCase().trim(),
    name: email.split("@")[0] ?? email,
  });
  return id;
}
