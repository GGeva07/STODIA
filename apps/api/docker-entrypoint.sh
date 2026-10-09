#!/bin/sh
set -e
mkdir -p /data
# Integridad referencial (Fase 1): una base ANTERIOR (sin FK) se respalda, se EXPANDE/RELLENA y solo entonces se endurece con db push
# (expandir -> rellenar -> contraer). En una base nueva o ya migrada estos pasos no hacen nada.
set +e; pnpm exec tsx scripts/fk-reparar.ts --detectar; rc=$?; set -e
PUSH_FLAGS=""
if [ "$rc" = "10" ]; then
  f="${DATABASE_URL#file:}"
  if [ -f "$f" ]; then cp "$f" "$f.pre-fase1-$(date +%Y%m%d%H%M%S).bak"; echo "Respaldo previo a la Fase 1: $f.pre-fase1-*.bak"; fi
  set +e; pnpm exec tsx scripts/fk-reparar.ts --auto; rc2=$?; set -e
  if [ "$rc2" != "10" ] && [ "$rc2" != "0" ]; then exit "$rc2"; fi
  PUSH_FLAGS="--accept-data-loss" # solo elimina las columnas heredadas (kid, tutorCed...) que fk-reparar ya copio a las nuevas
elif [ "$rc" != "0" ]; then
  exit "$rc"
fi
pnpm exec prisma db push --skip-generate $PUSH_FLAGS
pnpm exec tsx scripts/fk-reparar.ts --auto || true # segunda pasada: rellena las tablas nuevas (Contrato) tras el push
node dist/seed.js
exec node dist/server.js
