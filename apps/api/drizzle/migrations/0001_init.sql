-- Migration 0001: initial schema

CREATE TABLE IF NOT EXISTS users (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  github_id   TEXT,
  email       TEXT,
  name        TEXT    NOT NULL,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS users_github_id ON users (github_id) WHERE github_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);

CREATE TABLE IF NOT EXISTS email_magic_links (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT    NOT NULL,
  token_hash  TEXT    NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  ip          TEXT    NOT NULL,
  user_agent  TEXT    NOT NULL,
  next_path   TEXT    NOT NULL DEFAULT '/',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS email_magic_links_email ON email_magic_links (email);

CREATE TABLE IF NOT EXISTS apps (
  id                       TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id                  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                     TEXT    NOT NULL,
  slug                     TEXT    NOT NULL UNIQUE,
  mode                     TEXT    NOT NULL DEFAULT 'managed',
  status                   TEXT    NOT NULL DEFAULT 'active',
  upstream_host            TEXT    NOT NULL,
  allowed_origins_json     TEXT    NOT NULL DEFAULT '["*"]',
  allow_credentials        INTEGER NOT NULL DEFAULT 0,
  enabled_services_json    TEXT    NOT NULL DEFAULT '["rest","auth","storage","functions","graphql","realtime"]',
  rate_limit_per_min       INTEGER NOT NULL DEFAULT 100,
  strict_mode              INTEGER NOT NULL DEFAULT 0,
  rewrite_location_headers INTEGER NOT NULL DEFAULT 1,
  proxy_url                TEXT,
  selfhost_gateway_url     TEXT,
  created_at               INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS apps_user_id ON apps (user_id);
CREATE INDEX IF NOT EXISTS apps_slug   ON apps (slug);
