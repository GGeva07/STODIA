# Instalador del CLIENTE STODIA (Windows). Se ejecuta en cada PC del colegio.
#   powershell -ExecutionPolicy Bypass -File .\install-cliente.ps1                          (interactivo)
#   powershell -ExecutionPolicy Bypass -File .\install-cliente.ps1 -Config .\respuestas.env  (desatendido)
# Mismo flujo que install-cliente.sh. Claves del archivo: STODIA_URL, MODO (nueva|extension), CODIGO,
# INSTITUTION_NAME, TAX_ID, ADDRESS, CITY, PHONE, CONTACT_EMAIL, ADMIN_USER, ADMIN_NAME, ADMIN_PASSWORD,
# SUPERVISOR_PIN, LICENSE_KEY, TIMEZONE, CURRENCY (nueva); USUARIO, CLAVE (extension).
# Nunca imprime contraseñas. Este archivo debe guardarse en UTF-8 CON BOM (PowerShell 5.1).
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Die($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# Archivo de respuestas KEY=VALOR (admite 'x', "x" o x; sin comillas, " # comentario" final se ignora)
$answers = @{}
if ($Config) {
    if (-not (Test-Path -LiteralPath $Config)) { Die "No existe el archivo de respuestas: $Config" }
    foreach ($line in [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Config).Path, [System.Text.Encoding]::UTF8)) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') {
            $key = $Matches[1]; $val = $Matches[2].Trim()
            if ($val -match "^'([^']*)'") { $val = $Matches[1] }
            elseif ($val -match '^"([^"]*)"') { $val = $Matches[1] }
            else { $val = ($val -replace '\s+#.*$', '').Trim() }
            $answers[$key] = $val
        }
    }
}

# ---- validadores (true = válido). Ningún valor admite comilla simple ni saltos de línea.
function NoQ($v) { return ($v -notmatch "['\r\n]") }
function V-Req($v)   { return ((NoQ $v) -and $v.Length -ge 1 -and $v.Length -le 200) }
function V-Opt($v)   { return ((NoQ $v) -and $v.Length -le 200) }
function V-Url($v)   { return ((NoQ $v) -and ($v -match '^https?://[^ ]+$')) }
function V-Codigo($v){ return ($v -match '^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$') }
function V-Rnc($v)   { if ($v -notmatch '^[0-9 .-]+$') { return $false }; $n = ($v -replace '\D', '').Length; return ($n -eq 9 -or $n -eq 11) }
function V-Phone($v) { return ($v -match '^[0-9+() .-]{7,20}$') }
function V-Mail($v)  { return ((NoQ $v) -and ($v -match '^[^@ ]+@[^@ ]+\.[^@ ]+$')) }
function V-User($v)  { return ($v -match '^[a-z0-9._-]{3,32}$') }
function V-Pass($v)  { return ((NoQ $v) -and $v.Length -ge 8) }
function V-Pin($v)   { return ((NoQ $v) -and $v.Length -ge 4 -and $v.Length -le 8) }
function V-Lic($v)   { return ($v -eq '' -or ((NoQ $v) -and ($v -match '^STODIA1\.[A-Za-z0-9_.-]+$'))) }
function V-Tz($v)    { return ($v -match '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$') }
function V-Cur($v)   { return ($v -match '^[A-Z]{3}$') }

