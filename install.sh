#!/bin/sh
# Instalador STODIA (Linux/macOS). Lo ejecuta el proveedor en el equipo del cliente.
#   sh ./install.sh                         interactivo
#   sh ./install.sh --config respuestas.env desatendido (ver .env.example para las claves)
# Mismo flujo que install.ps1.
set -e
cd "$(dirname "$0")"

CONFIG=""
if [ "$1" = "--config" ]; then CONFIG="$2"; [ -f "$CONFIG" ] || { echo "No existe el archivo de respuestas: $CONFIG" >&2; exit 1; }; fi

die() { echo "ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || die "Docker no está instalado o no está en el PATH."
docker compose version >/dev/null 2>&1 || die 'Se requiere Docker Compose v2 ("docker compose").'

secret() { # $1 bytes (hex)
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
digits6() {
  n=$(od -An -N4 -tu4 /dev/urandom | tr -d ' \n')
  printf '%06d' $((n % 1000000))
}

# Valor de CLAVE en el archivo de respuestas (admite 'x', "x" o x; sin comillas, " # comentario" final se ignora)
cfgval() {
  l=$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$CONFIG" | tail -n 1 | sed -e 's/\r$//' -e 's/^[^=]*=//' -e 's/^[[:space:]]*//') || true
  case $l in
    \'*) printf '%s' "$l" | sed -e "s/^'//" -e "s/'.*$//" ;;
    \"*) printf '%s' "$l" | sed -e 's/^"//' -e 's/".*$//' ;;
    *)   printf '%s' "$l" | sed -e 's/[[:space:]]*#.*$//' -e 's/[[:space:]]*$//' ;;
  esac
}

ask() { # $1 prompt, $2 default -> stdout (el prompt va a stderr)
  if [ -n "$2" ]; then printf '%s [%s]: ' "$1" "$2" >&2; else printf '%s: ' "$1" >&2; fi
  read -r a || return 1
  if [ -n "$a" ]; then printf '%s' "$a"; else printf '%s' "$2"; fi
}

readsecret() { # $1 prompt -> variable SECRET (sin eco)
  printf '%s: ' "$1" >&2
  stty -echo 2>/dev/null || true
  read -r SECRET || { stty echo 2>/dev/null || true; die "Entrada cerrada."; }
  stty echo 2>/dev/null || true
  echo >&2
}

# ---- validadores (0 = válido). Ningún valor admite comilla simple ni saltos de línea.
noq() { case $1 in *"'"*) return 1;; esac; return 0; }
v_url()   { noq "$1" && printf '%s' "$1" | grep -Eq '^(https?://[^ ]+|/api)$'; }
v_text()  { noq "$1" && [ -n "$1" ] && [ ${#1} -le 200 ]; }
v_opt()   { noq "$1" && [ ${#1} -le 200 ]; }
v_rnc()   { [ "$(printf '%s' "$1" | tr -cd '0-9' | wc -c | tr -d ' ')" = 9 ] && printf '%s' "$1" | grep -Eq '^[0-9 -]+$'; }
v_phone() { printf '%s' "$1" | grep -Eq '^[0-9+() .-]{7,20}$'; }
v_mail()  { noq "$1" && printf '%s' "$1" | grep -Eq '^[^@ ]+@[^@ ]+\.[^@ ]+$'; }
v_from()  { noq "$1" && [ ${#1} -le 200 ] && printf '%s' "$1" | grep -Eq '^[^@]+@[^@ ]+$'; }
v_user()  { printf '%s' "$1" | grep -Eq '^[a-z0-9._-]{3,32}$'; }
v_pass()  { noq "$1" && { [ -z "$1" ] || [ ${#1} -ge 8 ]; }; }
v_pin()   { noq "$1" && { [ -z "$1" ] || { [ ${#1} -ge 4 ] && [ ${#1} -le 8 ]; }; }; }
# Formato STODIA1.<payload>.<firma 86 car.>; con node disponible también verifica la firma y la vigencia.
v_lic()   {
  noq "$1" && printf '%s' "$1" | grep -Eq '^STODIA1[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{86}$' || return 1
  if command -v node >/dev/null 2>&1 && [ -f "./scripts/license/verify.mjs" ]; then
    out=$(node "./scripts/license/verify.mjs" "$1" 2>&1) || { echo "  -> $out" >&2; return 1; }
  elif [ -z "$LIC_WARNED" ]; then LIC_WARNED=1; echo "  (aviso: sin Node.js solo se validó el formato; la API verificará la firma al arrancar.)" >&2; fi
  return 0
}
v_port()  { printf '%s' "$1" | grep -Eq '^[0-9]{1,5}$' && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
v_tz()    { printf '%s' "$1" | grep -Eq '^(UTC|[A-Za-z_]+/[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)?)$'; }
v_cur()   { printf '%s' "$1" | grep -Eq '^[A-Z]{3}$'; }
v_cors()  { noq "$1" && printf '%s' "$1" | grep -Eq '^https?://[^/ ,]+/?(, *https?://[^/ ,]+/?)*$'; }

# get VAR "pregunta" "defecto" validador "mensaje de error"
get() {
  while :; do
    if [ -n "$CONFIG" ]; then v=$(cfgval "$1"); [ -n "$v" ] || v=$3
    else v=$(ask "$2" "$3") || die "Entrada cerrada."; fi
    if "$4" "$v"; then break; fi
    if [ -n "$CONFIG" ]; then die "Valor inválido o faltante para $1: $5"; fi
    echo "  -> $5" >&2
  done
  eval "$1=\$v"
}

# getsecret VAR "pregunta" validador "mensaje": oculto y dos veces (interactivo) o del archivo de respuestas.
# Vacío = el llamador genera uno.
getsecret() {
  if [ -n "$CONFIG" ]; then
    v=$(cfgval "$1")
    "$3" "$v" || die "$1 inválido: $4"
    eval "$1=\$v"; return 0
  fi
  while :; do
    readsecret "$2"; p1=$SECRET
    if [ -z "$p1" ]; then eval "$1="; return 0; fi
    "$3" "$p1" || { echo "  -> $4" >&2; continue; }
    readsecret "Repite"
    if [ "$p1" = "$SECRET" ]; then eval "$1=\$p1"; return 0; fi
    echo "  -> No coinciden" >&2
  done
}

health() { # $1 url, $2 segundos. 0 = ok, 1 = sin respuesta, 2 = sin curl/wget
  end=$(( $(date +%s) + $2 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    if command -v curl >/dev/null 2>&1; then curl -fsS -m 5 -o /dev/null "$1" 2>/dev/null && return 0
    elif command -v wget >/dev/null 2>&1; then wget -q -T 5 -O /dev/null "$1" 2>/dev/null && return 0
    else return 2; fi
    sleep 3
  done
  return 1
}

echo "== Instalación de STODIA =="
get API_URL          "URL pública de la API (o /api para servirla tras el proxy de la web)" "http://localhost:3000" v_url "Debe empezar con http:// o https://, o ser /api"
get INSTITUTION_NAME "Nombre de la institución" "" v_text "Obligatorio (sin comilla simple)"
get TAX_ID           "RNC / ID fiscal (9 dígitos)" "" v_rnc "El RNC debe tener 9 dígitos"
get ADDRESS          "Dirección" "" v_text "Obligatoria"
get CITY             "Ciudad / provincia" "" v_text "Obligatoria"
get PHONE            "Teléfono" "" v_phone "Teléfono inválido (7 a 20 dígitos/símbolos)"
get CONTACT_EMAIL    "Correo de contacto" "" v_mail "Correo inválido"
get ADMIN_NAME       "Nombre completo del administrador" "" v_text "Obligatorio"
get ADMIN_USER       "Usuario del administrador" "admin" v_user "3-32 caracteres: minúsculas, números, . _ -"

# Contraseña del admin: oculta, dos veces, mínimo 8; vacía = aleatoria (se muestra UNA sola vez al final)
getsecret ADMIN_PASSWORD "Contraseña del administrador (mín. 8; vacío = generar una)" v_pass "Mínimo 8 caracteres y sin comilla simple"
GEN_PWD=""
if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD=$(secret 9); GEN_PWD=$ADMIN_PASSWORD; fi
# PIN de supervisor: oculto, dos veces, 4-8 caracteres; vacío = 6 dígitos aleatorios (se muestra UNA sola vez)
getsecret SUPERVISOR_PIN "PIN de supervisor (4 a 8 caracteres; vacío = generar uno)" v_pin "De 4 a 8 caracteres, sin comilla simple"
GEN_PIN=""
if [ -z "$SUPERVISOR_PIN" ]; then SUPERVISOR_PIN=$(digits6); GEN_PIN=$SUPERVISOR_PIN; fi

get LICENSE_KEY  "Clave de licencia (STODIA1.…, la entrega STODIA; incluye el plan)" "" v_lic "Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA"
get WEB_PORT     "Puerto web" "8080" v_port "Puerto entre 1 y 65535"
get API_PORT     "Puerto de la API en este equipo" "3000" v_port "Puerto entre 1 y 65535"
[ "$WEB_PORT" != "$API_PORT" ] || die "WEB_PORT y API_PORT no pueden ser iguales."
API_URL=${API_URL%/}
TAX_ID=$(printf '%s' "$TAX_ID" | tr -cd '0-9')

# URL pública de la web (origen CORS). Por defecto: esquema+host de la API y el puerto web.
SCHEME=http; HOST=localhost
case $API_URL in
  http://*|https://*)
    SCHEME=${API_URL%%://*}
    HOST=$(printf '%s' "${API_URL#*://}" | sed -e 's#[/:].*$##') ;;
esac
PORT_SFX=":$WEB_PORT"
{ [ "$SCHEME" = http ] && [ "$WEB_PORT" = 80 ]; } && PORT_SFX=""
{ [ "$SCHEME" = https ] && [ "$WEB_PORT" = 443 ]; } && PORT_SFX=""
get CORS_ORIGIN  "URL pública de la web (origen permitido por CORS)" "$SCHEME://$HOST$PORT_SFX" v_cors "Una o varias URL http(s)://host[:puerto] separadas por coma, sin ruta"
CORS_ORIGIN=$(printf '%s' "$CORS_ORIGIN" | sed -e 's/[[:space:]]//g' -e 's#/,#,#g' -e 's#/$##')

get TIMEZONE     "Zona horaria" "America/Santo_Domingo" v_tz "Formato Region/Ciudad, p. ej. America/Santo_Domingo"
get CURRENCY     "Moneda (código ISO)" "DOP" v_cur "Tres letras mayúsculas, p. ej. DOP"

# Correo saliente (opcional). Desatendido: se configura si SMTP_HOST viene con valor.
DO_SMTP=0
if [ -n "$CONFIG" ]; then
  [ -z "$(cfgval SMTP_HOST)" ] || DO_SMTP=1
else
  r=$(ask "¿Configurar correo saliente ahora? (s/n)" "n") || die "Entrada cerrada."
  case $r in [sSyY]*) DO_SMTP=1 ;; esac
fi
if [ "$DO_SMTP" = 1 ]; then
  get SMTP_HOST "Servidor SMTP" "" v_text "Obligatorio si configuras el correo"
  get SMTP_PORT "Puerto SMTP" "587" v_port "Puerto entre 1 y 65535"
  get SMTP_USER "Usuario SMTP (vacío = sin autenticación)" "" v_opt "Sin comilla simple"
  getsecret SMTP_PASS "Contraseña SMTP (vacío = ninguna)" v_opt "Sin comilla simple (máx. 200)"
  get SMTP_FROM "Remitente (From)" "$CONTACT_EMAIL" v_from "Dirección de correo del remitente"
fi

# Tras el proxy de la web (/api): la API confía en X-Forwarded-For y solo escucha en loopback.
TRUST_PROXY=false; API_BIND=0.0.0.0
if [ "$API_URL" = "/api" ]; then TRUST_PROXY=true; API_BIND=127.0.0.1; fi

umask 077
# JWT_SECRET: se conserva el de una instalación previa (no cerrar sesiones al reinstalar).
JWT=""
if [ -f .env ]; then
  JWT=$(grep -E "^JWT_SECRET='[A-Za-z0-9]{32,}'$" .env | tail -n 1 | sed -e "s/^JWT_SECRET='//" -e "s/'\$//") || true
  B=".env.bak.$(date +%Y%m%d%H%M%S)"
  cp .env "$B"; chmod 600 "$B"
  echo "Se respaldó el .env existente en $B"
fi
[ -n "$JWT" ] || JWT=$(secret 32)

{
  echo "# Generado por install.sh. Contiene secretos: no compartir ni versionar."
  echo "API_URL='$API_URL'"
  echo "INSTITUTION_NAME='$INSTITUTION_NAME'"
  echo "TAX_ID='$TAX_ID'"
  echo "ADDRESS='$ADDRESS'"
  echo "CITY='$CITY'"
  echo "PHONE='$PHONE'"
  echo "CONTACT_EMAIL='$CONTACT_EMAIL'"
  echo "ADMIN_NAME='$ADMIN_NAME'"
  echo "ADMIN_USER='$ADMIN_USER'"
  echo "# ADMIN_PASSWORD y SUPERVISOR_PIN solo se usan en el primer arranque; el instalador los borra tras comprobar /health."
  echo "ADMIN_PASSWORD='$ADMIN_PASSWORD'"
  echo "SUPERVISOR_PIN='$SUPERVISOR_PIN'"
  echo "LICENSE_KEY='$LICENSE_KEY'"
  echo "WEB_PORT='$WEB_PORT'"
  echo "API_PORT='$API_PORT'"
  echo "API_BIND='$API_BIND'"
  echo "TRUST_PROXY='$TRUST_PROXY'"
  echo "CORS_ORIGIN='$CORS_ORIGIN'"
  echo "TIMEZONE='$TIMEZONE'"
  echo "CURRENCY='$CURRENCY'"
  echo "JWT_SECRET='$JWT'"
  echo "SEED_DEMO='false'"
  if [ "$DO_SMTP" = 1 ]; then
    echo "SMTP_HOST='$SMTP_HOST'"
    echo "SMTP_PORT='$SMTP_PORT'"
    echo "SMTP_USER='$SMTP_USER'"
    echo "SMTP_PASS='$SMTP_PASS'"
    echo "SMTP_FROM='$SMTP_FROM'"
  fi
} > .env
chmod 600 .env
echo ".env escrito (permisos 600)."

docker compose up -d --build

# Comprueba /health; si responde, el seed ya consumió ADMIN_PASSWORD y SUPERVISOR_PIN: se borran del .env.
echo "Esperando a la API (http://localhost:$API_PORT/health)..."
CLEARED=0; rc=0
health "http://localhost:$API_PORT/health" "${STODIA_HEALTH_TIMEOUT:-120}" || rc=$?
if [ "$rc" = 0 ]; then
  sed -e "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=''/" -e "s/^SUPERVISOR_PIN=.*/SUPERVISOR_PIN=''/" .env > .env.tmp
  mv .env.tmp .env; chmod 600 .env
  CLEARED=1
  # Recrea solo la API (sin reconstruir) para que el contenedor deje de tener esos valores en su entorno.
  docker compose up -d --no-build api || echo '  (aviso: no se pudo recrear la API; ejecuta "docker compose up -d" luego)'
elif [ "$rc" = 2 ]; then
  echo "AVISO: sin curl ni wget no se pudo comprobar /health." >&2
else
  echo 'AVISO: la API no respondió en /health. Revisa "docker compose logs api".' >&2
fi

WEB_SHOWN=${CORS_ORIGIN%%,*}
API_SHOWN=$API_URL
[ "$API_URL" != "/api" ] || API_SHOWN="$WEB_SHOWN/api"
echo
echo "=========== STODIA instalado ==========="
echo "Institución : $INSTITUTION_NAME"
echo "Web         : http://localhost:$WEB_PORT   (pública: $WEB_SHOWN)"
echo "API         : $API_SHOWN   (salud: http://localhost:$API_PORT/health)"
echo "Admin       : usuario '$ADMIN_USER'"
if [ -n "$GEN_PWD" ]; then echo "Contraseña generada (se muestra UNA sola vez, anótala y cámbiala al entrar): $GEN_PWD"
else echo "Contraseña  : la indicada durante la instalación"; fi
if [ -n "$GEN_PIN" ]; then echo "PIN de supervisor generado (UNA sola vez, anótalo; se cambia en Configuración): $GEN_PIN"
else echo "PIN supervisor: el indicado durante la instalación"; fi
if [ "$CLEARED" = 1 ]; then echo "ADMIN_PASSWORD y SUPERVISOR_PIN se borraron de .env tras comprobar /health."
else echo 'IMPORTANTE: cuando la API arranque, BORRA ADMIN_PASSWORD y SUPERVISOR_PIN de .env (valores vacíos) y ejecuta "docker compose up -d".'; fi
[ -z "$CONFIG" ] || echo "IMPORTANTE: elimina el archivo de respuestas ($CONFIG): contiene secretos."
echo "Respaldos: sh ./backup.sh (ver README)."
echo "========================================"
