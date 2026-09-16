# TicketGuard

**Verified ownership. Secure transfer. One valid ticket.**

TicketGuard is a security-focused ticket ownership and transfer platform implemented as a modular monolith. PostgreSQL is the source of truth for ticket ownership/state and Redis is used for rate limiting and background job infrastructure.

## Stack

- Node.js 22 + TypeScript (strict) + Express 5
- PostgreSQL 17 + Prisma
- Redis 8 + BullMQ
- JWT access tokens + rotating, hashed refresh tokens
- Zod validation
- Socket.IO
- Jest + Supertest
- Docker Compose
- React + Vite frontend
- OpenAPI/Swagger

## Repository

```text
TicketGuard/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/
│   │   ├── infrastructure/
│   │   ├── middleware/
│   │   └── modules/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── concurrency/
│   │   └── security/
│   ├── Dockerfile
│   └── entrypoint.sh
├── frontend/
├── deployment/
├── docs/
└── docker-compose.yml
```

## Local Docker setup

Requirements: Docker Desktop with Docker Compose and internet access for the first image/dependency build.

1. Create local configuration:

```powershell
Copy-Item backend/.env.example backend/.env
```

Replace the `replace-with-*` secrets in `backend/.env` with random development values. Never use the example values in production.

2. Start the complete stack:

```powershell
docker compose up -d --build
```

The stack exposes:

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`
- Swagger: `http://localhost:5000/docs`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The backend container runs `prisma migrate deploy` before starting the API. PostgreSQL and Redis health checks gate backend startup.

3. Optional development seed:

```powershell
docker compose exec backend npm run prisma:seed
```

The seed is disabled when `NODE_ENV=production`.

4. Smoke test:

```powershell
./deployment/verify.sh
```

## Local development without Docker

Run PostgreSQL and Redis yourself, create `backend/.env`, then:

```powershell
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

## Verification commands

Backend:

```powershell
cd backend
npm run prisma:generate
npm run prisma:migrate:deploy
npm run lint
npm run typecheck
npm run test:unit
npm run test:security
npm run test:integration
npm run test:concurrency
npm run build
```

Full verification shortcut:

```powershell
npm run verify
```

Concurrency tests are designed to execute against a real PostgreSQL database. They must not be replaced by mocks when certifying the system.

## Security model

- Passwords are Argon2id hashes; plaintext passwords are never persisted.
- Refresh tokens are opaque random values; only HMAC-derived hashes are stored.
- Refresh rotation is serialized with row locking and reuse revokes the token family.
- JWT issuer, audience and algorithm are explicitly validated.
- Current user role/status are loaded server-side for protected operations.
- Ticket access is owner/resource-authorized; client-supplied owner/role fields are not trusted for authorization.
- Ticket credentials are cryptographically random, hashed, encrypted at rest, and rotated on transfer.
- Ticket check-in locks the ticket row inside the PostgreSQL transaction.
- Audit/security records are append-only at the database layer.
- Redis is never authoritative for ticket ownership or state.

## Product experience

The frontend is designed as a real product surface rather than an API demo: public event discovery, digital ticket wallet, secure QR presentation, ownership transfer, organizer event/inventory controls, scanner assignment, camera/manual verification, and administrative security views. Normal event operations do not require direct database manipulation.

## Runtime certification status

The source repository contains the implementation, migrations, tests and Docker configuration. Runtime certification requires an environment with Docker, PostgreSQL, Redis and working npm registry access. If those dependencies cannot be started, the corresponding tests are **runtime-unverified**, not assumed to pass.

## Production deployment

Use managed PostgreSQL and Redis, inject secrets through the deployment platform, run `prisma migrate deploy` during the release process, and expose only the required application ports. Review `docs/security.md`, `docs/architecture.md`, `docs/database.md`, and `deployment/README.md` before deployment.
