#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set."
  echo "Example:"
  echo '  DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?schema=public" bash ./scripts/db/migrate-deploy.sh'
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

pnpm -w prisma migrate deploy --schema="$ROOT_DIR/prisma/schema.prisma"

