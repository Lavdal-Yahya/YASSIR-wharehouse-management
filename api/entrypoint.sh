#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
npx prisma migrate deploy

echo "[entrypoint] Running seed..."
npx prisma db seed

echo "[entrypoint] Starting server..."
exec node dist/main
