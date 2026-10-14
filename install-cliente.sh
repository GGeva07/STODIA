#!/bin/sh
# Instalador del CLIENTE STODIA (Linux). Se ejecuta en cada PC del colegio.
#   sh ./install-cliente.sh                          interactivo
#   sh ./install-cliente.sh --config respuestas.env  desatendido
# Claves del archivo de respuestas: STODIA_URL, MODO (nueva|extension), CODIGO, INSTITUTION_NAME,
# TAX_ID, ADDRESS, CITY, PHONE, CONTACT_EMAIL, ADMIN_USER, ADMIN_NAME, ADMIN_PASSWORD, SUPERVISOR_PIN,
# LICENSE_KEY, TIMEZONE, CURRENCY (modo nueva); USUARIO, CLAVE (modo extension).
# Mismo flujo que install-cliente.ps1. Nunca imprime contraseñas.

HERE=$(cd "$(dirname "$0")" && pwd)
CONFIG=""
case "${1:-}" in
  --config)
    [ -n "${2:-}" ] || { echo "Uso: sh install-cliente.sh [--config respuestas.env]" >&2; exit 1; }
    CONFIG=$2
    [ -f "$CONFIG" ] || { echo "No existe el archivo de respuestas: $CONFIG" >&2; exit 1; }
    ;;
  -h|--help) echo "Uso: sh install-cliente.sh [--config respuestas.env]"; exit 0 ;;
  "") ;;
  *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
esac

die() { echo "ERROR: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || die "Se requiere curl (instálalo con tu gestor de paquetes)."
NODE=$(command -v node 2>/dev/null || true)

umask 077
TMP=$(mktemp -d) || die "No se pudo crear un directorio temporal."
trap 'rm -rf "$TMP"' EXIT

# Valor de CLAVE en el archivo de respuestas (admite 'x', "x" o x; sin comillas, " # comentario" final se ignora)
cfgval() {
  [ -n "$CONFIG" ] || return 0
  l=$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$CONFIG" | tail -n 1 | sed -e 's/\r$//' -e 's/^[^=]*=//' -e 's/^[[:space:]]*//') || true
  case $l in
    \'*) printf '%s' "$l" | sed -e "s/^'//" -e "s/'.*$//" ;;
    \"*) printf '%s' "$l" | sed -e 's/^"//' -e 's/".*$//' ;;
    *)   printf '%s' "$l" | sed -e 's/[[:space:]]*#.*$//' -e 's/[[:space:]]*$//' ;;
  esac
}

# Pregunta por stdin. Devuelve 1 si la entrada se cierra (no llama a die dentro de $(...)).
ask() { # $1 prompt, $2 defecto
  if [ -n "$2" ]; then printf '%s [%s]: ' "$1" "$2" >&2; else printf '%s: ' "$1" >&2; fi
  IFS= read -r a || return 1
  if [ -n "$a" ]; then printf '%s' "$a"; else printf '%s' "$2"; fi
}

# Lectura sin eco. Deja el valor en SECRET.
get_secret() { # $1 prompt
  printf '%s: ' "$1" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r SECRET; rc=$?
  stty echo 2>/dev/null || true
  echo >&2
  [ $rc -eq 0 ] || die "Entrada cerrada."
}

