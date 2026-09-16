#!/usr/bin/env bash
set -euo pipefail
curl -fsS http://localhost:5000/api/v1/health >/dev/null
a=$(curl -fsS -o /dev/null -w '%{http_code}' http://localhost:5000/api/v1/health/ready)
[[ "$a" == "200" ]]
echo 'TicketGuard smoke checks passed.'
