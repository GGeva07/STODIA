# Respaldo de la BD SQLite de STODIA (copia consistente con "sqlite3 .backup").
#   powershell -ExecutionPolicy Bypass -File .\backup.ps1     -> .\backups\stodia-AAAAMMDD-HHMMSS.db (rotacion 14 dias)
# Requiere la API en marcha. Programable con el Programador de tareas de Windows.
param([int]$Days = 14)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force backups | Out-Null
docker compose exec -T api sh -c "mkdir -p /data/backups && sqlite3 /data/stodia.db '.backup /data/backups/stodia-$ts.db' && find /data/backups -name 'stodia-*.db' -mtime +$Days -delete"
if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: fallo el respaldo (¿esta la API en marcha?)' -ForegroundColor Red; exit 1 }
docker compose cp "api:/data/backups/stodia-$ts.db" ".\backups\stodia-$ts.db"
if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: no se pudo copiar el respaldo al host' -ForegroundColor Red; exit 1 }
Get-ChildItem backups -Filter 'stodia-*.db' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Days) } | Remove-Item -Force
Write-Host "Respaldo creado: backups\stodia-$ts.db"
