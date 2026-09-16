# TicketGuard Security

Implemented controls are architectural, not cosmetic:

- Argon2id password hashing.
- Short-lived JWT access tokens with rotated, hashed refresh tokens.
- Server-side RBAC and resource authorization.
- Zod validation of external input.
- Helmet and explicit CORS configuration.
- Redis-backed rate limiting.
- Cryptographically random ticket credentials.
- Credential hashes plus encrypted-at-rest secret material for owner QR rendering.
- PostgreSQL row locking for ticket verification and transfer ownership changes.
- Idempotency records for retryable state-changing operations.
- Immutable-by-application audit records and security events.
- Sensitive tokens, passwords, and credentials are redacted from logs.

This document does not claim perfect security. A production deployment still requires managed PostgreSQL backups, secret rotation, TLS, monitoring, dependency patching, incident response, and infrastructure hardening.
