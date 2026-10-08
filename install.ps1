# Instalador STODIA (Windows). Lo ejecuta el proveedor en el equipo del cliente.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1                          (interactivo)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Config .\respuestas.env  (desatendido)
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Die($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die 'Docker no está instalado o no está en el PATH. Instala Docker Desktop y vuelve a ejecutar.'
}

# Archivo de respuestas KEY=VALOR (admite 'x', "x" o x)
$answers = @{}
if ($Config) {
    if (-not (Test-Path -LiteralPath $Config)) { Die "No existe el archivo de respuestas: $Config" }
    foreach ($line in [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Config), [System.Text.Encoding]::UTF8)) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') {
            $key = $Matches[1]; $val = $Matches[2].Trim()
            if ($val -match "^'([^']*)'") { $val = $Matches[1] }
            elseif ($val -match '^"([^"]*)"') { $val = $Matches[1] }
            else { $val = ($val -replace '\s+#.*$', '').Trim() }
            $answers[$key] = $val
        }
    }
}

function RandomBytesHex($bytes) {
    $b = New-Object byte[] $bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b)
    return ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}

# Ningún valor admite comilla simple ni saltos de línea (el .env los escribe entre comillas simples).
function NoQ($v) { return ($v -notmatch "['\r\n]") }
# Verifica la FIRMA de la clave con node (scripts/license/verify.mjs, solo node:crypto) si hay node; si no, solo el formato.
$script:NodeCmd = Get-Command node -ErrorAction SilentlyContinue
$script:Warned = $false
function Test-LicenseSignature($v) {
    $verify = Join-Path $PSScriptRoot 'scripts/license/verify.mjs'
    if (-not $script:NodeCmd -or -not (Test-Path $verify)) {
        if (-not $script:Warned) { Write-Host '  (aviso: sin Node.js solo se validó el formato; la API verificará la firma al arrancar.)' -ForegroundColor Yellow; $script:Warned = $true }
        return $true
    }
    $out = & node $verify $v 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "  -> $out" -ForegroundColor Yellow; return $false }
    return $true
}
$V = @{
    url   = { param($v) (NoQ $v) -and $v -match '^https?://\S+$' }
    text  = { param($v) (NoQ $v) -and $v.Length -ge 1 -and $v.Length -le 200 }
    rnc   = { param($v) ($v -match '^[0-9 -]+$') -and (($v -replace '\D', '').Length -eq 9) }
    phone = { param($v) $v -match '^[0-9+() .-]{7,20}$' }
    mail  = { param($v) (NoQ $v) -and $v -match '^[^@\s]+@[^@\s]+\.[^@\s]+$' }
    user  = { param($v) $v -match '^[a-z0-9._-]{3,32}$' }
    lic   = { param($v) (NoQ $v) -and ($v -match '^STODIA1[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{86}$') -and (Test-LicenseSignature $v) }
    port  = { param($v) ($v -match '^[0-9]{1,5}$') -and ([int]$v -ge 1) -and ([int]$v -le 65535) }
    tz    = { param($v) $v -match '^(UTC|[A-Za-z_]+/[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)?)$' }
    cur   = { param($v) $v -cmatch '^[A-Z]{3}$' }
}

function Get-Answer($key, $prompt, $default, $check, $err) {
    while ($true) {
        if ($Config) {
            $v = $answers[$key]
            if ([string]::IsNullOrWhiteSpace($v)) { $v = $default }
        } else {
            $suffix = ''
            if ($default) { $suffix = " [$default]" }
            $v = Read-Host "$prompt$suffix"
            if ([string]::IsNullOrWhiteSpace($v)) { $v = $default }
        }
        if ($null -eq $v) { $v = '' }
        $v = $v.Trim()
        if (& $check $v) { return $v }
        if ($Config) { Die "Valor inválido o faltante para ${key}: $err" }
        Write-Host "  -> $err" -ForegroundColor Yellow
    }
}

