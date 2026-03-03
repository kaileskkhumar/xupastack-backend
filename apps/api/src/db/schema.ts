import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
  githubId: text("github_id"),
  email: text("email"),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const emailMagicLinks = sqliteTable(
  "email_magic_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    ip: text("ip").notNull(),
    userAgent: text("user_agent").notNull(),
    nextPath: text("next_path").notNull().default("/"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ tokenHashIdx: uniqueIndex("email_magic_links_token_hash").on(t.tokenHash) })
);

export const apps = sqliteTable("apps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  mode: text("mode").notNull().default("managed"), // managed | selfhost
  status: text("status").notNull().default("active"), // active | disabled
  upstreamHost: text("upstream_host").notNull(),
  allowedOriginsJson: text("allowed_origins_json").notNull().default('["*"]'),
  allowCredentials: integer("allow_credentials", { mode: "boolean" })
    .notNull()
    .default(false),
  enabledServicesJson: text("enabled_services_json")
    .notNull()
    .default('["rest","auth","storage","functions","graphql","realtime"]'),
  rateLimitPerMin: integer("rate_limit_per_min").notNull().default(100),
  strictMode: integer("strict_mode", { mode: "boolean" })
    .notNull()
    .default(false),
  rewriteLocationHeaders: integer("rewrite_location_headers", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  proxyUrl: text("proxy_url"),
  selfhostGatewayUrl: text("selfhost_gateway_url"),
  // Consent tracking (populated on creation, never updated)
  termsAcceptedAt: integer("terms_accepted_at"),
  termsVersion: text("terms_version"),
  privacyVersion: text("privacy_version"),
  aupVersion: text("aup_version"),
  termsAcceptIp: text("terms_accept_ip"),
  termsAcceptUserAgent: text("terms_accept_user_agent"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EmailMagicLink = typeof emailMagicLinks.$inferSelect;
export type AppRow = typeof apps.$inferSelect;
