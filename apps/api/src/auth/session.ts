import { eq, and, gt } from "drizzle-orm";
import { sessions, users } from "../db/schema";
import type { Db } from "../db/client";
import { generateToken } from "@xupastack/shared";

export const SESSION_COOKIE = "xs_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionUser {
  id: string;
  email: string | null;
  githubId: string | null;
  name: string;
  avatarUrl: string | null;
}

export async function createSession(
  db: Db,
  userId: string
): Promise<string> {
  const id = generateToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await db.insert(sessions).values({ id, userId, expiresAt });
  return id;
}

export async function validateSession(
  db: Db,
  sessionId: string
): Promise<SessionUser | null> {
  const now = Math.floor(Date.now() / 1000);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      githubId: users.githubId,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.userId,
    email: row.email,
    githubId: row.githubId,
    name: row.name,
    avatarUrl: row.avatarUrl,
  };
}

export async function deleteSession(
  db: Db,
  sessionId: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function buildSessionCookie(
  sessionId: string,
  clear = false
): string {
  if (clear) {
    return `${SESSION_COOKIE}=; Domain=.xupastack.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
  return (
    `${SESSION_COOKIE}=${sessionId}; Domain=.xupastack.com; Path=/; ` +
    `HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}
