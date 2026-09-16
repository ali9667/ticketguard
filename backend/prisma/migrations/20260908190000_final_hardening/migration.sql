-- Final hardening: database-level append-only audit/security records.
CREATE OR REPLACE FUNCTION ticketguard_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable table: %', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable_update ON audit_logs;
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION ticketguard_reject_mutation();

DROP TRIGGER IF EXISTS security_events_immutable_update ON security_events;
CREATE TRIGGER security_events_immutable_update
BEFORE UPDATE OR DELETE ON security_events
FOR EACH ROW EXECUTE FUNCTION ticketguard_reject_mutation();

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_response_status_check
  CHECK ((status = 'PROCESSING' AND response_status IS NULL) OR (status IN ('COMPLETED','FAILED') AND response_status BETWEEN 100 AND 599));
