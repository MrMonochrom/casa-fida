-- Brings a database made before currencies were added up to date: each job and project gets a
-- currency (existing ones keep US dollars), and amounts can go up to 100 million.
-- npm run db:migrate runs it once.
-- (New databases don't need it: db/schema.sql already has these.)

ALTER TABLE jobs
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD' AFTER location,
  MODIFY budget_min BIGINT UNSIGNED NULL,
  MODIFY budget_max BIGINT UNSIGNED NULL;

ALTER TABLE quotes MODIFY amount BIGINT UNSIGNED NOT NULL;

ALTER TABLE projects
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'USD' AFTER address,
  MODIFY contract_amount BIGINT UNSIGNED NOT NULL;

ALTER TABLE change_orders MODIFY amount BIGINT NOT NULL;

ALTER TABLE invoices MODIFY amount BIGINT UNSIGNED NOT NULL;
