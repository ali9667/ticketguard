CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "UserRole" AS ENUM ('USER','EVENT_ORGANIZER','SCANNER','ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','SUSPENDED','DELETED');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT','PUBLISHED','CANCELLED','COMPLETED');
CREATE TYPE "TicketTypeStatus" AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED','ACTIVE','TRANSFER_PENDING','TRANSFERRED','USED','CANCELLED','EXPIRED');
CREATE TYPE "TransferStatus" AS ENUM ('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED');
CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_RECEIVED','TRANSFER_ACCEPTED','TRANSFER_REJECTED','TRANSFER_EXPIRED','TICKET_TRANSFERRED','TICKET_VERIFIED','SECURITY_ALERT');
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS','LOGIN_FAILED','PASSWORD_CHANGED','TICKET_ISSUED','TICKET_TRANSFER_STARTED','TICKET_TRANSFER_ACCEPTED','TICKET_TRANSFER_REJECTED','TICKET_TRANSFER_EXPIRED','TICKET_VERIFIED','TICKET_USED','TICKET_CANCELLED','USER_SUSPENDED','ADMIN_ACTION');
CREATE TYPE "SecurityEventType" AS ENUM ('FAILED_LOGIN','INVALID_QR','TRANSFER_ABUSE','EXCESSIVE_REQUESTS','REFRESH_TOKEN_REUSE');
CREATE TYPE "SecuritySeverity" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE','REVOKED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING','COMPLETED','FAILED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "email" VARCHAR(320) NOT NULL, "password_hash" VARCHAR(255) NOT NULL,
  "first_name" VARCHAR(100) NOT NULL, "last_name" VARCHAR(100) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER', "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3), CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");

CREATE TABLE "venues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(200) NOT NULL, "address" VARCHAR(500) NOT NULL,
  "city" VARCHAR(100) NOT NULL, "country" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(255) NOT NULL, "description" TEXT,
  "venue_id" UUID NOT NULL, "start_at" TIMESTAMP(3) NOT NULL, "end_at" TIMESTAMP(3) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL, "capacity" INTEGER NOT NULL, "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_capacity_check" CHECK ("capacity" > 0), CONSTRAINT "events_dates_check" CHECK ("end_at" > "start_at")
);
CREATE INDEX "events_created_by_idx" ON "events"("created_by");
CREATE INDEX "events_venue_id_idx" ON "events"("venue_id");
CREATE INDEX "events_status_start_at_idx" ON "events"("status","start_at");

CREATE TABLE "ticket_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "event_id" UUID NOT NULL, "name" VARCHAR(100) NOT NULL,
  "price" DECIMAL(12,2) NOT NULL, "currency" CHAR(3) NOT NULL, "quantity" INTEGER NOT NULL,
  "sold_count" INTEGER NOT NULL DEFAULT 0, "status" "TicketTypeStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id"), CONSTRAINT "ticket_types_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ticket_types_sold_count_check" CHECK ("sold_count" >= 0 AND "sold_count" <= "quantity"),
  CONSTRAINT "ticket_types_price_check" CHECK ("price" >= 0)
);
CREATE UNIQUE INDEX "ticket_types_event_id_name_key" ON "ticket_types"("event_id","name");
CREATE INDEX "ticket_types_event_id_status_idx" ON "ticket_types"("event_id","status");

CREATE TABLE "tickets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "event_id" UUID NOT NULL, "ticket_type_id" UUID NOT NULL, "owner_id" UUID NOT NULL,
  "ticket_number" VARCHAR(80) NOT NULL, "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "used_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");
CREATE INDEX "tickets_owner_id_status_idx" ON "tickets"("owner_id","status");
CREATE INDEX "tickets_event_id_status_idx" ON "tickets"("event_id","status");
CREATE INDEX "tickets_ticket_type_id_idx" ON "tickets"("ticket_type_id");

CREATE TABLE "ticket_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticket_id" UUID NOT NULL, "identifier" VARCHAR(64) NOT NULL,
  "secret_hash" VARCHAR(128) NOT NULL, "secret_ciphertext" TEXT NOT NULL, "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_credentials_ticket_id_status_idx" ON "ticket_credentials"("ticket_id","status");
CREATE UNIQUE INDEX "ticket_credentials_identifier_key" ON "ticket_credentials"("identifier");
CREATE INDEX "ticket_credentials_status_idx" ON "ticket_credentials"("status");

CREATE TABLE "transfers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticket_id" UUID NOT NULL, "initiator_id" UUID NOT NULL, "recipient_id" UUID NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'PENDING', "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3), "rejected_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transfers_pkey" PRIMARY KEY ("id"), CONSTRAINT "transfers_not_self_check" CHECK ("initiator_id" <> "recipient_id")
);
CREATE INDEX "transfers_ticket_id_status_idx" ON "transfers"("ticket_id","status");
CREATE INDEX "transfers_recipient_id_status_idx" ON "transfers"("recipient_id","status");
CREATE INDEX "transfers_status_expires_at_idx" ON "transfers"("status","expires_at");
CREATE UNIQUE INDEX "transfers_one_pending_per_ticket_idx" ON "transfers"("ticket_id") WHERE "status" = 'PENDING';

CREATE TABLE "transfer_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "transfer_id" UUID NOT NULL, "recipient_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transfer_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transfer_recipients_transfer_id_key" ON "transfer_recipients"("transfer_id");
CREATE INDEX "transfer_recipients_recipient_id_idx" ON "transfer_recipients"("recipient_id");

CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "token_hash" VARCHAR(128) NOT NULL,
  "family_id" UUID NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "revoked_at" TIMESTAMP(3), "replaced_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id","revoked_at");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "type" "NotificationType" NOT NULL,
  "title" VARCHAR(200) NOT NULL, "message" VARCHAR(1000) NOT NULL, "read_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id","read_at","created_at");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_id" UUID, "action" "AuditAction" NOT NULL,
  "resource_type" VARCHAR(100) NOT NULL, "resource_id" UUID, "request_id" VARCHAR(128) NOT NULL, "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id","created_at");
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type","resource_id","created_at");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE TABLE "security_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_id" UUID, "type" "SecurityEventType" NOT NULL,
  "severity" "SecuritySeverity" NOT NULL, "request_id" VARCHAR(128) NOT NULL, "ip_address" VARCHAR(64), "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_events_actor_id_created_at_idx" ON "security_events"("actor_id","created_at");
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type","created_at");
CREATE INDEX "security_events_severity_created_at_idx" ON "security_events"("severity","created_at");

CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "key" VARCHAR(255) NOT NULL, "user_id" UUID NOT NULL,
  "method" VARCHAR(10) NOT NULL, "route" VARCHAR(255) NOT NULL, "request_hash" VARCHAR(128) NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING', "response_status" INTEGER, "response_body" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_keys_key_user_id_method_route_key" ON "idempotency_keys"("key","user_id","method","route");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

CREATE TABLE "scanner_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "event_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "scanner_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scanner_assignments_user_id_event_id_key" ON "scanner_assignments"("user_id","event_id");
CREATE INDEX "scanner_assignments_event_id_idx" ON "scanner_assignments"("event_id");

ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_credentials" ADD CONSTRAINT "ticket_credentials_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_recipients" ADD CONSTRAINT "transfer_recipients_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transfer_recipients" ADD CONSTRAINT "transfer_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scanner_assignments" ADD CONSTRAINT "scanner_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scanner_assignments" ADD CONSTRAINT "scanner_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
