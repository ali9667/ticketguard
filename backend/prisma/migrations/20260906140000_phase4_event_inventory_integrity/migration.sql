-- Phase 4: enforce that a ticket's event and ticket type belong together.
CREATE UNIQUE INDEX "ticket_types_id_event_id_key" ON "ticket_types"("id", "event_id");

ALTER TABLE "tickets"
  DROP CONSTRAINT "tickets_ticket_type_id_fkey";

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_ticket_type_event_fkey"
  FOREIGN KEY ("ticket_type_id", "event_id")
  REFERENCES "ticket_types"("id", "event_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
