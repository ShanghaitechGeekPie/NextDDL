#!/usr/bin/env bash
set -euo pipefail

docker compose up -d db

echo "Waiting for Postgres..."
for i in {1..30}; do
  if docker exec nextddl-db-1 pg_isready -U nextddl -d nextddl >/dev/null 2>&1; then
    echo "Postgres is ready."
    exit 0
  fi
  sleep 1
  echo "..."
end

echo "Postgres did not become ready in time."
exit 1
