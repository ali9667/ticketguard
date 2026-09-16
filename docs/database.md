# TicketGuard Database

PostgreSQL is authoritative for users, events, ticket inventory, ticket ownership, credential status, transfers, notifications, audit records, security events, refresh tokens, and idempotency state.

## Consistency rules

- Ticket ownership changes occur in the same transaction as transfer completion and credential rotation.
- Check-in locks the ticket row before validating and consuming it.
- Ticket inventory is protected by locking the ticket-type row before incrementing `soldCount`.
- Unique constraints protect email, ticket number, credential identifier, and active transfer relationships.
- Redis is never authoritative for ticket ownership or state.
