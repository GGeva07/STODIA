# Instalador STODIA (Windows). Lo ejecuta el proveedor en el equipo del cliente.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1                          (interactivo)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Config .\respuestas.env  (desatendido)
# Mismo flujo que install.sh. Este archivo debe guardarse en UTF-8 CON BOM (PowerShell 5.1).
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Die($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die 'Docker no está instalado o no está en el PATH. Instala Docker Desktop y vuelve a ejecutar.'
}
& docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { Die 'Se requiere Docker Compose v2 ("docker compose").' }

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

function RandomBytesHex($bytes) {
    $b = New-Object byte[] $bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b)
    return ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}
function RandomDigits6 {
    $b = New-Object byte[] 4
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b)
    return ([BitConverter]::ToUInt32($b, 0) % 1000000).ToString('000000')
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
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $out = & node $verify $v 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { Write-Host "  -> $out" -ForegroundColor Yellow; return $false }
    return $true
}
$Val = @{
    url   = { param($v) (NoQ $v) -and ($v -match '^(https?://\S+|/api)$') }
    text  = { param($v) (NoQ $v) -and $v.Length -ge 1 -and $v.Length -le 200 }
    rnc   = { param($v) Test-RncFormat $v }
    phone = { param($v) $v -match '^[0-9+() .-]{7,20}$' }
    mail  = { param($v) (NoQ $v) -and $v -match '^[^@\s]+@[^@\s]+\.[^@\s]+$' }
    from  = { param($v) (NoQ $v) -and $v.Length -le 200 -and $v -match '^[^@]+@[^@\s]+$' }
    opt   = { param($v) (NoQ $v) -and $v.Length -le 200 }
    user  = { param($v) $v -match '^[a-z0-9._-]{3,32}$' }
    pass  = { param($v) (NoQ $v) -and ($v -eq '' -or $v.Length -ge 8) }
    pin   = { param($v) (NoQ $v) -and ($v -eq '' -or ($v.Length -ge 4 -and $v.Length -le 8)) }
    lic   = { param($v) (NoQ $v) -and ($v -match '^STODIA1[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{86}$') -and (Test-LicenseSignature $v) }
    port  = { param($v) ($v -match '^[0-9]{1,5}$') -and ([int]$v -ge 1) -and ([int]$v -le 65535) }
    tz    = { param($v) $v -match '^(UTC|[A-Za-z_]+/[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)?)$' }
    cur   = { param($v) $v -cmatch '^[A-Z]{3}$' }
    cors  = { param($v) (NoQ $v) -and ($v -match '^https?://[^/\s,]+(/)?(,\s*https?://[^/\s,]+(/)?)*$') }
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

# Secreto opcional: oculto y dos veces (interactivo) o del archivo de respuestas. Vacío = el llamador genera uno.
function Get-SecretTwice($key, $prompt, $check, $err) {
    if ($Config) {
        $v = [string]$answers[$key]
        if (-not (& $check $v)) { Die "$key inválido: $err" }
        return $v
    }
    while ($true) {
        $p1 = Read-Secret $prompt
        if ($p1 -eq '') { return '' }
        if (-not (& $check $p1)) { Write-Host "  -> $err" -ForegroundColor Yellow; continue }
        $p2 = Read-Secret 'Repite'
        if ($p1 -ceq $p2) { return $p1 }
        Write-Host '  -> No coinciden' -ForegroundColor Yellow
    }
}

# Permisos restrictivos: solo el usuario actual (equivalente a chmod 600).
function Protect-File($path) {
    try {
        $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $path /inheritance:r /grant:r "${me}:(F)" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'icacls' }
    } catch { Write-Host "  (aviso: no se pudieron restringir los permisos de $path)" -ForegroundColor Yellow }
}

function Wait-Health($url, $secs) {
    $end = (Get-Date).AddSeconds($secs)
    while ((Get-Date) -lt $end) {
        try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { return $true } } catch { }
        Start-Sleep -Seconds 3
    }
    return $false
}

