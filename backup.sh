#!/bin/sh
# Respaldo de la BD SQLite de STODIA (copia consistente con "sqlite3 .backup").
#   sh ./backup.sh            guarda en ./backups/stodia-AAAAMMDD-HHMMSS.db y borra respaldos de mas de 14 dias
# Requiere la API en marcha (docker compose up -d). Programable con cron:  0 2 * * * cd /ruta/STODIA && sh ./backup.sh
set -e
cd "$(dirname "$0")"
DAYS=${BACKUP_DAYS:-14}
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
docker compose exec -T api sh -c "mkdir -p /data/backups && sqlite3 /data/stodia.db \".backup /data/backups/stodia-$TS.db\" && find /data/backups -name 'stodia-*.db' -mtime +$DAYS -delete"
docker compose cp "api:/data/backups/stodia-$TS.db" "./backups/stodia-$TS.db"
find backups -name 'stodia-*.db' -mtime +"$DAYS" -delete
chmod 600 "backups/stodia-$TS.db" 2>/dev/null || true
echo "Respaldo creado: backups/stodia-$TS.db"
