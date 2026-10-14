#!/bin/sh
# Instalador STODIA (Linux/macOS). Lo ejecuta el proveedor en el SERVIDOR (del colegio o nuestro).
#   sh ./install.sh                         interactivo
#   sh ./install.sh --config respuestas.env desatendido (ver .env.example para las claves)
# Dos modos:
#   - PENDIENTE (recomendado; MODO_SERVIDOR=pendiente): solo puertos/URL. El servidor arranca sin datos del colegio y muestra un
#     CÓDIGO DE ACTIVACIÓN; los datos se ponen desde la primera PC con install-cliente.sh / install-cliente.ps1 (modo "nueva").
#   - COMPLETO (MODO_SERVIDOR=completo): pregunta aquí todos los datos del colegio, como siempre.
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
v_rnc()   { printf '%s' "$1" | grep -Eq '^[0-9 .-]+$' && { n=$(printf '%s' "$1" | tr -cd '0-9' | wc -c | tr -d ' '); [ "$n" = 9 ] || [ "$n" = 11 ]; }; }
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

# ---- Verificación del RNC en la DGII (API de solo lectura; la clave va aquí a propósito: no es crítica y se rota cambiando
# esta constante o con STODIA_RNC_API_KEY). Nunca se imprime ni se escribe en .env/logs.
RNC_API_URL=${STODIA_RNC_API_URL:-https://rncvalidator.synsetsolutions.com}
RNC_API_URL=${RNC_API_URL%/}
RNC_API_KEY=${STODIA_RNC_API_KEY:-pXKKt5Xakkx4pNLCbZxNnKJiq64c9XXA}
RNC_TIMEOUT=${STODIA_RNC_TIMEOUT:-10}
RNC_VERIFICACION=${RNC_VERIFICACION:-}
RNC_STOPWORDS=" srl sa sas eirl ltd de del la las los el y colegio centro educativo "

rnc_clean() { # una línea, sin controles ni comilla simple (el .env va entre comillas simples)
  printf '%s' "$1" | tr -d '\000-\010\013-\037' | tr '\n\r\t' '   ' | sed -e "s/'/’/g" -e 's/^ *//' -e 's/ *$//'
}
rnc_norm() { # minúsculas, sin tildes ni puntuación
  printf '%s' "$1" | sed -e 's/Á/a/g;s/á/a/g;s/É/e/g;s/é/e/g;s/Í/i/g;s/í/i/g;s/Ó/o/g;s/ó/o/g;s/Ú/u/g;s/ú/u/g;s/Ü/u/g;s/ü/u/g;s/Ñ/n/g;s/ñ/n/g' \
    | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' ' '
}
rnc_tokens() {
  out=""
  for w in $(rnc_norm "$1"); do
    [ ${#w} -ge 2 ] || continue
    case "$RNC_STOPWORDS" in *" $w "*) continue ;; esac
    case " $out " in *" $w "*) ;; *) out="$out $w" ;; esac
  done
  printf '%s' "$out"
}
rnc_score() { # $1,$2 listas de tokens -> % de coincidencia sobre la lista más corta
  na=0; nb=0; c=0
  for w in $1; do na=$((na+1)); case " $2 " in *" $w "*) c=$((c+1)) ;; esac; done
  for w in $2; do nb=$((nb+1)); done
  m=$na; if [ "$nb" -lt "$m" ]; then m=$nb; fi
  if [ "$m" -le 0 ]; then echo 0; else echo $((c*100/m)); fi
}
rnc_unjson() { # desescapa lo mínimo de un literal JSON (fallback sin node)
  printf '%s' "$1" | sed -e 's/\\"/"/g' -e 's#\\/#/#g' -e 's/\\\\/\\/g' \
    -e 's/\\u00e1/á/g;s/\\u00e9/é/g;s/\\u00ed/í/g;s/\\u00f3/ó/g;s/\\u00fa/ú/g;s/\\u00f1/ñ/g;s/\\u00fc/ü/g' \
    -e 's/\\u00c1/Á/g;s/\\u00c9/É/g;s/\\u00cd/Í/g;s/\\u00d3/Ó/g;s/\\u00da/Ú/g;s/\\u00d1/Ñ/g;s/\\u00dc/Ü/g'
}
rnc_jget() { # $1 archivo, $2 clave -> valor string del JSON (vacío si null/ausente)
  jv=$(tr -d '\r\n' < "$1" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\(\([^"\\]\|\\.\)*\)".*/\1/p')
  rnc_unjson "$jv"
}

rnc_parse() { # $1 archivo con el cuerpo de un 200 -> R_STATUS ok|inactive|unavailable
  est1=""; est2=""
  if command -v node >/dev/null 2>&1; then
    pout=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=j&&j.data;if(!d||typeof d!=="object"||Array.isArray(d))process.exit(3);const f=k=>String(d[k]==null?"":d[k]).replace(/[\r\n\t]+/g," ").trim();process.stdout.write([f("razon_social"),f("nombre_comercial"),f("estatus"),f("regimen")].join("\n"))}catch(e){process.exit(3)}' < "$1" 2>/dev/null) || { R_STATUS=unavailable; R_MOTIVO="respuesta inválida del servicio"; return 0; }
    R_RAZON=$(printf '%s\n' "$pout" | sed -n 1p); R_COMERCIAL=$(printf '%s\n' "$pout" | sed -n 2p)
    est1=$(printf '%s\n' "$pout" | sed -n 3p); est2=$(printf '%s\n' "$pout" | sed -n 4p)
  else
    if ! tr -d ' \r\n\t' < "$1" | grep -Eq '^\{.*"data":\{.*\}.*\}$'; then R_STATUS=unavailable; R_MOTIVO="respuesta inválida del servicio"; return 0; fi
    R_RAZON=$(rnc_jget "$1" razon_social); R_COMERCIAL=$(rnc_jget "$1" nombre_comercial)
    est1=$(rnc_jget "$1" estatus); est2=$(rnc_jget "$1" regimen)
  fi
  R_RAZON=$(rnc_clean "$R_RAZON"); R_COMERCIAL=$(rnc_clean "$R_COMERCIAL")
  est1=$(rnc_clean "$est1" | tr '[:lower:]' '[:upper:]'); est2=$(rnc_clean "$est2" | tr '[:lower:]' '[:upper:]')
  if [ "$est1" = ACTIVO ] || [ "$est2" = ACTIVO ]; then R_STATUS=ok; R_ESTADO=ACTIVO
  else
    R_STATUS=inactive; R_ESTADO=${est1:-$est2}; [ -n "$R_ESTADO" ] || R_ESTADO="NO INFORMADO"
  fi
}

# Consulta la DGII vía la API (timeout 10 s, 1 reintento solo ante error de red/5xx).
# Resultado: R_STATUS = ok | inactive | notfound | unavailable (+ R_MOTIVO, R_RAZON, R_COMERCIAL, R_ESTADO)
rnc_query() {
  R_STATUS=""; R_MOTIVO=""; R_RAZON=""; R_COMERCIAL=""; R_ESTADO=""
  if ! command -v curl >/dev/null 2>&1; then R_STATUS=unavailable; R_MOTIVO="curl no disponible"; return 0; fi
  try=0
  while [ "$try" -lt 2 ]; do
    try=$((try+1)); retry=0
    body=$(mktemp); crc=0
    # La clave viaja por stdin (curl -K -): no queda en la lista de procesos.
    code=$(printf 'header = "x-api-key: %s"\n' "$RNC_API_KEY" | curl -sS -K - -m "$RNC_TIMEOUT" -o "$body" -w '%{http_code}' "$RNC_API_URL/api/v1/rnc/$1" 2>/dev/null) || crc=$?
    if [ "$crc" != 0 ]; then
      R_STATUS=unavailable; retry=1
      if [ "$crc" = 28 ]; then R_MOTIVO="tiempo de espera agotado"; else R_MOTIVO="sin conexión con el servicio"; fi
    else
      case $code in
        200) rnc_parse "$body" ;;
        404) R_STATUS=notfound ;;
        401|403) R_STATUS=unavailable; R_MOTIVO="clave de la API rechazada (HTTP $code)" ;;
        429) R_STATUS=unavailable; R_MOTIVO="límite de consultas excedido (HTTP 429)" ;;
        5??) R_STATUS=unavailable; R_MOTIVO="servicio no disponible (HTTP $code)"; retry=1 ;;
        *) R_STATUS=unavailable; R_MOTIVO="respuesta inesperada (HTTP $code)" ;;
      esac
    fi
    rm -f "$body"
    if [ "$retry" = 1 ] && [ "$try" -lt 2 ]; then continue; fi
    return 0
  done
}