# >>> RNC (verificación en la DGII; las pruebas extraen este bloque)
# API de solo lectura. La clave va aquí a propósito (no es crítica): se rota cambiando esta constante o con STODIA_RNC_API_KEY.
# Nunca se imprime ni se escribe en .env/logs.
$script:RncApiUrl = 'https://rncvalidator.synsetsolutions.com'
if ($env:STODIA_RNC_API_URL) { $script:RncApiUrl = $env:STODIA_RNC_API_URL.TrimEnd('/') }
$script:RncApiKey = 'pXKKt5Xakkx4pNLCbZxNnKJiq64c9XXA'
if ($env:STODIA_RNC_API_KEY) { $script:RncApiKey = $env:STODIA_RNC_API_KEY }
$script:RncTimeout = 10
if ($env:STODIA_RNC_TIMEOUT) { $script:RncTimeout = [int]$env:STODIA_RNC_TIMEOUT }
$script:RncStop = @('srl', 'sa', 'sas', 'eirl', 'ltd', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'colegio', 'centro', 'educativo')

# 9 dígitos (empresa) u 11 (persona física/cédula); admite guiones, puntos y espacios.
function Test-RncFormat($v) {
    if ($null -eq $v) { return $false }
    $s = [string]$v
    if ($s -notmatch '^[0-9 .-]+$') { return $false }
    $n = ($s -replace '\D', '').Length
    return ($n -eq 9 -or $n -eq 11)
}
# Una línea, sin controles ni comilla simple (el .env va entre comillas simples).
function RncClean($v) {
    if ($null -eq $v) { return '' }
    $s = ([string]$v) -replace '[\x00-\x1F]+', ' '
    return $s.Replace("'", [string][char]0x2019).Trim()
}
function Get-RncTokens($s) {
    $n = ([string]$s).Normalize([System.Text.NormalizationForm]::FormD)
    $n = (($n -replace '\p{Mn}', '').ToLowerInvariant()) -replace '[^a-z0-9]+', ' '
    return @($n.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { $_.Length -ge 2 -and $script:RncStop -notcontains $_ } | Select-Object -Unique)
}
# % de coincidencia de tokens sobre la lista más corta.
function Get-RncScore($a, $b) {
    $a = @($a); $b = @($b)
    if ($a.Count -eq 0 -or $b.Count -eq 0) { return 0 }
    $c = @($a | Where-Object { $b -contains $_ }).Count
    return [int][math]::Floor(100 * $c / [math]::Min($a.Count, $b.Count))
}

# Consulta la DGII (timeout 10 s; 1 reintento solo ante error de red/5xx).
# Status: ok | inactive | notfound | unavailable (+ Motivo, Razon, Comercial, Estado)
function Invoke-RncQuery([string]$rnc) {
    $r = @{ Status = 'unavailable'; Motivo = ''; Razon = ''; Comercial = ''; Estado = '' }
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
    for ($try = 1; $try -le 2; $try++) {
        $retry = $false; $code = 0; $text = ''
        $r.Status = 'unavailable'; $r.Motivo = ''
        try {
            $req = [System.Net.HttpWebRequest]::Create("$($script:RncApiUrl)/api/v1/rnc/$rnc")
            $req.Method = 'GET'
            $req.Timeout = $script:RncTimeout * 1000
            $req.ReadWriteTimeout = $script:RncTimeout * 1000
            $req.UserAgent = 'stodia-installer'
            $req.Accept = 'application/json'
            $req.Headers.Add('x-api-key', $script:RncApiKey)
            $resp = $req.GetResponse()
            $code = [int]$resp.StatusCode
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
            $text = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
        } catch [System.Net.WebException] {
            $ex = $_.Exception
            if ($ex.Response) { $code = [int]$ex.Response.StatusCode; $ex.Response.Close() }
            elseif ($ex.Status -eq [System.Net.WebExceptionStatus]::Timeout) { $code = -1; $r.Motivo = 'tiempo de espera agotado' }
            else { $code = -1; $r.Motivo = 'sin conexión con el servicio' }
        } catch {
            $code = -1; $r.Motivo = 'sin respuesta del servicio (tiempo agotado o red)'
        }
        if ($code -eq -1) { $retry = $true }
        elseif ($code -eq 200) {
            $d = $null
            try { $j = $text | ConvertFrom-Json; $d = $j.data } catch { $d = $null }
            if ($null -eq $d -or $d -isnot [System.Management.Automation.PSCustomObject]) {
                $r.Status = 'unavailable'; $r.Motivo = 'respuesta inválida del servicio'
            } else {
                $r.Razon = RncClean $d.razon_social; $r.Comercial = RncClean $d.nombre_comercial
                $e1 = (RncClean $d.estatus).ToUpperInvariant(); $e2 = (RncClean $d.regimen).ToUpperInvariant()
                if ($e1 -eq 'ACTIVO' -or $e2 -eq 'ACTIVO') { $r.Status = 'ok'; $r.Estado = 'ACTIVO' }
                else {
                    $r.Status = 'inactive'
                    $r.Estado = $e1; if (-not $r.Estado) { $r.Estado = $e2 }; if (-not $r.Estado) { $r.Estado = 'NO INFORMADO' }
                }
            }
        }
        elseif ($code -eq 404) { $r.Status = 'notfound' }
        elseif ($code -eq 401 -or $code -eq 403) { $r.Motivo = "clave de la API rechazada (HTTP $code)" }
        elseif ($code -eq 429) { $r.Motivo = 'límite de consultas excedido (HTTP 429)' }
        elseif ($code -ge 500 -and $code -le 599) { $r.Motivo = "servicio no disponible (HTTP $code)"; $retry = $true }
        else { $r.Motivo = "respuesta inesperada (HTTP $code)" }
        if ($retry -and $try -lt 2) { continue }
        break
    }
    return $r
}