function Read-Plain($prompt) {
    $s = Read-Host $prompt -AsSecureString
    $p = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

# Valor de texto. Interactivo: pregunta con defecto y repite hasta validar. Desatendido: clave del archivo o defecto; falla si no es válido.
function Get-Val($key, $prompt, $default, $check, $err) {
    while ($true) {
        if ($Config) {
            $v = [string]$answers[$key]
            if ([string]::IsNullOrWhiteSpace($v)) { $v = $default }
        } else {
            $suffix = ''; if ($default) { $suffix = " [$default]" }
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

# Secreto (oculto). Interactivo: se pide dos veces si $twice. Desatendido: clave del archivo.
function Get-Secret($key, $prompt, $check, $err, $twice) {
    if ($Config) {
        $v = [string]$answers[$key]
        if (-not (& $check $v)) { Die "$key inválido: $err" }
        return $v
    }
    while ($true) {
        $p1 = Read-Plain $prompt
        if (-not (& $check $p1)) { Write-Host "  -> $err" -ForegroundColor Yellow; continue }
        if (-not $twice) { return $p1 }
        $p2 = Read-Plain 'Repite'
        if ($p1 -ceq $p2) { return $p1 }
        Write-Host '  -> No coinciden' -ForegroundColor Yellow
    }
}

function Get-YesNo($prompt) {
    while ($true) {
        $r = (Read-Host $prompt).Trim().ToLower()
        if ($r -in @('s', 'si', 'sí', 'y', 'yes')) { return $true }
        if ($r -in @('n', 'no')) { return $false }
        Write-Host '  Responde s o n.' -ForegroundColor Yellow
    }
}

# Llamada a la API. Devuelve @{ Code = <http>; Body = <texto> }. Code 0 = sin conexión.
function Invoke-Api([string]$method, [string]$url, $json) {
    $params = @{
        Uri = $url; Method = $method; UseBasicParsing = $true; TimeoutSec = 20
        Headers = @{ Accept = 'application/json' }
    }
    if ($null -ne $json) {
        $params.ContentType = 'application/json; charset=utf-8'
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    try {
        $r = Invoke-WebRequest @params
        return @{ Code = [int]$r.StatusCode; Body = [string]$r.Content }
    } catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { return @{ Code = 0; Body = '' } }
        $code = [int]$resp.StatusCode
        if ($resp -is [System.Net.HttpWebResponse]) {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
            $text = $sr.ReadToEnd(); $sr.Close()
        } else {
            $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        }
        return @{ Code = $code; Body = [string]$text }
    }
}

function ConvertFrom-JsonSafe($text) {
    try { return ($text | ConvertFrom-Json) } catch { return $null }
}

function Get-JsonErr($text) {
    $o = ConvertFrom-JsonSafe $text
    if ($o -and $o.error) { return [string]$o.error }
    return ''
}

# ---- 1. Dirección del servidor y detección de la API
$script:Api = ''; $script:Health = $null

function Test-Servidor([string]$base) {
    foreach ($ruta in @('/api/health', '/health')) {
        $r = Invoke-Api 'GET' ($base + $ruta) $null
        if ($r.Code -eq 200) {
            $o = ConvertFrom-JsonSafe $r.Body
            if ($o -and $o.status -eq 'ok') {
                $script:Api = if ($ruta -eq '/api/health') { "$base/api" } else { $base }
                $script:Health = $o
                return $true
            }
        }
    }
    return $false
}

Write-Host ''
Write-Host '=== Instalador del cliente STODIA ===' -ForegroundColor Cyan
while ($true) {
    if ($Config) { $web = [string]$answers['STODIA_URL'] }
    else { $web = (Read-Host 'Dirección del servidor STODIA (ej. https://colegio.ejemplo.com)').Trim() }
    $web = $web.TrimEnd('/')
    if (-not (V-Url $web)) {
        if ($Config) { Die 'STODIA_URL no es una dirección http(s) válida.' }
        Write-Host '  La dirección debe empezar por http:// o https://' -ForegroundColor Yellow
        continue
    }
    if (Test-Servidor $web) { break }
    if ($Config) { Die "No se pudo conectar con $web (probé /api/health y /health)." }
    Write-Host "  No se pudo conectar con $web (probé /api/health y /health). Revisa la dirección." -ForegroundColor Yellow
}

$estado = [string]$script:Health.estado
Write-Host ''
Write-Host "Servidor : $web"
Write-Host "  Versión    : $([string]$script:Health.version)"
Write-Host "  Estado     : $estado"
if ($script:Health.institucion) { Write-Host "  Institución: $([string]$script:Health.institucion)" }
Write-Host ''

# ---- 2. Modo: instalación nueva o extensión
if ($Config) {
    $modo = [string]$answers['MODO']
    if ($modo -notin @('nueva', 'extension')) { Die "MODO debe ser 'nueva' o 'extension'." }
} else {
    $modo = if (Get-YesNo '¿Es una instalación NUEVA (primera configuración del colegio)? (s/n)') { 'nueva' } else { 'extension' }
}
if ($modo -eq 'nueva' -and $estado -ne 'pendiente') {
    Write-Host 'Este servidor ya está activado. Se usa el modo extensión (usuario y contraseña de STODIA).' -ForegroundColor Yellow
    $modo = 'extension'
}
if ($modo -eq 'extension' -and $estado -eq 'pendiente') {
    Die 'Este servidor aún no está activado: ejecuta el instalador del cliente en modo instalación nueva.'
}

# Activación de un servidor pendiente. Devuelve $true si activó; $false si el servidor ya estaba activo.
function Invoke-Activacion {
    while ($true) {
        Write-Host '--- Datos de activación ---' -ForegroundColor Cyan
        $codigo = Get-Val 'CODIGO' 'Código de activación (XXXX-XXXX)' '' { param($v) V-Codigo $v } 'formato XXXX-XXXX'
        $codigo = ($codigo -replace '-', '').ToUpper(); $codigo = $codigo.Substring(0, 4) + '-' + $codigo.Substring(4)
        $inst    = Get-Val 'INSTITUTION_NAME' 'Nombre de la institución' '' { param($v) V-Req $v } 'obligatorio, sin comillas'
        $rnc     = Get-Val 'TAX_ID' 'RNC (9 u 11 dígitos)' '' { param($v) V-Rnc $v } 'debe tener 9 u 11 dígitos'
        $rncD    = ($rnc -replace '\D', '')
        $dir     = Get-Val 'ADDRESS' 'Dirección' '' { param($v) V-Req $v } 'obligatoria'
        $ciudad  = Get-Val 'CITY' 'Ciudad' '' { param($v) V-Req $v } 'obligatoria'
        $tel     = Get-Val 'PHONE' 'Teléfono' '' { param($v) V-Phone $v } '7 a 20 caracteres: dígitos, +, (), espacios o -'
        $mail    = Get-Val 'CONTACT_EMAIL' 'Correo de contacto' '' { param($v) V-Mail $v } 'correo no válido'
        $admUser = Get-Val 'ADMIN_USER' 'Usuario administrador' 'admin' { param($v) V-User $v } '3-32 caracteres: a-z, 0-9, ., _, -'
        $admName = Get-Val 'ADMIN_NAME' 'Nombre del administrador' 'Administrador' { param($v) V-Req $v } 'obligatorio'
        $admPass = Get-Secret 'ADMIN_PASSWORD' 'Contraseña del administrador (mín. 8)' { param($v) V-Pass $v } 'mínimo 8 caracteres' (-not $Config)
        $pin     = Get-Secret 'SUPERVISOR_PIN' 'PIN de supervisor (4-8 caracteres)' { param($v) V-Pin $v } 'entre 4 y 8 caracteres' (-not $Config)
        $lic     = Get-Val 'LICENSE_KEY' 'Licencia STODIA1.* (Enter = la del servidor)' '' { param($v) V-Lic $v } 'formato STODIA1.…'
        $tz      = Get-Val 'TIMEZONE' 'Zona horaria' 'America/Santo_Domingo' { param($v) V-Tz $v } 'formato Región/Ciudad'
        $moneda  = Get-Val 'CURRENCY' 'Moneda (código de 3 letras)' 'DOP' { param($v) V-Cur $v } 'tres letras mayúsculas'

        $body = [ordered]@{
            codigo = $codigo
            institucion = [ordered]@{ nombre = $inst; rnc = $rncD; direccion = $dir; ciudad = $ciudad; telefono = $tel; email = $mail }
            admin = [ordered]@{ usuario = $admUser; nombre = $admName; password = $admPass }
            pin = $pin
            zonaHoraria = $tz
            moneda = $moneda
        }
        if ($lic) { $body['licencia'] = $lic }
        $json = $body | ConvertTo-Json -Depth 6 -Compress

        Write-Host 'Activando el servidor...'
        $r = Invoke-Api 'POST' "$($script:Api)/instalacion/activar" $json
        $body = $null; $json = $null; $admPass = $null; $pin = $null   # no dejar secretos en memoria más de lo necesario
        $err = Get-JsonErr $r.Body
        switch ($r.Code) {
            201 {
                $o = ConvertFrom-JsonSafe $r.Body
                Write-Host "Servidor activado. Administrador: $([string]$o.admin)" -ForegroundColor Green
                if ($o.rnc -and $o.rnc.verificado) { Write-Host "RNC verificado en DGII: $([string]$o.rnc.razonSocial)" }
                else { Write-Host 'RNC no verificado (se puede revisar después en la app).' }
                return $true
            }
            409 { Write-Host 'El servidor ya está activado.' -ForegroundColor Yellow; return $false }
            403 {
                Write-Host "Código de activación inválido o vencido. $err" -ForegroundColor Red
                if ($Config) { Die 'Código de activación inválido o vencido.' }
                if (-not (Get-YesNo '¿Reintentar? (s/n)')) { Die 'Instalación cancelada.' }
            }
            422 {
                Write-Host "Datos no válidos: $(if ($err) { $err } else { 'revisa los campos' })" -ForegroundColor Red
                if ($Config) { Die "Datos no válidos: $err" }
                if (-not (Get-YesNo '¿Reintentar corrigiendo los datos? (s/n)')) { Die 'Instalación cancelada.' }
            }
            429 { Die 'Demasiados intentos fallidos desde esta IP. Espera antes de reintentar.' }
            default { Die "Error del servidor (HTTP $($r.Code)) $err" }
        }
    }
}

# Validación de usuario existente (solo valida; el token no se guarda).
function Invoke-Extension {
    for ($intento = 1; $intento -le 3; $intento++) {
        Write-Host '--- Validar usuario de STODIA ---' -ForegroundColor Cyan
        $usuario = Get-Val 'USUARIO' 'Usuario de STODIA' '' { param($v) V-Req $v } 'obligatorio'
        $clave = Get-Secret 'CLAVE' 'Contraseña' { param($v) V-Req $v } 'obligatoria' $false
        $json = [ordered]@{ usuario = $usuario; password = $clave } | ConvertTo-Json -Compress
        $r = Invoke-Api 'POST' "$($script:Api)/auth/login" $json
        $json = $null; $clave = $null
        switch ($r.Code) {
            200 { Write-Host 'Credenciales válidas. El token no se guarda: la app pedirá iniciar sesión.' -ForegroundColor Green; return }
            401 {
                if ($Config) { Die 'Usuario o contraseña incorrectos.' }
                Write-Host "Usuario o contraseña incorrectos ($intento de 3)." -ForegroundColor Yellow
            }
            429 { Die 'Demasiados intentos fallidos desde esta IP. Espera antes de reintentar.' }
            default { Die "Error del servidor al validar (HTTP $($r.Code))." }
        }
    }
    Die 'Se agotaron los 3 intentos de inicio de sesión.'
}

if ($modo -eq 'nueva') {
    if (-not (Invoke-Activacion)) { Invoke-Extension }
} else {
    Invoke-Extension
}

# ---- 4. Guardar la configuración de la app de escritorio (URL de la WEB, sin /api)
$cfgDir = Join-Path $env:APPDATA 'STODIA'
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = [ordered]@{ url = $web; configuradoEn = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
# UTF-8 SIN BOM: Electron no lee JSON con BOM.
[System.IO.File]::WriteAllText((Join-Path $cfgDir 'stodia.json'), (($cfg | ConvertTo-Json) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Configuración guardada en: $cfgDir\stodia.json" -ForegroundColor Green

# ---- 5. Instalar la app de escritorio (portátil): se descarga del Release de GitHub, o se usa el .zip que esté junto a este script
$appUrl  = if ($env:STODIA_APP_URL) { $env:STODIA_APP_URL } else { 'https://github.com/GGeva07/STODIA/releases/download/desktop-v0.1.0/STODIA-Windows-portable-0.1.0.zip' }
$appDir  = Join-Path $env:LOCALAPPDATA 'STODIA'
$appExe  = Join-Path $appDir 'stodia.exe'
$zipLocal = Get-ChildItem -Path $PSScriptRoot -Filter 'STODIA-Windows-portable-*.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
$instalar = $true
if (-not $Config) { $instalar = Get-YesNo "¿Descargar e instalar la aplicación STODIA en esta PC (con acceso directo en el escritorio)? (s/n)" }
if ($instalar) {
    $tmp = Join-Path $env:TEMP ('stodia-app-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        $zip = Join-Path $tmp 'app.zip'
        if ($zipLocal) { Write-Host "Usando $($zipLocal.Name) (junto al script)..."; Copy-Item -LiteralPath $zipLocal.FullName -Destination $zip }
        else {
            Write-Host 'Descargando la aplicación STODIA (unos 120 MB)...'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $oldPp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue' # la barra de PowerShell 5.1 hace la descarga mucho más lenta
            try { Invoke-WebRequest -Uri $appUrl -OutFile $zip -UseBasicParsing } finally { $ProgressPreference = $oldPp }
        }
        if ((Get-Item $zip).Length -lt 50MB) { throw 'La descarga está incompleta o dañada.' }
        Write-Host 'Instalando...'
        Get-Process -Name stodia -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir }
        Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
        $origen = Join-Path $tmp 'STODIA'
        if (-not (Test-Path (Join-Path $origen 'stodia.exe'))) { throw 'El paquete no contiene stodia.exe.' }
        Move-Item -LiteralPath $origen -Destination $appDir
        # Acceso directo en el escritorio y en el menú Inicio
        $ws = New-Object -ComObject WScript.Shell
        foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
            $lnk = $ws.CreateShortcut((Join-Path $dir 'STODIA.lnk'))
            $lnk.TargetPath = $appExe; $lnk.WorkingDirectory = $appDir; $lnk.Description = 'STODIA'; $lnk.Save()
        }
        Write-Host "STODIA instalada en $appDir. Usa el acceso directo del escritorio." -ForegroundColor Green
    } catch {
        Write-Host "No se pudo instalar la aplicación: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "La configuración ya quedó guardada. Descarga el .zip de $appUrl y vuelve a ejecutar este script." -ForegroundColor Yellow
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
} else {
    Write-Host 'Instalación de la app omitida. Ejecuta de nuevo el instalador para instalarla.'
}

Write-Host ''
Write-Host "Listo. Abre STODIA: se conectará a $web" -ForegroundColor Green