# ---- validadores (0 = válido). Ningún valor admite comilla simple ni saltos de línea.
noq()     { case $1 in *\'*) return 1;; esac; return 0; }
v_req()   { noq "$1" && [ -n "$1" ] && [ ${#1} -le 200 ]; }
v_opt()   { noq "$1" && [ ${#1} -le 200 ]; }
v_url()   { noq "$1" && printf '%s' "$1" | grep -Eq '^https?://[^ ]+$'; }
v_codigo(){ printf '%s' "$1" | grep -Eq '^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$'; }
v_rnc()   { printf '%s' "$1" | grep -Eq '^[0-9 .-]+$' && { d=$(printf '%s' "$1" | tr -cd '0-9'); [ ${#d} -eq 9 ] || [ ${#d} -eq 11 ]; }; }
v_phone() { printf '%s' "$1" | grep -Eq '^[0-9+() .-]{7,20}$'; }
v_mail()  { noq "$1" && printf '%s' "$1" | grep -Eq '^[^@ ]+@[^@ ]+\.[^@ ]+$'; }
v_user()  { printf '%s' "$1" | grep -Eq '^[a-z0-9._-]{3,32}$'; }
v_pass()  { noq "$1" && [ ${#1} -ge 8 ]; }
v_pin()   { noq "$1" && [ ${#1} -ge 4 ] && [ ${#1} -le 8 ]; }
v_lic()   { [ -z "$1" ] || { noq "$1" && printf '%s' "$1" | grep -Eq '^STODIA1\.[A-Za-z0-9_.-]+$'; }; }
v_tz()    { printf '%s' "$1" | grep -Eq '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'; }
v_cur()   { printf '%s' "$1" | grep -Eq '^[A-Z]{3}$'; }

# get_val CLAVE PROMPT DEFECTO VALIDADOR MENSAJE [s=oculto]
# Deja el valor en RET. Desatendido: toma la clave del archivo (o el defecto) y falla si no es válida.
get_val() {
  if [ -n "$CONFIG" ]; then
    RET=$(cfgval "$1"); [ -n "$RET" ] || RET=$3
    $4 "$RET" || die "Valor no válido en $1: $5"
    return 0
  fi
  while :; do
    if [ "${6:-}" = s ]; then
      get_secret "$2"; RET=$SECRET
    else
      RET=$(ask "$2" "$3") || die "Entrada cerrada."
    fi
    if $4 "$RET"; then return 0; fi
    echo "  No válido: $5" >&2
  done
}

# Respuesta s/n. Desatendido: usa el valor dado.
si_no() { # $1 pregunta
  while :; do
    r=$(ask "$1" "") || die "Entrada cerrada."
    case $r in
      s|S|si|sí|SI|Sí|y|Y) return 0 ;;
      n|N|no|NO) return 1 ;;
      *) echo "  Responde s o n." >&2 ;;
    esac
  done
}

# Peticiones HTTP. El código va a stdout; el cuerpo queda en $TMP/body.
http_get() { # $1 url
  c=$(curl -s -m 8 -o "$TMP/body" -w '%{http_code}' -H 'Accept: application/json' "$1") || c=000
  printf '%s' "$c"
}
http_post() { # $1 url, $2 fichero JSON
  c=$(curl -s -m 20 -o "$TMP/body" -w '%{http_code}' -H 'Content-Type: application/json' -H 'Accept: application/json' --data-binary "@$2" "$1") || c=000
  printf '%s' "$c"
}

# Lee una clave (de primer nivel) del cuerpo en $TMP/body.
jget() {
  if [ -n "$NODE" ]; then
    "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];if(v!=null)process.stdout.write(String(v))}catch(e){}})' "$1" < "$TMP/body" 2>/dev/null
  else
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$TMP/body" | head -n 1
  fi
}

# Escapa un valor para JSON (los valores validados no llevan comilla simple ni saltos de línea).
jstr() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# ---- 1. Dirección del servidor y detección de la API
PROBE_ESTADO=""; PROBE_VERSION=""; PROBE_INST=""; API=""

# probar_servidor BASE: prueba BASE/api/health y luego BASE/health; exige status 'ok'.
probar_servidor() {
  for ruta in /api/health /health; do
    c=$(http_get "$1$ruta")
    if [ "$c" = 200 ] && [ "$(jget status)" = ok ]; then
      if [ "$ruta" = /api/health ]; then API="$1/api"; else API="$1"; fi
      PROBE_ESTADO=$(jget estado)
      PROBE_VERSION=$(jget version)
      PROBE_INST=$(jget institucion)
      return 0
    fi
  done
  return 1
}

echo ""
echo "=== Instalador del cliente STODIA ==="
while :; do
  if [ -n "$CONFIG" ]; then WEB=$(cfgval STODIA_URL); else WEB=$(ask "Dirección del servidor STODIA (ej. https://colegio.ejemplo.com)" "") || die "Entrada cerrada."; fi
  WEB=$(printf '%s' "$WEB" | sed -e 's/[[:space:]]*$//' -e 's#/*$##')
  if ! v_url "$WEB"; then
    [ -z "$CONFIG" ] || die "STODIA_URL no es una dirección http(s) válida."
    echo "  La dirección debe empezar por http:// o https://" >&2
    continue
  fi
  if probar_servidor "$WEB"; then break; fi
  [ -z "$CONFIG" ] || die "No se pudo conectar con $WEB (probé /api/health y /health)."
  echo "  No se pudo conectar con $WEB (probé /api/health y /health). Revisa la dirección." >&2
done

echo "Servidor: $WEB"
echo "  Versión : ${PROBE_VERSION:-desconocida}"
echo "  Estado  : ${PROBE_ESTADO:-desconocido}"
[ -z "$PROBE_INST" ] || echo "  Institución: $PROBE_INST"
echo ""

# ---- 2. Modo: instalación nueva o extensión
if [ -n "$CONFIG" ]; then
  MODO=$(cfgval MODO)
  case $MODO in nueva|extension) ;; *) die "MODO debe ser 'nueva' o 'extension'." ;; esac
else
  if si_no "¿Es una instalación NUEVA (primera configuración del colegio)? (s/n)"; then MODO=nueva; else MODO=extension; fi
fi

if [ "$MODO" = nueva ] && [ "$PROBE_ESTADO" != pendiente ]; then
  echo "Este servidor ya está activado. Se usa el modo extensión (usuario y contraseña de STODIA)."
  MODO=extension
fi
if [ "$MODO" = extension ] && [ "$PROBE_ESTADO" = pendiente ]; then
  die "Este servidor aún no está activado: ejecuta el instalador del cliente en modo instalación nueva."
fi

# flujo_nueva: pide los datos y activa. Devuelve 0 si activó, 2 si el servidor ya estaba activo, 1 si se cancela.
flujo_nueva() {
  while :; do
    echo "--- Datos de activación ---"
    get_val CODIGO "Código de activación (XXXX-XXXX)" "$CODIGO" v_codigo "formato XXXX-XXXX"
    CODIGO=$(printf '%s' "$RET" | tr a-z A-Z | sed -e 's/^\([A-Z0-9]\{4\}\)-\{0,1\}\([A-Z0-9]\{4\}\)$/\1-\2/')
    get_val INSTITUTION_NAME "Nombre de la institución" "$INST_NAME" v_req "obligatorio, sin comillas"; INST_NAME=$RET
    get_val TAX_ID "RNC (9 u 11 dígitos)" "$TAX_ID" v_rnc "debe tener 9 u 11 dígitos"; TAX_ID=$RET
    get_val ADDRESS "Dirección" "$ADDRESS" v_req "obligatoria"; ADDRESS=$RET
    get_val CITY "Ciudad" "$CITY" v_req "obligatoria"; CITY=$RET
    get_val PHONE "Teléfono" "$PHONE" v_phone "7 a 20 caracteres: dígitos, +, (), espacios o -"; PHONE=$RET
    get_val CONTACT_EMAIL "Correo de contacto" "$CONTACT_EMAIL" v_mail "correo no válido"; CONTACT_EMAIL=$RET
    get_val ADMIN_USER "Usuario administrador" "${ADMIN_USER_V:-admin}" v_user "3-32 caracteres: a-z, 0-9, ., _, -"; ADMIN_USER_V=$RET
    get_val ADMIN_NAME "Nombre del administrador" "${ADMIN_NAME_V:-Administrador}" v_req "obligatorio"; ADMIN_NAME_V=$RET
    if [ -n "$CONFIG" ]; then
      get_val ADMIN_PASSWORD "Contraseña del administrador" "" v_pass "mínimo 8 caracteres" s
      ADMIN_PASS=$RET
    else
      while :; do
        get_val ADMIN_PASSWORD "Contraseña del administrador (mín. 8)" "" v_pass "mínimo 8 caracteres" s
        ADMIN_PASS=$RET
        get_secret "Repite la contraseña"
        [ "$SECRET" = "$ADMIN_PASS" ] && break
        echo "  Las contraseñas no coinciden. Inténtalo de nuevo." >&2
      done
    fi
    get_val SUPERVISOR_PIN "PIN de supervisor (4-8 caracteres)" "" v_pin "entre 4 y 8 caracteres" s; PIN=$RET
    get_val LICENSE_KEY "Licencia STODIA1.* (Enter = la del servidor)" "" v_lic "formato STODIA1.…"; LIC=$RET
    get_val TIMEZONE "Zona horaria" "${TZ_V:-America/Santo_Domingo}" v_tz "formato Región/Ciudad"; TZ_V=$RET
    get_val CURRENCY "Moneda (código de 3 letras)" "${CUR_V:-DOP}" v_cur "tres letras mayúsculas"; CUR_V=$RET

    RNC_D=$(printf '%s' "$TAX_ID" | tr -cd '0-9')
    LICJSON=""
    [ -z "$LIC" ] || LICJSON=",\"licencia\":\"$(jstr "$LIC")\""
    printf '{"codigo":"%s","institucion":{"nombre":"%s","rnc":"%s","direccion":"%s","ciudad":"%s","telefono":"%s","email":"%s"},"admin":{"usuario":"%s","nombre":"%s","password":"%s"},"pin":"%s"%s,"zonaHoraria":"%s","moneda":"%s"}' \
      "$(jstr "$CODIGO")" "$(jstr "$INST_NAME")" "$RNC_D" "$(jstr "$ADDRESS")" "$(jstr "$CITY")" \
      "$(jstr "$PHONE")" "$(jstr "$CONTACT_EMAIL")" "$(jstr "$ADMIN_USER_V")" "$(jstr "$ADMIN_NAME_V")" \
      "$(jstr "$ADMIN_PASS")" "$(jstr "$PIN")" "$LICJSON" "$(jstr "$TZ_V")" "$(jstr "$CUR_V")" > "$TMP/activar.json"

    echo "Activando el servidor..."
    c=$(http_post "$API/instalacion/activar" "$TMP/activar.json")
    err=$(jget error)
    case $c in
      201)
        echo "Servidor activado. Administrador: $(jget admin)"
        if grep -Eq '"verificado" *: *true' "$TMP/body"; then
          echo "RNC verificado en DGII: $(jget razonSocial)"
        else
          echo "RNC no verificado (se puede revisar después en la app)."
        fi
        return 0 ;;
      409) echo "El servidor ya está activado."; return 2 ;;
      403) echo "Código de activación inválido o vencido.${err:+ $err}"
           [ -z "$CONFIG" ] || die "Código de activación inválido o vencido."
           CODIGO=""
           si_no "¿Reintentar? (s/n)" || return 1 ;;
      422) echo "Datos no válidos: ${err:-revisa los campos}"
           [ -z "$CONFIG" ] || die "Datos no válidos: ${err:-revisa los campos}"
           si_no "¿Reintentar corrigiendo los datos? (s/n)" || return 1 ;;
      429) die "Demasiados intentos fallidos desde esta IP. Espera antes de reintentar." ;;
      *)   die "Error del servidor (HTTP $c)${err:+: $err}" ;;
    esac
  done
}

# flujo_extension: valida usuario y contraseña con /auth/login. No guarda el token.
flujo_extension() {
  intentos=0
  while [ "$intentos" -lt 3 ]; do
    echo "--- Validar usuario de STODIA ---"
    get_val USUARIO "Usuario de STODIA" "${USUARIO_V:-}" v_req "obligatorio"; USUARIO_V=$RET
    get_val CLAVE "Contraseña" "" v_req "obligatoria" s; CLAVE_V=$RET
    printf '{"usuario":"%s","password":"%s"}' "$(jstr "$USUARIO_V")" "$(jstr "$CLAVE_V")" > "$TMP/login.json"
    c=$(http_post "$API/auth/login" "$TMP/login.json")
    case $c in
      200)
        echo "Credenciales válidas. El token no se guarda: la app pedirá iniciar sesión."
        return 0 ;;
      401)
        intentos=$((intentos + 1))
        [ -z "$CONFIG" ] || die "Usuario o contraseña incorrectos."
        echo "Usuario o contraseña incorrectos ($intentos de 3)." ;;
      429) die "Demasiados intentos fallidos desde esta IP. Espera antes de reintentar." ;;
      *)   die "Error del servidor al validar (HTTP $c)." ;;
    esac
  done
  die "Se agotaron los 3 intentos de inicio de sesión."
}

# ---- 3. Ejecutar el modo elegido
if [ "$MODO" = nueva ]; then
  flujo_nueva
  rc=$?
  if [ $rc -eq 2 ]; then
    MODO=extension
    flujo_extension
  elif [ $rc -ne 0 ]; then
    die "Instalación cancelada."
  fi
else
  flujo_extension
fi

# ---- 4. Guardar la configuración de la app de escritorio (URL de la WEB, sin /api)
if [ "$(uname -s)" = Darwin ]; then
  CFG_DIR="$HOME/Library/Application Support/STODIA"
else
  CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/STODIA"
fi
mkdir -p "$CFG_DIR" || die "No se pudo crear $CFG_DIR"
AHORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{\n  "url": "%s",\n  "configuradoEn": "%s"\n}\n' "$(jstr "$WEB")" "$AHORA" > "$CFG_DIR/stodia.json"
echo "Configuración guardada en: $CFG_DIR/stodia.json"

# ---- 5. Instalar la app de escritorio si el AppImage está junto a este script
APP=""
for f in "$HERE"/STODIA-*.AppImage; do
  if [ -f "$f" ]; then APP=$f; break; fi
done
if [ -z "$APP" ]; then
  echo ""
  echo "No se encontró STODIA-*.AppImage junto a este script."
  echo "Copia el instalador de STODIA a: $HERE"
  echo "y vuelve a ejecutar este script para crear el acceso directo (la configuración ya quedó guardada)."
else
  if [ -z "$CONFIG" ]; then
    si_no "¿Instalar STODIA en ~/Applications y crear acceso directo? (s/n)" || APP=""
  fi
  if [ -n "$APP" ]; then
    DEST_DIR="$HOME/Applications"
    mkdir -p "$DEST_DIR" || die "No se pudo crear $DEST_DIR"
    DEST="$DEST_DIR/STODIA.AppImage"
    cp -f "$APP" "$DEST" && chmod +x "$DEST" || die "No se pudo copiar el AppImage a $DEST"
    APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
    mkdir -p "$APPS_DIR"
    printf '[Desktop Entry]\nType=Application\nName=STODIA\nComment=Sistema de gestión STODIA\nExec="%s"\nTerminal=false\nCategories=Office;\n' "$DEST" > "$APPS_DIR/stodia.desktop"
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
    echo "STODIA instalado en: $DEST"
    echo "Acceso directo creado: $APPS_DIR/stodia.desktop"
  else
    echo "Instalación de la app omitida. Ejecuta de nuevo el instalador para instalarla."
  fi
fi

echo ""
echo "Listo. Abre STODIA: se conectará a $WEB"
