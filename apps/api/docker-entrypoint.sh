#!/bin/sh
set -e
mkdir -p /data
# Integridad referencial (Fase 1), nucleo academico tipado (2A), resto de catalogos tipados (2B) y cierre de la base (2C: ciclo lectivo, matricula, tutores, recibos, servicios, monedero):
# una base ANTERIOR se respalda, se EXPANDE/RELLENA y solo entonces se endurece
# con db push (expandir -> rellenar -> contraer). Si la Fase 2A, 2B o 2C encuentra datos ambiguos (codigo 3) NO se ejecuta el push y el contenedor se detiene.
# Tambien aqui (fk-reparar --auto) se migra el MODULO FISCAL (SecuenciaFiscal / tipo de comprobante por recibo; docs/fiscal-ncf.md): aditivo e idempotente.
# Y el modulo de NOTAS DE CREDITO/DEBITO (NotaFiscal...; docs/fiscal-ncf.md §12): tambien aditivo (codigo 11 = respaldo + expandir/rellenar + db push SIN --accept-data-loss).
# En una base nueva o ya migrada estos pasos no hacen nada.
set +e; pnpm exec tsx scripts/fk-reparar.ts --detectar; rc=$?; set -e
PUSH_FLAGS=""
if [ "$rc" = "10" ] || [ "$rc" = "11" ]; then
  f="${DATABASE_URL#file:}"
  if [ -f "$f" ]; then cp "$f" "$f.pre-migracion-$(date +%Y%m%d%H%M%S).bak"; echo "Respaldo previo a la migracion: $f.pre-migracion-*.bak"; fi
  set +e; pnpm exec tsx scripts/fk-reparar.ts --auto ${STODIA_NIVEL_POR_DEFECTO:+--nivel-por-defecto=$STODIA_NIVEL_POR_DEFECTO}; rc2=$?; set -e
  if [ "$rc2" != "10" ] && [ "$rc2" != "0" ]; then exit "$rc2"; fi
  if [ "$rc" = "10" ]; then PUSH_FLAGS="--accept-data-loss"; fi # solo elimina las columnas heredadas (kid, tutorCed, Alumno.grado/sec/tanda...) que fk-reparar ya copio a las nuevas
elif [ "$rc" != "0" ]; then
  exit "$rc"
fi
pnpm exec prisma db push --skip-generate $PUSH_FLAGS
pnpm exec tsx scripts/fk-reparar.ts --auto || true # segunda pasada: rellena las tablas nuevas (Contrato) y verifica que Catalogo, PersServicio y MobWallet ya no existen (2A, 2B y 2C)
node dist/seed.js
exec node dist/server.js
