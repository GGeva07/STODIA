#!/bin/sh
# Actualizador de STODIA en el SERVIDOR. NO actualiza nada por su cuenta: solo aplica la versión que el
# Super Admin APROBÓ en la app (la API deja /data/actualizacion-solicitada.json en el volumen).
#
#   sh ./actualizar.sh            revisa si hay una aprobación pendiente y, si la hay, la aplica
#   sh ./actualizar.sh --estado   solo muestra versión actual y aprobación pendiente
# Programarlo cada 5 minutos (Linux):   */5 * * * * cd /ruta/STODIA && sh ./actualizar.sh >> actualizar.log 2>&1
#
# Pasos al aplicar la versión X.Y.Z (tag git vX.Y.Z):
#   1) respaldo de la BD (backup.sh)   2) git fetch + checkout vX.Y.Z   3) docker compose up -d --build (STODIA_VERSION=X.Y.Z)
#   4) espera /health con la versión nueva   5) si falla: vuelve al commit anterior, RESTAURA el respaldo y levanta la versión previa.
# El resultado queda en /data/actualizacion-estado.json (la app lo muestra al Super Admin).
set -eu
cd "$(dirname "$0")"
LOCK=.actualizar.lock
API_PORT=$(grep -E "^API_PORT=" .env 2>/dev/null | tail -n 1 | sed -e "s/^API_PORT=//" -e "s/'//g")
API_PORT=${API_PORT:-3000}
HEALTH="http://localhost:$API_PORT/health"
TIMEOUT=${STODIA_HEALTH_TIMEOUT:-180}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
dc() { docker compose "$@"; }
# Lee/escribe archivos dentro del volumen de datos a través del contenedor de la API.
vol_cat() { dc exec -T api sh -c "cat /data/$1 2>/dev/null" || true; }
estado() { # $1 estado, $2 version, $3 mensaje
  j=$(printf '{"estado":"%s","version":"%s","mensaje":"%s","en":"%s"}' "$1" "$2" "$(printf '%s' "$3" | tr -d '"\\\n')" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
  printf '%s' "$j" | dc exec -T api sh -c 'cat > /data/actualizacion-estado.json' || log "aviso: no se pudo escribir el estado ($1)"
}
jget() { printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }
version_actual() { curl -sf -m 5 "$HEALTH" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
espera_version() { # $1 version esperada
  i=0
  while [ "$i" -lt "$TIMEOUT" ]; do
    [ "$(version_actual)" = "$1" ] && return 0
    sleep 3; i=$((i + 3))
  done
  return 1
}
set_env() { # $1 clave, $2 valor (en .env, entre comillas simples)
  if grep -qE "^$1=" .env; then sed -e "s|^$1=.*|$1='$2'|" .env > .env.tmp; else { cat .env; echo "$1='$2'"; } > .env.tmp; fi
  mv .env.tmp .env; chmod 600 .env
}

command -v docker >/dev/null || { log "ERROR: falta docker"; exit 1; }
command -v curl >/dev/null || { log "ERROR: falta curl"; exit 1; }
command -v git >/dev/null || { log "ERROR: falta git"; exit 1; }
[ -f .env ] || { log "ERROR: no hay .env (¿se instaló el servidor aquí?)"; exit 1; }

SOL=$(vol_cat actualizacion-solicitada.json)
NUEVA=$(jget "$SOL" version)
ACTUAL=$(version_actual || true)
if [ "${1:-}" = "--estado" ]; then
  echo "Versión en marcha : ${ACTUAL:-desconocida (¿API detenida?)}"
  echo "Aprobada          : ${NUEVA:-ninguna}"
  exit 0
fi
[ -n "$NUEVA" ] || exit 0 # nada aprobado: no se toca nada
printf '%s' "$NUEVA" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { log "versión aprobada inválida: $NUEVA"; dc exec -T api rm -f /data/actualizacion-solicitada.json; exit 1; }

# Un solo actualizador a la vez
if ! mkdir "$LOCK" 2>/dev/null; then log "ya hay una actualización en curso ($LOCK)"; exit 0; fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT INT TERM

if [ "$ACTUAL" = "$NUEVA" ]; then
  log "ya está en $NUEVA"; dc exec -T api rm -f /data/actualizacion-solicitada.json; estado ok "$NUEVA" "Ya estaba en esta versión"; exit 0
fi

log "Actualizando $ACTUAL -> $NUEVA (aprobada por $(jget "$SOL" aprobadaPor))"
estado aplicando "$NUEVA" "Aplicando"
PREV_REF=$(git rev-parse HEAD)
PREV_VER=$ACTUAL

# 1) Respaldo
RESP=$(sh ./backup.sh | sed -n 's/^Respaldo creado: //p')
[ -n "$RESP" ] && [ -f "$RESP" ] || { log "ERROR: no se pudo respaldar; no se actualiza"; estado error "$NUEVA" "No se pudo hacer el respaldo previo"; exit 1; }
log "respaldo: $RESP"

# 2) Código de la versión
if ! git fetch --tags --quiet origin || ! git -c advice.detachedHead=false checkout --quiet "v$NUEVA"; then
  log "ERROR: no existe el tag v$NUEVA o no hay acceso al repositorio"
  estado error "$NUEVA" "No se pudo descargar la versión"; exit 1
fi

# 3-4) Construir, levantar y comprobar
set_env STODIA_VERSION "$NUEVA"
dc exec -T api rm -f /data/actualizacion-solicitada.json || true
if dc up -d --build && espera_version "$NUEVA"; then
  log "OK: versión $NUEVA en marcha"
  estado ok "$NUEVA" "Actualizado"
  exit 0
fi

# 5) Vuelta atrás: código anterior + base de datos del respaldo
log "FALLO: $NUEVA no respondió; volviendo a $PREV_VER"
git -c advice.detachedHead=false checkout --quiet "$PREV_REF"
set_env STODIA_VERSION "$PREV_VER"
dc stop api || true
B=$(basename "$RESP")
dc run --rm --no-deps -v "$PWD/backups:/b:ro" api sh -c "cp /b/$B /data/stodia.db && rm -f /data/stodia.db-journal /data/stodia.db-wal /data/stodia.db-shm"
dc up -d --build
if espera_version "$PREV_VER"; then
  estado revertida "$NUEVA" "Se restauró la versión $PREV_VER con el respaldo $B"
  log "revertido a $PREV_VER"
else
  log "ERROR GRAVE: la versión anterior tampoco responde. Revisa: docker compose logs api"
fi
exit 1
