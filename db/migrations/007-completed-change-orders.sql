-- Withdraws change orders left waiting on completed projects. They can only be answered while the
-- work is in progress, so completing a project now withdraws them; before, they stayed waiting.
-- Run once: npm run db:shell < db/migrations/007-completed-change-orders.sql
-- (New databases don't need it.)

UPDATE change_orders c
JOIN projects p ON p.id = c.project_id
SET c.status = 'withdrawn', c.decided_at = NOW()
WHERE c.status = 'pending' AND p.status = 'completed';
