# Concurrency tests

These tests require the real PostgreSQL and Redis services from Docker Compose. The suite must prove:

1. only one concurrent transfer can claim a ticket;
2. only one recipient can accept a transfer;
3. twenty concurrent scans produce exactly one successful check-in;
4. concurrent issuance cannot oversell the final inventory unit;
5. duplicate idempotency keys create one logical operation.

The executable suite is added alongside the corresponding domain implementation and must never be replaced with mocked counters.