# Flujo completo. Devuelve @{ Abort; TaxId; Inst; Verificado; Razon; Comercial; Estado; At }. Abort = salir con código 2.
# $mode: 'omitir' = continuar sin verificar ante B/C/D (también en desatendido). $unattended = hay archivo de respuestas.
function Resolve-Rnc([string]$taxId, [string]$inst, [string]$mode, [bool]$unattended) {
    $res = @{ Abort = $false; TaxId = $taxId; Inst = $inst; Verificado = 'false'; Razon = ''; Comercial = ''; Estado = ''; At = '' }
    $mode = ([string]$mode).ToLowerInvariant()
    $nf = 0
    :rncloop while ($true) {
        $res.TaxId = ($res.TaxId -replace '\D', '')
        Write-Host "Verificando el RNC $($res.TaxId) en la DGII..."
        $q = Invoke-RncQuery $res.TaxId
        switch ($q.Status) {
            'ok' {
                $shown = $q.Razon
                if ($q.Comercial) { $shown = "$($q.Razon) ($($q.Comercial))" }
                Write-Host "RNC verificado en la DGII: $shown · ACTIVO" -ForegroundColor Green
                $ut = Get-RncTokens $res.Inst
                if ($ut.Count -gt 0) {
                    $s1 = Get-RncScore $ut (Get-RncTokens $q.Razon); $s2 = Get-RncScore $ut (Get-RncTokens $q.Comercial)
                    if ($s1 -lt 50 -and $s2 -lt 50) {
                        Write-Host "AVISO: el nombre de la institución ('$($res.Inst)') no se parece a la razón social ni al nombre comercial registrados para este RNC. Revisa que el RNC sea el correcto." -ForegroundColor Yellow
                        if (-not $unattended) {
                            $a = Read-Host '¿Usar la razón social oficial como nombre de la institución? [s/N]'
                            if ($a -match '^\s*[sSyY]' -and $q.Razon) { $res.Inst = $q.Razon }
                        }
                    }
                }
                if (-not $unattended) {
                    $a = Read-Host '¿Es esta la institución? [S/n]'
                    if ($a -match '^\s*[nN]') {
                        $res.TaxId = Get-Answer 'TAX_ID' 'RNC / ID fiscal (9 dígitos empresa u 11 persona física)' '' $Val.rnc 'El RNC debe tener 9 dígitos (empresa) u 11 (persona física/cédula)'
                        continue rncloop
                    }
                }
                $res.Verificado = 'true'; $res.Razon = $q.Razon; $res.Comercial = $q.Comercial; $res.Estado = 'ACTIVO'
                $res.At = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
                return $res
            }
            'inactive' {
                Write-Host "El RNC existe en la DGII pero su estado NO es activo: $($q.Estado) ($($q.Razon))." -ForegroundColor Yellow
                $res.Razon = $q.Razon; $res.Comercial = $q.Comercial; $res.Estado = $q.Estado
                if ($mode -eq 'omitir') { Write-Host 'Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado.' -ForegroundColor Yellow; return $res }
                if ($unattended) { Write-Host 'ERROR: instalación desatendida abortada: el RNC no está activo en la DGII (RNC_VERIFICACION=omitir para continuar sin verificar).' -ForegroundColor Red; $res.Abort = $true; return $res }
                $a = Read-Host 'Escribe otro RNC, o FORZAR para continuar bajo tu responsabilidad'
                if ($a -ceq 'FORZAR') { Write-Host 'Se continúa SIN verificar. RNC no verificado.' -ForegroundColor Yellow; return $res }
                $res.Razon = ''; $res.Comercial = ''; $res.Estado = ''
                if (Test-RncFormat $a) { $res.TaxId = $a } else { Write-Host '  -> RNC inválido (9 u 11 dígitos)' -ForegroundColor Yellow }
            }
            'notfound' {
                Write-Host 'RNC no encontrado en el padrón de la DGII.' -ForegroundColor Yellow
                $nf++
                if ($mode -eq 'omitir') { Write-Host 'Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado.' -ForegroundColor Yellow; return $res }
                if ($unattended) { Write-Host 'ERROR: instalación desatendida abortada: RNC no encontrado en el padrón de la DGII (RNC_VERIFICACION=omitir para continuar sin verificar).' -ForegroundColor Red; $res.Abort = $true; return $res }
                if ($nf -ge 3) {
                    $a = Read-Host 'Tres intentos sin éxito. Escribe FORZAR para continuar bajo tu responsabilidad, o Enter para abortar'
                    if ($a -ceq 'FORZAR') { Write-Host 'Se continúa SIN verificar. RNC no verificado.' -ForegroundColor Yellow; return $res }
                    Write-Host 'ERROR: instalación abortada: RNC no encontrado.' -ForegroundColor Red; $res.Abort = $true; return $res
                }
                $a = Read-Host 'Escribe otro RNC (9 u 11 dígitos), o FORZAR para continuar bajo tu responsabilidad'
                if ($a -ceq 'FORZAR') { Write-Host 'Se continúa SIN verificar. RNC no verificado.' -ForegroundColor Yellow; return $res }
                if (Test-RncFormat $a) { $res.TaxId = $a } else { Write-Host '  -> RNC inválido (9 u 11 dígitos)' -ForegroundColor Yellow }
            }
            default {
                Write-Host "No se pudo verificar el RNC ($($q.Motivo))." -ForegroundColor Yellow
                if ($mode -eq 'omitir') { Write-Host 'Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado.' -ForegroundColor Yellow; return $res }
                if ($unattended) { Write-Host 'ERROR: instalación desatendida abortada: no se pudo verificar el RNC (RNC_VERIFICACION=omitir para continuar sin verificar).' -ForegroundColor Red; $res.Abort = $true; return $res }
                $a = Read-Host 'Escribe SI para continuar SIN verificar el RNC, o Enter para reintentar'
                if ($a -match '^\s*[sS][iíIÍ]\s*$') { Write-Host 'Se continúa SIN verificar. RNC no verificado.' -ForegroundColor Yellow; return $res }
            }
        }
    }
}
# <<< RNC

