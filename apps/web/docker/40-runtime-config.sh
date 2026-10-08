#!/bin/sh
# Se ejecuta al arrancar el contenedor (nginx entrypoint). Genera:
#  - /config.json desde API_URL, LICENSE_KEY, INSTITUTION_NAME  -> el mismo build sirve a cualquier cliente
#  - la config de nginx (SPA fallback + proxy /api opcional si API_PROXY_TARGET está definido)
set -e

esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

printf '{"apiUrl":"%s","licenseKey":"%s","institutionName":"%s"}\n' \
  "$(esc "${API_URL:-}")" "$(esc "${LICENSE_KEY:-}")" "$(esc "${INSTITUTION_NAME:-}")" \
  > /usr/share/nginx/html/config.json

PROXY=""
if [ -n "${API_PROXY_TARGET:-}" ]; then
  PROXY="location /api/ {
    proxy_pass ${API_PROXY_TARGET}/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }"
fi

# Cabeceras de seguridad. nginx NO hereda los add_header del server dentro de un location que defina los
# suyos, por eso se repiten (SEC) en cada location que añade Cache-Control.
SEC='add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" always;'

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_vary on;
  gzip_min_length 1024;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml application/manifest+json application/xml;

  ${SEC}

  location = /config.json {
    add_header Cache-Control "no-store";
    ${SEC}
  }
  location = /index.html {
    add_header Cache-Control "no-cache";
    ${SEC}
  }
  # Archivos con hash de Vite: caché larga e inmutable
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    ${SEC}
    try_files \$uri =404;
  }
  ${PROXY}
  location / {
    add_header Cache-Control "no-cache";
    ${SEC}
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
