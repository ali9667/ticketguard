#!/bin/sh
set -eu
printf '%s\n' 'Applying Prisma migrations...'
npx prisma migrate deploy
printf '%s\n' 'Starting TicketGuard...'
exec node dist/src/server.js