Write-Host '== Instalación de STODIA (servidor) ==' -ForegroundColor Cyan
# Modo 'pendiente' (recomendado): el servidor arranca sin datos del colegio y muestra un CÓDIGO DE ACTIVACIÓN; los datos se ponen
# desde la primera PC con install-cliente.ps1 (modo nueva). Modo 'completo': se preguntan aquí, como siempre.
$modo = Get-Answer 'MODO_SERVIDOR' "Modo: 'pendiente' (los datos del colegio se ponen desde la primera PC) o 'completo' (se ponen aquí)" 'pendiente' { param($v) $v -eq 'pendiente' -or $v -eq 'completo' } 'Escribe pendiente o completo'
$apiUrl    = (Get-Answer 'API_URL' 'URL pública de la API (o /api para servirla tras el proxy de la web)' '/api' $Val.url 'Debe empezar con http:// o https://, o ser /api').TrimEnd('/')
$inst = ''; $taxId = ''; $address = ''; $city = ''; $phone = ''; $email = ''; $adminName = ''; $adminUser = 'admin'; $adminPwd = ''; $pin = ''; $genPwd = ''; $genPin = ''
$rnc = [pscustomobject]@{ Verificado = ''; Razon = ''; Comercial = ''; Estado = ''; At = ''; TaxId = ''; Inst = ''; Abort = $false }
if ($modo -eq 'completo') {
$inst      = Get-Answer 'INSTITUTION_NAME' 'Nombre de la institución' '' $Val.text 'Obligatorio (sin comilla simple)'
$taxId     = (Get-Answer 'TAX_ID' 'RNC / ID fiscal (9 dígitos empresa u 11 persona física)' '' $Val.rnc 'El RNC debe tener 9 dígitos (empresa) u 11 (persona física/cédula)') -replace '\D', ''
# Valida el RNC contra la DGII ANTES de pedir el resto y de crear nada (puede ajustar $taxId/$inst).
$rncMode = $env:RNC_VERIFICACION
if ($Config -and -not $rncMode) { $rncMode = $answers['RNC_VERIFICACION'] }
$rnc = Resolve-Rnc $taxId $inst $rncMode ([bool]$Config)
if ($rnc.Abort) { exit 2 }
$taxId = $rnc.TaxId; $inst = $rnc.Inst
$address   = Get-Answer 'ADDRESS' 'Dirección' '' $Val.text 'Obligatoria'
$city      = Get-Answer 'CITY' 'Ciudad / provincia' '' $Val.text 'Obligatoria'
$phone     = Get-Answer 'PHONE' 'Teléfono' '' $Val.phone 'Teléfono inválido (7 a 20 dígitos/símbolos)'
$email     = Get-Answer 'CONTACT_EMAIL' 'Correo de contacto' '' $Val.mail 'Correo inválido'
$adminName = Get-Answer 'ADMIN_NAME' 'Nombre completo del administrador' '' $Val.text 'Obligatorio'
$adminUser = Get-Answer 'ADMIN_USER' 'Usuario del administrador' 'admin' $Val.user '3-32 caracteres: minúsculas, números, . _ -'

# Contraseña del admin: oculta, dos veces, mínimo 8; vacía = aleatoria (se muestra UNA sola vez al final)
$adminPwd = Get-SecretTwice 'ADMIN_PASSWORD' 'Contraseña del administrador (mín. 8; vacío = generar una)' $Val.pass 'Mínimo 8 caracteres y sin comilla simple'
$genPwd = ''
if ($adminPwd -eq '') { $adminPwd = RandomBytesHex 9; $genPwd = $adminPwd }
# PIN de supervisor: oculto, dos veces, 4-8 caracteres; vacío = 6 dígitos aleatorios (se muestra UNA sola vez)
$pin = Get-SecretTwice 'SUPERVISOR_PIN' 'PIN de supervisor (4 a 8 caracteres; vacío = generar uno)' $Val.pin 'De 4 a 8 caracteres, sin comilla simple'
$genPin = ''
if ($pin -eq '') { $pin = RandomDigits6; $genPin = $pin }

$license  = Get-Answer 'LICENSE_KEY' 'Clave de licencia (STODIA1.…, la entrega STODIA; incluye el plan)' '' $Val.lic 'Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA'
} else {
$license  = Get-Answer 'LICENSE_KEY' 'Clave de licencia (opcional: vacío = se pega en la activación desde la PC)' '' { param($v) $v -eq '' -or (& $Val.lic $v) } 'Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA'
}
$webPort  = Get-Answer 'WEB_PORT' 'Puerto web' '8080' $Val.port 'Puerto entre 1 y 65535'
$apiPort  = Get-Answer 'API_PORT' 'Puerto de la API en este equipo' '3000' $Val.port 'Puerto entre 1 y 65535'
if ($webPort -eq $apiPort) { Die 'WEB_PORT y API_PORT no pueden ser iguales.' }

