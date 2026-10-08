#!/bin/sh
# Instalador STODIA (Linux/macOS). Lo ejecuta el proveedor en el equipo del cliente.
#   sh ./install.sh                         interactivo
#   sh ./install.sh --config respuestas.env desatendido (ver .env.example para las claves)
set -e
cd "$(dirname "$0")"

CONFIG=""
if [ "$1" = "--config" ]; then CONFIG="$2"; [ -f "$CONFIG" ] || { echo "No existe el archivo de respuestas: $CONFIG" >&2; exit 1; }; fi

die() { echo "ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || die "Docker no está instalado o no está en el PATH."

secret() { # $1 bytes (hex)
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

# Valor de CLAVE en el archivo de respuestas (admite 'x', "x" o x; ignora comentarios finales tras comillas)
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
  read -r v || v=""
  [ -n "$v" ] && printf '%s' "$v" || printf '%s' "$2"
}

# ---- validadores (0 = válido). Ningún valor admite comilla simple ni saltos de línea.
noq() { case $1 in *"'"*) return 1;; esac; return 0; }
v_url()   { noq "$1" && printf '%s' "$1" | grep -Eq '^https?://[^ ]+$'; }
v_text()  { noq "$1" && [ -n "$1" ] && [ ${#1} -le 200 ]; }
v_opt()   { noq "$1" && [ ${#1} -le 200 ]; }
v_rnc()   { [ "$(printf '%s' "$1" | tr -cd '0-9' | wc -c | tr -d ' ')" = 9 ] && printf '%s' "$1" | grep -Eq '^[0-9 -]+$'; }
v_phone() { printf '%s' "$1" | grep -Eq '^[0-9+() .-]{7,20}$'; }
v_mail()  { noq "$1" && printf '%s' "$1" | grep -Eq '^[^@ ]+@[^@ ]+\.[^@ ]+$'; }
v_user()  { printf '%s' "$1" | grep -Eq '^[a-z0-9._-]{3,32}$'; }
v_pass()  { noq "$1" && { [ -z "$1" ] || [ ${#1} -ge 8 ]; }; }
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

# get VAR "pregunta" "defecto" validador "mensaje de error"
get() {
  while :; do
    if [ -n "$CONFIG" ]; then v=$(cfgval "$1"); [ -n "$v" ] || v=$3
    else v=$(ask "$2" "$3"); fi
    if "$4" "$v"; then break; fi
    [ -n "$CONFIG" ] && die "Valor inválido o faltante para $1: $5"
    echo "  -> $5" >&2
  done
  eval "$1=\$v"
}

echo "== Instalación de STODIA =="
get API_URL          "URL pública de la API" "http://localhost:3000" v_url "Debe empezar con http:// o https://"
get INSTITUTION_NAME "Nombre de la institución" "" v_text "Obligatorio (sin comilla simple)"
get TAX_ID           "RNC / ID fiscal (9 dígitos)" "" v_rnc "El RNC debe tener 9 dígitos"
get ADDRESS          "Dirección" "" v_text "Obligatoria"
get CITY             "Ciudad / provincia" "" v_text "Obligatoria"
get PHONE            "Teléfono" "" v_phone "Teléfono inválido (7 a 20 dígitos/símbolos)"
get CONTACT_EMAIL    "Correo de contacto" "" v_mail "Correo inválido"
get ADMIN_NAME       "Nombre completo del administrador" "" v_text "Obligatorio"
get ADMIN_USER       "Usuario del administrador" "admin" v_user "3-32 caracteres: minúsculas, números, . _ -"

# Contraseña: oculta, dos veces, mínimo 8; vacía = generar una aleatoria (se muestra al final, una sola vez)
GENERATED_PASSWORD=""
if [ -n "$CONFIG" ]; then
  ADMIN_PASSWORD=$(cfgval ADMIN_PASSWORD)
  v_pass "$ADMIN_PASSWORD" || die "ADMIN_PASSWORD inválida (mínimo 8 caracteres, sin comilla simple)"
else
  while :; do
    printf 'Contraseña del administrador (mín. 8; vacío = generar una) : ' >&2
    stty -echo 2>/dev/null || true; read -r ADMIN_PASSWORD || ADMIN_PASSWORD=""; stty echo 2>/dev/null || true; echo >&2
    v_pass "$ADMIN_PASSWORD" || { echo "  -> Mínimo 8 caracteres y sin comilla simple" >&2; continue; }
    [ -z "$ADMIN_PASSWORD" ] && break
    printf 'Repite la contraseña: ' >&2
    stty -echo 2>/dev/null || true; read -r again || again=""; stty echo 2>/dev/null || true; echo >&2
    [ "$ADMIN_PASSWORD" = "$again" ] && break
    echo "  -> No coinciden" >&2
  done
fi
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(secret 9); GENERATED_PASSWORD=$ADMIN_PASSWORD
fi

get LICENSE_KEY  "Clave de licencia (STODIA1.…, la entrega STODIA; incluye el plan)" "" v_lic "Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA"
get WEB_PORT     "Puerto web" "8080" v_port "Puerto entre 1 y 65535"
get TIMEZONE     "Zona horaria" "America/Santo_Domingo" v_tz "Formato Region/Ciudad, p. ej. America/Santo_Domingo"
get CURRENCY     "Moneda (código ISO)" "DOP" v_cur "Tres letras mayúsculas, p. ej. DOP"
API_PORT=3000
API_URL=${API_URL%/}
TAX_ID=$(printf '%s' "$TAX_ID" | tr -cd '0-9')

if [ -f .env ]; then
  B=".env.bak.$(date +%Y%m%d%H%M%S)"
  cp .env "$B"; chmod 600 "$B"
  echo "Se respaldó el .env existente en $B"
fi

umask 077
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
  echo "# Solo se usa en el primer arranque; puede borrarse después."
  echo "ADMIN_PASSWORD='$ADMIN_PASSWORD'"
  echo "LICENSE_KEY='$LICENSE_KEY'"
  echo "WEB_PORT='$WEB_PORT'"
  echo "API_PORT='$API_PORT'"
  echo "TIMEZONE='$TIMEZONE'"
  echo "CURRENCY='$CURRENCY'"
  echo "JWT_SECRET='$(secret 32)'"
  echo "SEED_DEMO='false'"
} > .env
chmod 600 .env
echo ".env escrito."

docker compose up -d --build

echo
echo "=========== STODIA instalado ==========="
echo "Institución : $INSTITUTION_NAME"
echo "Web         : http://localhost:$WEB_PORT"
echo "API         : $API_URL   (salud: http://localhost:$API_PORT/health)"
echo "Admin       : usuario '$ADMIN_USER'"
if [ -n "$GENERATED_PASSWORD" ]; then
  echo "Contraseña generada (se muestra UNA sola vez, anótala y cámbiala al entrar): $GENERATED_PASSWORD"
else
  echo "Contraseña  : la indicada durante la instalación"
fi
echo "========================================"
