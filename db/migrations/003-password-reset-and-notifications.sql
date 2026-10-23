-- Brings a database made before password reset and email notifications were added up to date.
-- Run once: npm run db:shell < db/migrations/003-password-reset-and-notifications.sql
-- (New databases don't need it: db/schema.sql already has these.)

ALTER TABLE users
  ADD COLUMN reset_token_hash CHAR(64) NULL UNIQUE AFTER verify_expires_at,
  ADD COLUMN reset_expires_at TIMESTAMP NULL AFTER reset_token_hash,
  ADD COLUMN language CHAR(2) NOT NULL DEFAULT 'en' AFTER reset_expires_at,
  ADD COLUMN email_quotes BOOLEAN NOT NULL DEFAULT TRUE AFTER language,
  ADD COLUMN email_projects BOOLEAN NOT NULL DEFAULT TRUE AFTER email_quotes,
  ADD COLUMN email_messages BOOLEAN NOT NULL DEFAULT TRUE AFTER email_projects;

ALTER TABLE invoices ADD COLUMN overdue_reminded_at TIMESTAMP NULL AFTER paid_at;

-- Invoices already overdue don't all get a reminder the moment this runs.
UPDATE invoices SET overdue_reminded_at = NOW() WHERE status = 'due' AND due_date < CURDATE();
