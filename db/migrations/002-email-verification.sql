-- Brings a database made before email confirmation was added up to date.
-- Run once: npm run db:shell < db/migrations/002-email-verification.sql
-- (New databases don't need it: db/schema.sql already has these.)

ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL AFTER phone,
  ADD COLUMN verify_token_hash CHAR(64) NULL UNIQUE AFTER email_verified_at,
  ADD COLUMN verify_expires_at TIMESTAMP NULL AFTER verify_token_hash;

-- Accounts made before confirmation existed count as confirmed, so nobody loses access to anything.
UPDATE users SET email_verified_at = created_at;
