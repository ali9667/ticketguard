-- Phase 7: credential history is intentionally one-to-many.
-- A ticket can accumulate revoked credentials after transfers/rotation,
-- while PostgreSQL guarantees at most one active credential per ticket.

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_credentials_one_active_per_ticket_idx"
ON "ticket_credentials" ("ticket_id")
WHERE "status" = 'ACTIVE';
