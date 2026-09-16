# TicketGuard Production Deployment

1. Provision managed PostgreSQL and Redis.
2. Set all variables from `backend/.env.example` using production secrets.
3. Run `npm install` in `backend`.
4. Run `npm run prisma:generate`.
5. Run `npm run prisma:migrate:deploy` against the production database.
6. Run `npm run build`.
7. Start with `npm start`.
8. Expose `/api/v1/health` for liveness and `/api/v1/health/ready` for readiness.
9. Deploy the frontend with `VITE_API_URL` pointing to the API origin.
10. Never run `prisma:seed` in production.

Production PostgreSQL backups and restore drills are infrastructure responsibilities and must be supplied by the managed database platform/runbook; TicketGuard does not fake backup functionality.