rnc_force() { RNC_VERIFICADO=false; RNC_VERIFICADO_AT=""; }
# Flujo completo (usa y deja TAX_ID, INSTITUTION_NAME y las variables RNC_*). Salida 2 = verificación fallida en desatendido.
rnc_flow() {
  RNC_VERIFICADO=false; RNC_RAZON_SOCIAL=""; RNC_NOMBRE_COMERCIAL=""; RNC_ESTADO=""; RNC_VERIFICADO_AT=""
  mode=$RNC_VERIFICACION
  if [ -n "$CONFIG" ] && [ -z "$mode" ]; then mode=$(cfgval RNC_VERIFICACION); fi
  mode=$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]')
  nf=0
  while :; do
    TAX_ID=$(printf '%s' "$TAX_ID" | tr -cd '0-9')
    echo "Verificando el RNC $TAX_ID en la DGII..."
    rnc_query "$TAX_ID"
    case $R_STATUS in
      ok)
        if [ -n "$R_COMERCIAL" ]; then echo "RNC verificado en la DGII: $R_RAZON ($R_COMERCIAL) · ACTIVO"
        else echo "RNC verificado en la DGII: $R_RAZON · ACTIVO"; fi
        ut=$(rnc_tokens "$INSTITUTION_NAME")
        if [ -n "$ut" ]; then
          s1=$(rnc_score "$ut" "$(rnc_tokens "$R_RAZON")"); s2=$(rnc_score "$ut" "$(rnc_tokens "$R_COMERCIAL")")
          if [ "$s1" -lt 50 ] && [ "$s2" -lt 50 ]; then
            echo "AVISO: el nombre de la institución ('$INSTITUTION_NAME') no se parece a la razón social ni al nombre comercial registrados para este RNC. Revisa que el RNC sea el correcto." >&2
            if [ -z "$CONFIG" ]; then
              r=$(ask "¿Usar la razón social oficial como nombre de la institución? [s/N]" "N") || die "Entrada cerrada."
              case $r in [sSyY]*) if [ -n "$R_RAZON" ]; then INSTITUTION_NAME=$R_RAZON; fi ;; esac
            fi
          fi
        fi
        if [ -z "$CONFIG" ]; then
          r=$(ask "¿Es esta la institución? [S/n]" "S") || die "Entrada cerrada."
          case $r in [nN]*) get TAX_ID "RNC / ID fiscal (9 dígitos empresa u 11 persona física)" "" v_rnc "El RNC debe tener 9 dígitos (empresa) u 11 (persona física/cédula)"; continue ;; esac
        fi
        RNC_VERIFICADO=true; RNC_RAZON_SOCIAL=$R_RAZON; RNC_NOMBRE_COMERCIAL=$R_COMERCIAL; RNC_ESTADO=ACTIVO
        RNC_VERIFICADO_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        return 0 ;;
      inactive)
        echo "El RNC existe en la DGII pero su estado NO es activo: $R_ESTADO ($R_RAZON)." >&2
        RNC_RAZON_SOCIAL=$R_RAZON; RNC_NOMBRE_COMERCIAL=$R_COMERCIAL; RNC_ESTADO=$R_ESTADO
        if [ "$mode" = omitir ]; then echo "Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado." >&2; rnc_force; return 0; fi
        if [ -n "$CONFIG" ]; then echo "ERROR: instalación desatendida abortada: el RNC no está activo en la DGII (RNC_VERIFICACION=omitir para continuar sin verificar)." >&2; exit 2; fi
        r=$(ask "Escribe otro RNC, o FORZAR para continuar bajo tu responsabilidad" "") || die "Entrada cerrada."
        if [ "$r" = FORZAR ]; then echo "Se continúa SIN verificar. RNC no verificado." >&2; rnc_force; return 0; fi
        RNC_RAZON_SOCIAL=""; RNC_NOMBRE_COMERCIAL=""; RNC_ESTADO=""
        if v_rnc "$r"; then TAX_ID=$r; else echo "  -> RNC inválido (9 u 11 dígitos)" >&2; fi ;;
      notfound)
        echo "RNC no encontrado en el padrón de la DGII." >&2
        nf=$((nf+1))
        if [ "$mode" = omitir ]; then echo "Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado." >&2; rnc_force; return 0; fi
        if [ -n "$CONFIG" ]; then echo "ERROR: instalación desatendida abortada: RNC no encontrado en el padrón de la DGII (RNC_VERIFICACION=omitir para continuar sin verificar)." >&2; exit 2; fi
        if [ "$nf" -ge 3 ]; then
          r=$(ask "Tres intentos sin éxito. Escribe FORZAR para continuar bajo tu responsabilidad, o Enter para abortar" "") || die "Entrada cerrada."
          if [ "$r" = FORZAR ]; then echo "Se continúa SIN verificar. RNC no verificado." >&2; rnc_force; return 0; fi
          echo "ERROR: instalación abortada: RNC no encontrado." >&2; exit 2
        fi
        r=$(ask "Escribe otro RNC (9 u 11 dígitos), o FORZAR para continuar bajo tu responsabilidad" "") || die "Entrada cerrada."
        if [ "$r" = FORZAR ]; then echo "Se continúa SIN verificar. RNC no verificado." >&2; rnc_force; return 0; fi
        if v_rnc "$r"; then TAX_ID=$r; else echo "  -> RNC inválido (9 u 11 dígitos)" >&2; fi ;;
      *)
        echo "No se pudo verificar el RNC ($R_MOTIVO)." >&2
        if [ "$mode" = omitir ]; then echo "Se continúa SIN verificar (RNC_VERIFICACION=omitir). RNC no verificado." >&2; rnc_force; return 0; fi
        if [ -n "$CONFIG" ]; then echo "ERROR: instalación desatendida abortada: no se pudo verificar el RNC (RNC_VERIFICACION=omitir para continuar sin verificar)." >&2; exit 2; fi
        r=$(ask "Escribe SI para continuar SIN verificar el RNC, o Enter para reintentar" "") || die "Entrada cerrada."
        case $r in [sS][iI]|[sS]í) echo "Se continúa SIN verificar. RNC no verificado." >&2; rnc_force; return 0 ;; esac ;;
    esac
  done
}

