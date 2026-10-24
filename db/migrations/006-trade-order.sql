-- Brings a database made before builders' trades kept their order up to date.
-- Run once: npm run db:shell < db/migrations/006-trade-order.sql
-- (New databases don't need it: db/schema.sql already has it.)

ALTER TABLE builder_trades ADD COLUMN position TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER trade;

-- Trades chosen before the order was kept count in alphabetical order.
UPDATE builder_trades t
JOIN (SELECT user_id, trade, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY trade) - 1 AS n FROM builder_trades) o
  USING (user_id, trade)
SET t.position = o.n;
