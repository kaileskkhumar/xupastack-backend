-- Migration 0002: consent tracking columns on apps

ALTER TABLE apps ADD COLUMN terms_accepted_at       INTEGER;
ALTER TABLE apps ADD COLUMN terms_version           TEXT;
ALTER TABLE apps ADD COLUMN privacy_version         TEXT;
ALTER TABLE apps ADD COLUMN aup_version             TEXT;
ALTER TABLE apps ADD COLUMN terms_accept_ip         TEXT;
ALTER TABLE apps ADD COLUMN terms_accept_user_agent TEXT;
