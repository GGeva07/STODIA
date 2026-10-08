#!/bin/sh
set -e
mkdir -p /data
pnpm exec prisma db push --skip-generate
node dist/seed.js
exec node dist/server.js