# URL pública de la web (origen CORS). Por defecto: esquema+host de la API y el puerto web.
$scheme = 'http'; $host_ = 'localhost'
if ($apiUrl -match '^(https?)://([^/:]+)') { $scheme = $Matches[1]; $host_ = $Matches[2] }
$portSfx = ":$webPort"
if (($scheme -eq 'http' -and $webPort -eq '80') -or ($scheme -eq 'https' -and $webPort -eq '443')) { $portSfx = '' }
$corsDefault = "${scheme}://${host_}${portSfx}"
$cors = Get-Answer 'CORS_ORIGIN' 'URL pública de la web (origen permitido por CORS)' $corsDefault $Val.cors 'Una o varias URL http(s)://host[:puerto] separadas por coma, sin ruta'
$cors = (($cors -split ',') | ForEach-Object { $_.Trim().TrimEnd('/') }) -join ','

$tz       = Get-Answer 'TIMEZONE' 'Zona horaria' 'America/Santo_Domingo' $Val.tz 'Formato Region/Ciudad, p. ej. America/Santo_Domingo'
$currency = Get-Answer 'CURRENCY' 'Moneda (código ISO)' 'DOP' $Val.cur 'Tres letras mayúsculas, p. ej. DOP'

# Correo saliente (opcional). Desatendido: se configura si SMTP_HOST viene con valor.
$smtp = @{}
$doSmtp = $false
if ($Config) { $doSmtp = -not [string]::IsNullOrWhiteSpace($answers['SMTP_HOST']) }
else { $doSmtp = ((Read-Host '¿Configurar correo saliente ahora? (s/n) [n]') -match '^\s*[sSyY]') }
if ($doSmtp) {
    $smtp.HOST = Get-Answer 'SMTP_HOST' 'Servidor SMTP' '' $Val.text 'Obligatorio si configuras el correo'
    $smtp.PORT = Get-Answer 'SMTP_PORT' 'Puerto SMTP' '587' $Val.port 'Puerto entre 1 y 65535'
    $smtp.USER = Get-Answer 'SMTP_USER' 'Usuario SMTP (vacío = sin autenticación)' '' $Val.opt 'Sin comilla simple'
    $smtp.PASS = Get-SecretTwice 'SMTP_PASS' 'Contraseña SMTP (vacío = ninguna)' $Val.opt 'Sin comilla simple (máx. 200)'
    $smtp.FROM = Get-Answer 'SMTP_FROM' 'Remitente (From)' $email $Val.from 'Dirección de correo del remitente'
}

