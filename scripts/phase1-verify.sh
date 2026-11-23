#!/usr/bin/env bash
# Phase 1 verification: infra up, migrate, health OK.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker, then: sudo usermod -aG docker \"\$USER\""
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot access Docker daemon (permission denied?)."
  echo "Fix: sudo usermod -aG docker \"\$USER\"  # then log out/in"
  exit 1
fi

echo "==> Starting Postgres + Redis"
docker compose up -d
docker compose ps

echo "==> Waiting for healthy containers"
for i in {1..30}; do
  pg=$(docker inspect -f '{{.State.Health.Status}}' letsmeet-postgres 2>/dev/null || echo starting)
  rd=$(docker inspect -f '{{.State.Health.Status}}' letsmeet-redis 2>/dev/null || echo starting)
  if [[ "$pg" == "healthy" && "$rd" == "healthy" ]]; then
    break
  fi
  sleep 1
done

echo "==> Prisma generate + migrate"
npx prisma generate
npx prisma migrate deploy

echo "==> Starting API briefly"
node src/server.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for i in {1..40}; do
  if curl -sf http://127.0.0.1:3000/health/live >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

echo "==> GET /health"
curl -sf http://127.0.0.1:3000/health | tee /tmp/letsmeet-health.json
echo
grep -q '"status":"ok"' /tmp/letsmeet-health.json

echo "==> Phase 1 verification passed"
