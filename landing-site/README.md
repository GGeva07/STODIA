# STODIA Landing

Landing independiente de React/Vite. No importa código ni requiere dependencias de la app o del workspace STODIA.

## Desarrollo local

Desde esta carpeta, instala dependencias con `npm install`; luego `npm run dev`. Para compilar y previsualizar: `npm run build` y `npm run preview`.

Variables opcionales (archivo `.env.local`):

- `VITE_SITE_URL`: dominio público de esta landing, default `https://stodia.com.do` (canonical, Open Graph, blog y destinos legales).
- `VITE_APP_URL`: URL completa del login de la aplicación principal. Default: `${VITE_SITE_URL}/login`.

## Vercel

Importa el repositorio. Puedes configurar **Root Directory** como `landing-site` y Vercel usará la configuración de esta carpeta (`npm install`, `npm run build`, salida `dist`). Si dejas como raíz el repositorio, el [vercel.json](../vercel.json) instala y compila solo esta landing mediante `npm --prefix landing-site`; no instala ni compila el workspace pnpm ni `apps/web`. En cualquiera de las dos opciones, configura `VITE_SITE_URL` si el dominio público difiere del default y `VITE_APP_URL` si la app principal tiene otro host/login.

## Formulario de demo

El formulario «Solicitar demo» envía el mensaje por SMTP mediante una función serverless de Vercel (`api/solicitar-demo.ts`, `POST /api/solicitar-demo`, runtime Node.js, con `nodemailer`). Si la función no está configurada o no responde, el formulario ofrece el `mailto:` como alternativa.

> **Importante:** para que Vercel despliegue la carpeta `api/`, el proyecto debe tener **Root Directory = `landing-site`** (Settings › General). Con la raíz del repositorio como directorio raíz, la función no se publica.

### Variables de entorno

| Variable | Obligatoria | Ejemplo | Para qué sirve |
|---|---|---|---|
| `SMTP_HOST` | Sí | `smtp.proveedor.com` | Servidor SMTP |
| `SMTP_PORT` | Sí | `587` | Puerto SMTP (587 STARTTLS, 465 TLS directo) |
| `SMTP_SECURE` | No | `false` | `true` = TLS directo. Si falta: `true` solo con puerto 465 |
| `SMTP_USER` | Sí | `apikey` o usuario | Usuario SMTP |
| `SMTP_PASS` | Sí | (secreto) | Contraseña/API key SMTP. Marcar como **Sensitive** |
| `DEMO_MAIL_FROM` | Sí | `STODIA Web <no-reply@tudominio.com>` | Remitente (debe ser un dominio/cuenta autorizado por tu proveedor) |
| `DEMO_MAIL_TO` | Sí | `ventas@tudominio.com,soporte@tudominio.com` | Destinatarios del equipo (coma) |
| `DEMO_MAIL_BCC` | No | `archivo@tudominio.com` | Copia oculta |
| `DEMO_SEND_CONFIRMATION` | No | `true` | Envía acuse de recibo al solicitante |
| `ALLOWED_ORIGINS` | No | `https://stodia.vercel.app,https://www.tudominio.com` | Orígenes que pueden llamar a la API. Default: `https://stodia.vercel.app` y `VITE_SITE_URL` (+ `localhost` solo fuera de producción) |
| `SMTP_DRY_RUN` | No (solo dev) | `true` | No envía; responde ok y registra metadatos sin datos sensibles. Se ignora en producción |

`VITE_SITE_URL` (ya usada por la landing) también define el dominio del enlace `/privacidad` del acuse y un origen permitido. Si faltan variables obligatorias, la API responde `503 {"error":"not_configured"}` (sin decir cuáles) y el log del servidor lista las que faltan.

### Cargarlas en Vercel

1. Proyecto › **Settings › Environment Variables**; agrega cada variable en **Production** y **Preview** (y Development si usas `vercel dev`).
2. Marca `SMTP_PASS` como **Sensitive**.
3. **Redeploy** (las variables solo aplican a despliegues nuevos).

### Prueba en producción

Envía el formulario en https://stodia.vercel.app/#demo con un correo propio: debe llegar el mensaje «Solicitud de demo STODIA · …» a `DEMO_MAIL_TO` con *Reply-To* igual al correo del solicitante. Si falla, revisa Vercel › Logs (`[solicitar-demo]`): ahí aparecen las variables que faltan o el código de error SMTP (nunca contraseñas ni datos del formulario).

### Desarrollo local

- `npm run dev` monta la misma función en `/api/solicitar-demo` (plugin `vite-api.mjs`). Pon en `.env.local` las variables (ver `.env.example`) y `SMTP_DRY_RUN=true` para no enviar correos reales.
- Alternativa fiel a producción: `vercel dev` (CLI de Vercel; usa las variables del proyecto con `vercel env pull`).

### Protecciones y límites

Solo POST con JSON de máx. 8 KB; validación de campos; casilla de consentimiento obligatoria; envío rechazado si se completa en menos de 3 s; campo trampa (honeypot); verificación de `Origin`/`Referer`; saneo de cabeceras (se rechazan saltos de línea) y HTML escapado; sin adjuntos; timeouts SMTP de 10 s.

**Límite de tasa:** 5 envíos por IP y 30 globales por hora (429 con `Retry-After`). Es *best-effort y por instancia*: el contador vive en memoria de cada instancia serverless y se pierde en cada arranque en frío, así que no es un límite global duro. Para uno estricto se necesita un almacén compartido (p. ej. Upstash Redis o Vercel KV); no se incluye para no añadir dependencias.

### Entregabilidad: SPF / DKIM / DMARC

Configura en el DNS del dominio de `DEMO_MAIL_FROM`: **SPF** que incluya a tu proveedor SMTP, **DKIM** (clave que te da el proveedor) y **DMARC** (empieza con `p=none` y sube a `quarantine`/`reject` cuando los informes estén limpios). Sin esto, los correos pueden caer en spam o ser rechazados.