function Read-Secret($prompt) {
    $s = Read-Host $prompt -AsSecureString
    $p = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

Write-Host '== Instalación de STODIA ==' -ForegroundColor Cyan
$apiUrl   = (Get-Answer 'API_URL' 'URL pública de la API' 'http://localhost:3000' $V.url 'Debe empezar con http:// o https://').TrimEnd('/')
$inst     = Get-Answer 'INSTITUTION_NAME' 'Nombre de la institución' '' $V.text 'Obligatorio (sin comilla simple)'
$taxId    = (Get-Answer 'TAX_ID' 'RNC / ID fiscal (9 dígitos)' '' $V.rnc 'El RNC debe tener 9 dígitos') -replace '\D', ''
$address  = Get-Answer 'ADDRESS' 'Dirección' '' $V.text 'Obligatoria'
$city     = Get-Answer 'CITY' 'Ciudad / provincia' '' $V.text 'Obligatoria'
$phone    = Get-Answer 'PHONE' 'Teléfono' '' $V.phone 'Teléfono inválido (7 a 20 dígitos/símbolos)'
$email    = Get-Answer 'CONTACT_EMAIL' 'Correo de contacto' '' $V.mail 'Correo inválido'
$adminName = Get-Answer 'ADMIN_NAME' 'Nombre completo del administrador' '' $V.text 'Obligatorio'
$adminUser = Get-Answer 'ADMIN_USER' 'Usuario del administrador' 'admin' $V.user '3-32 caracteres: minúsculas, números, . _ -'

# Contraseña: oculta, dos veces, mínimo 8; vacía = aleatoria (se muestra UNA sola vez al final)
$adminPwd = ''
$generated = ''
if ($Config) {
    $adminPwd = [string]$answers['ADMIN_PASSWORD']
    if ($adminPwd -ne '' -and ($adminPwd.Length -lt 8 -or $adminPwd -match "['\r\n]")) { Die 'ADMIN_PASSWORD inválida (mínimo 8 caracteres, sin comilla simple)' }
} else {
    while ($true) {
        $p1 = Read-Secret 'Contraseña del administrador (mín. 8; vacío = generar una)'
        if ($p1 -eq '') { break }
        if ($p1.Length -lt 8 -or $p1 -match "['\r\n]") { Write-Host '  -> Mínimo 8 caracteres y sin comilla simple' -ForegroundColor Yellow; continue }
        $p2 = Read-Secret 'Repite la contraseña'
        if ($p1 -ceq $p2) { $adminPwd = $p1; break }
        Write-Host '  -> No coinciden' -ForegroundColor Yellow
    }
}
if ($adminPwd -eq '') { $adminPwd = RandomBytesHex 9; $generated = $adminPwd }

$license  = Get-Answer 'LICENSE_KEY' 'Clave de licencia (STODIA1.…, la entrega STODIA; incluye el plan)' '' $V.lic 'Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA'
$webPort  = Get-Answer 'WEB_PORT' 'Puerto web' '8080' $V.port 'Puerto entre 1 y 65535'
$tz       = Get-Answer 'TIMEZONE' 'Zona horaria' 'America/Santo_Domingo' $V.tz 'Formato Region/Ciudad, p. ej. America/Santo_Domingo'
$currency = Get-Answer 'CURRENCY' 'Moneda (código ISO)' 'DOP' $V.cur 'Tres letras mayúsculas, p. ej. DOP'
$apiPort  = 3000

if (Test-Path .env) {
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    Copy-Item .env ".env.bak.$stamp"
    Write-Host "Se respaldó el .env existente en .env.bak.$stamp"
}

$lines = @(
    '# Generado por install.ps1. Contiene secretos: no compartir ni versionar.',
    "API_URL='$apiUrl'",
    "INSTITUTION_NAME='$inst'",
    "TAX_ID='$taxId'",
    "ADDRESS='$address'",
    "CITY='$city'",
    "PHONE='$phone'",
    "CONTACT_EMAIL='$email'",
    "ADMIN_NAME='$adminName'",
    "ADMIN_USER='$adminUser'",
    '# Solo se usa en el primer arranque; puede borrarse después.',
    "ADMIN_PASSWORD='$adminPwd'",
    "LICENSE_KEY='$license'",
    "WEB_PORT='$webPort'",
    "API_PORT='$apiPort'",
    "TIMEZONE='$tz'",
    "CURRENCY='$currency'",
    "JWT_SECRET='$(RandomBytesHex 32)'",
    "SEED_DEMO='false'"
)
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host '.env escrito.'

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '=========== STODIA instalado ===========' -ForegroundColor Green
Write-Host "Institución : $inst"
Write-Host "Web         : http://localhost:$webPort"
Write-Host "API         : $apiUrl   (salud: http://localhost:$apiPort/health)"
Write-Host "Admin       : usuario '$adminUser'"
if ($generated) {
    Write-Host "Contraseña generada (se muestra UNA sola vez, anótala y cámbiala al entrar): $generated" -ForegroundColor Yellow
} else {
    Write-Host 'Contraseña  : la indicada durante la instalación'
}
Write-Host '========================================' -ForegroundColor Green