# Tras el proxy de la web (/api): la API confía en X-Forwarded-For y solo escucha en loopback.
$trustProxy = 'false'; $apiBind = '0.0.0.0'
if ($apiUrl -eq '/api') { $trustProxy = 'true'; $apiBind = '127.0.0.1' }

# JWT_SECRET: se conserva el de una instalación previa (no cerrar sesiones al reinstalar).
$jwt = ''
if (Test-Path .env) {
    foreach ($l in [System.IO.File]::ReadAllLines((Join-Path $PSScriptRoot '.env'))) {
        if ($l -match "^JWT_SECRET='([A-Za-z0-9]{32,})'$") { $jwt = $Matches[1] }
    }
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    Copy-Item .env ".env.bak.$stamp"
    Protect-File (Join-Path $PSScriptRoot ".env.bak.$stamp")
    Write-Host "Se respaldó el .env existente en .env.bak.$stamp"
}
if ($jwt -eq '') { $jwt = RandomBytesHex 32 }

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
    '# ADMIN_PASSWORD y SUPERVISOR_PIN solo se usan en el primer arranque; el instalador los borra tras comprobar /health.',
    "ADMIN_PASSWORD='$adminPwd'",
    "SUPERVISOR_PIN='$pin'",
    "LICENSE_KEY='$license'",
    "WEB_PORT='$webPort'",
    "API_PORT='$apiPort'",
    "API_BIND='$apiBind'",
    "TRUST_PROXY='$trustProxy'",
    "CORS_ORIGIN='$cors'",
    "TIMEZONE='$tz'",
    "CURRENCY='$currency'",
    "JWT_SECRET='$jwt'",
    "SEED_DEMO='false'",
    "RNC_VERIFICADO='$($rnc.Verificado)'",
    "RNC_RAZON_SOCIAL='$($rnc.Razon)'",
    "RNC_NOMBRE_COMERCIAL='$($rnc.Comercial)'",
    "RNC_ESTADO='$($rnc.Estado)'",
    "RNC_VERIFICADO_AT='$($rnc.At)'"
)
if ($doSmtp) {
    $lines += "SMTP_HOST='$($smtp.HOST)'"
    $lines += "SMTP_PORT='$($smtp.PORT)'"
    $lines += "SMTP_USER='$($smtp.USER)'"
    $lines += "SMTP_PASS='$($smtp.PASS)'"
    $lines += "SMTP_FROM='$($smtp.FROM)'"
}
$envPath = Join-Path $PSScriptRoot '.env'
New-Item -ItemType File -Path $envPath -Force | Out-Null
Protect-File $envPath
[System.IO.File]::WriteAllLines($envPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host '.env escrito (solo accesible por el usuario actual).'

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Comprueba /health; si responde, el seed ya consumió ADMIN_PASSWORD y SUPERVISOR_PIN: se borran del .env.
$timeout = 120
if ($env:STODIA_HEALTH_TIMEOUT) { $timeout = [int]$env:STODIA_HEALTH_TIMEOUT }
Write-Host "Esperando a la API (http://localhost:$apiPort/health)..."
$cleared = $false
if (Wait-Health "http://localhost:$apiPort/health" $timeout) {
    $out = foreach ($l in [System.IO.File]::ReadAllLines($envPath)) {
        if ($l -match '^ADMIN_PASSWORD=') { "ADMIN_PASSWORD=''" }
        elseif ($l -match '^SUPERVISOR_PIN=') { "SUPERVISOR_PIN=''" }
        else { $l }
    }
    [System.IO.File]::WriteAllLines($envPath, [string[]]$out, (New-Object System.Text.UTF8Encoding($false)))
    $cleared = $true
    # Recrea solo la API (sin reconstruir) para que el contenedor deje de tener esos valores en su entorno.
    docker compose up -d --no-build api
    if ($LASTEXITCODE -ne 0) { Write-Host '  (aviso: no se pudo recrear la API; ejecuta "docker compose up -d" luego)' -ForegroundColor Yellow }
} else {
    Write-Host 'AVISO: la API no respondió en /health. Revisa "docker compose logs api".' -ForegroundColor Yellow
}

$webShown = $cors.Split(',')[0]
$apiShown = $apiUrl
if ($apiUrl -eq '/api') { $apiShown = "$webShown/api" }
Write-Host ''
Write-Host '=========== STODIA instalado ===========' -ForegroundColor Green
if ($modo -eq 'pendiente') {
    $codigo = ''
    try { $codigo = ((& docker compose exec -T api sh -c 'head -n 1 /data/codigo-activacion.txt 2>/dev/null') | Select-Object -First 1).Trim() } catch { }
    Write-Host 'Estado      : PENDIENTE DE ACTIVACIÓN' -ForegroundColor Yellow
    if ($codigo) { Write-Host "Código      : $codigo   (vence en 72 h; un solo uso)" -ForegroundColor Yellow } else { Write-Host 'Código      : aún no disponible (docker compose logs api | findstr Código)' }
    Write-Host "Web         : http://localhost:$webPort   (pública: $webShown)"
    Write-Host 'Siguiente   : en la primera PC ejecuta install-cliente.ps1 (modo nueva) con la dirección pública y este código.'
    Write-Host '========================================'
    exit 0
}
Write-Host "Institución : $inst"
if ($rnc.Verificado -eq 'true') { Write-Host "RNC         : $taxId (verificado en la DGII)" } else { Write-Host "RNC         : $taxId (NO verificado: confírmalo luego en Configuración)" -ForegroundColor Yellow }
Write-Host "Web         : http://localhost:$webPort   (pública: $webShown)"
Write-Host "API         : $apiShown   (salud: http://localhost:$apiPort/health)"
Write-Host "Admin       : usuario '$adminUser'"
if ($genPwd) { Write-Host "Contraseña generada (se muestra UNA sola vez, anótala y cámbiala al entrar): $genPwd" -ForegroundColor Yellow }
else { Write-Host 'Contraseña  : la indicada durante la instalación' }
if ($genPin) { Write-Host "PIN de supervisor generado (UNA sola vez, anótalo; se cambia en Configuración): $genPin" -ForegroundColor Yellow }
else { Write-Host 'PIN supervisor: el indicado durante la instalación' }
if ($cleared) { Write-Host 'ADMIN_PASSWORD y SUPERVISOR_PIN se borraron de .env tras comprobar /health.' }
else { Write-Host 'IMPORTANTE: cuando la API arranque, BORRA ADMIN_PASSWORD y SUPERVISOR_PIN de .env (valores vacíos) y ejecuta "docker compose up -d".' -ForegroundColor Yellow }
if ($Config) { Write-Host "IMPORTANTE: elimina el archivo de respuestas ($Config): contiene secretos." -ForegroundColor Yellow }
Write-Host 'Respaldos: .\backup.ps1 (ver README).'
Write-Host '========================================' -ForegroundColor Green
