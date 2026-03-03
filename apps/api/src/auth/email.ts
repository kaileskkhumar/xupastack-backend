import { eq, and, gt, isNull } from "drizzle-orm";
import { emailMagicLinks, users } from "../db/schema";
import type { Db } from "../db/client";
import {
  generateToken,
  sha256Hex,
  ResendEmailProvider,
  buildMagicLinkEmail,
} from "@xupastack/shared";

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min

// Simple in-memory rate limit: max 3 links per email/IP per 5 min
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxPerWindow = 3): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true; // ok
  }

  if (entry.count >= maxPerWindow) return false; // limited
  entry.count++;
  return true;
}

export interface StartMagicLinkOpts {
  db: Db;
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
  const { db, email, ip, userAgent, nextPath, apiBaseUrl, emailProviderKey, emailFrom } =
    opts;

  // Rate limit by IP and email
  if (!checkRateLimit(`ip:${ip}`) || !checkRateLimit(`email:${email}`)) {
    return { error: "rate_limit_exceeded", status: 429 };
  }

  const rawToken = generateToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  await db.insert(emailMagicLinks).values({
    email: email.toLowerCase().trim(),
    tokenHash,
    expiresAt,
    ip,
    userAgent,
    nextPath,
  });

  const magicLinkUrl =
    `${apiBaseUrl}/auth/email/callback` +
    `?token=${encodeURIComponent(rawToken)}` +
    `&next=${encodeURIComponent(nextPath)}`;

  const { html, text } = buildMagicLinkEmail(magicLinkUrl);
  const provider = new ResendEmailProvider(emailProviderKey);

  await provider.send({
    to: email,
    from: emailFrom,
    subject: "Sign in to XupaStack",
    html,
    text,
  });

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
