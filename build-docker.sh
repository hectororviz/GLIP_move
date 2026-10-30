#!/bin/sh
# Build portable: compila en el host y empaqueta el standalone (offline-friendly).
set -e
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npm run build
docker compose build
echo "Listo. Levantar con: docker compose up -d"
