-- Brings a database made before emailed invite links could confirm an address up to date.
-- Run once: npm run db:shell < db/migrations/005-emailed-invite-links.sql
-- (New databases don't need it: db/schema.sql already has it.)

-- Invite links already sent count as ones the builder may have seen, so they don't confirm anything.
ALTER TABLE projects ADD COLUMN invite_emailed BOOLEAN NOT NULL DEFAULT FALSE AFTER invite_token_hash;
