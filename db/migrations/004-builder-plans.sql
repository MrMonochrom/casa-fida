-- Brings a database made before builder plans were added up to date.
-- Run once: npm run db:shell < db/migrations/004-builder-plans.sql
-- (New databases don't need it: db/schema.sql already has these.)

ALTER TABLE users
  ADD COLUMN email_jobs BOOLEAN NOT NULL DEFAULT TRUE AFTER email_messages,
  ADD COLUMN plan ENUM('free', 'pro') NOT NULL DEFAULT 'free' AFTER email_jobs,
  ADD COLUMN plan_ends_at TIMESTAMP NULL AFTER plan,
  ADD COLUMN trial_used_at TIMESTAMP NULL AFTER plan_ends_at,
  ADD COLUMN jobs_digest_sent_at TIMESTAMP NULL AFTER trial_used_at,
  ADD COLUMN jobs_digest_last_job_id INT UNSIGNED NULL AFTER jobs_digest_sent_at;

-- The first daily digest covers jobs from the day before, not everything ever posted.
UPDATE users SET jobs_digest_sent_at = NOW() - INTERVAL 1 DAY WHERE role = 'builder';
