import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { Db } from "../db/client";
import { generateToken } from "@xupastack/shared";
import type { KVNamespace } from "@cloudflare/workers-types";

const STATE_TTL_SECONDS = 10 * 60; // 10 min

export async function buildGithubAuthUrl(
  clientId: string,
  next: string,
  baseUrl: string,
  kv: KVNamespace
): Promise<{ url: string; state: string }> {
  const state = generateToken(16);
  const callbackUrl = `${baseUrl}/auth/github/callback`;

  // Store state in KV so any Worker isolate can validate it
  await kv.put(`ghstate:${state}`, next, { expirationTtl: STATE_TTL_SECONDS });

  const url =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&scope=${encodeURIComponent("read:user user:email")}` +
    `&state=${encodeURIComponent(state)}`;

  return { url, state };
}

export async function consumeState(
  state: string,
  kv: KVNamespace
): Promise<string | null> {
  const key = `ghstate:${state}`;
  const next = await kv.get(key);
  if (!next) return null;
  await kv.delete(key); // single-use
  return next;
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`GitHub OAuth error: ${data.error ?? "unknown"}`);
  }
  return data.access_token;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export async function getGithubUser(token: string): Promise<GithubUser> {
  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "xupastack" },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "xupastack" },
    }),
  ]);

  if (!userRes.ok) throw new Error(`GitHub user fetch failed: ${userRes.status}`);

  const ghUser = (await userRes.json()) as GithubUser;

  // Try to get primary verified email
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified);
    if (primary) ghUser.email = primary.email;
  }

  return ghUser;
}

export async function upsertGithubUser(
  db: Db,
  ghUser: GithubUser
): Promise<string> {
  const githubId = String(ghUser.id);
  const name = ghUser.name ?? ghUser.login;

  // 1. Look up by GitHub ID (returning user)
  const byGithubId = await db
    .select()
    .from(users)
    .where(eq(users.githubId, githubId))
    .limit(1);

  if (byGithubId[0]) {
    await db
      .update(users)
      .set({
        name,
        avatarUrl: ghUser.avatar_url,
        email: ghUser.email ?? byGithubId[0].email,
      })
      .where(eq(users.id, byGithubId[0].id));
    return byGithubId[0].id;
  }

  // 2. Fall back to email match — link GitHub to an existing email account
  if (ghUser.email) {
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, ghUser.email))
      .limit(1);

    if (byEmail[0]) {
      await db
        .update(users)
        .set({ githubId, name, avatarUrl: ghUser.avatar_url })
        .where(eq(users.id, byEmail[0].id));
      return byEmail[0].id;
    }
  }

  // 3. New user — insert fresh record
  const id = generateToken(16);
  await db.insert(users).values({
    id,
    githubId,
    email: ghUser.email,
    name,
    avatarUrl: ghUser.avatar_url,
  });
  return id;
}
