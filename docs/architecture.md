# TicketGuard Architecture

TicketGuard is a modular monolith. The backend is the authority for authentication, authorization, ticket ownership, ticket state, transfers, verification, and auditability.

## Request flow

Request → middleware → controller → service → repository → PostgreSQL

Redis is used only for infrastructure concerns such as rate limiting, short-lived coordination where justified, and BullMQ queues. PostgreSQL remains authoritative for ticket ownership and lifecycle state.

## Current implementation phase

Phase 1 establishes the application boundary, configuration validation, structured logging, request IDs, security middleware, PostgreSQL/Redis clients, Docker infrastructure, and health/readiness endpoints. Domain modules are intentionally added in later phases rather than fabricated as placeholders.


## Phase 10–14 delivery

Administration remains a bounded HTTP module. The frontend is a separate API consumer, not a second source of truth. OpenAPI documents the public API. CI is the automated quality gate. Production deployment uses managed PostgreSQL/Redis and external backup/recovery infrastructure.