echo "== Instalación de STODIA (servidor) =="
v_modo() { [ "$1" = pendiente ] || [ "$1" = completo ]; }
get MODO_SERVIDOR    "Modo: 'pendiente' (los datos del colegio se ponen desde la primera PC) o 'completo' (se ponen aquí)" "pendiente" v_modo "Escribe pendiente o completo"
get API_URL          "URL pública de la API (o /api para servirla tras el proxy de la web)" "/api" v_url "Debe empezar con http:// o https://, o ser /api"
GEN_PWD=""; GEN_PIN=""
INSTITUTION_NAME=""; TAX_ID=""; ADDRESS=""; CITY=""; PHONE=""; CONTACT_EMAIL=""; ADMIN_NAME=""; ADMIN_USER="admin"; ADMIN_PASSWORD=""; SUPERVISOR_PIN=""
RNC_VERIFICADO=""; RNC_RAZON_SOCIAL=""; RNC_NOMBRE_COMERCIAL=""; RNC_ESTADO=""; RNC_VERIFICADO_AT=""
if [ "$MODO_SERVIDOR" = completo ]; then
get INSTITUTION_NAME "Nombre de la institución" "" v_text "Obligatorio (sin comilla simple)"
get TAX_ID           "RNC / ID fiscal (9 dígitos empresa u 11 persona física)" "" v_rnc "El RNC debe tener 9 dígitos (empresa) u 11 (persona física/cédula)"
# Valida el RNC contra la DGII ANTES de pedir el resto y de crear nada (puede ajustar TAX_ID/INSTITUTION_NAME).
rnc_flow
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
else
v_lic_opt() { [ -z "$1" ] || v_lic "$1"; }
get LICENSE_KEY  "Clave de licencia (opcional: vacío = se pega en la activación desde la PC)" "" v_lic_opt "Clave inválida: debe ser STODIA1.<datos>.<firma>, vigente y emitida por STODIA"
fi
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
  echo "RNC_VERIFICADO='$RNC_VERIFICADO'"
  echo "RNC_RAZON_SOCIAL='$RNC_RAZON_SOCIAL'"
  echo "RNC_NOMBRE_COMERCIAL='$RNC_NOMBRE_COMERCIAL'"
  echo "RNC_ESTADO='$RNC_ESTADO'"
  echo "RNC_VERIFICADO_AT='$RNC_VERIFICADO_AT'"
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
if [ "$MODO_SERVIDOR" = pendiente ]; then
CODIGO=$(docker compose exec -T api sh -c 'head -n 1 /data/codigo-activacion.txt 2>/dev/null' 2>/dev/null | tr -d '\r' || true)
echo "Estado      : PENDIENTE DE ACTIVACIÓN"
echo "Código      : ${CODIGO:-(aún no disponible: docker compose logs api | grep Código)}   (vence en 72 h; un solo uso)"
echo "Web         : http://localhost:$WEB_PORT   (pública: ${CORS_ORIGIN%%,*})"
echo "Siguiente   : en la primera PC ejecuta install-cliente (modo nueva) con la dirección pública y este código."
echo "Actualizar  : programa 'sh ./actualizar.sh' cada 5 min (cron); solo aplica versiones que el colegio apruebe en la app."
echo "========================================"
exit 0
fi
echo "Institución : $INSTITUTION_NAME"
if [ "$RNC_VERIFICADO" = true ]; then echo "RNC         : $TAX_ID (verificado en la DGII)"; else echo "RNC         : $TAX_ID (NO verificado: confírmalo luego en Configuración)"; fi
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
