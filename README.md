# STODIA

Sistema escolar vendido como **una instancia por cliente**. Monorepo pnpm (Node >= 20, pnpm 9).

```
apps/web        React + Vite + TS + Tailwind + react-router (la API se configura en runtime)
apps/api        Fastify + TS + Prisma + SQLite
apps/desktop    Electron mínimo (carga la URL web del cliente)
packages/shared Tipos TS compartidos (solo tipos)
```

## Desarrollo

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # PowerShell: Copy-Item
pnpm dev:api        # http://localhost:3000  (db push + seed idempotente + watch)
pnpm dev:web        # http://localhost:5173  (lee public/config.json -> apiUrl)
pnpm typecheck && pnpm build
pnpm desktop        # Electron; STODIA_URL=http://localhost:5173 pnpm desktop
```

Usuarios sembrados (solo con `SEED_DEMO=true`, el modo dev; contraseña = `SEED_PASSWORD`, en dev `stodia123`): `usr_palmanzar` (Super Admin),
`usr_cvidal` (Director), `usr_ralmonte` (Docente), `usr_arosario` (Cajero), `usr_jtejada` (Comedor), `c.mendoza` (Tutor).

## Docker

```bash
cp .env.example .env   # editar valores (o usar install.ps1 / install.sh)
docker compose up -d --build
```

- Web: `http://localhost:8080` · API: `http://localhost:3000/health`
- Datos SQLite en el volumen `stodia-data` (`/data/stodia.db`).
- El contenedor web genera `/config.json` al arrancar desde `API_URL`, `INSTITUTION_NAME` (la licencia ya no viaja al navegador):
  **la misma imagen sirve a cualquier cliente**. Con `API_URL=/api` la web usa el proxy nginx `/api/` -> `api:3000`.

## Instalación en un cliente

Requisitos: Docker con Compose v2 (opcional: Node 20 para validar la firma de la licencia antes de instalar).
El proveedor ejecuta `install.ps1` (Windows) o `sh install.sh` (Linux/macOS) en el equipo del cliente, desde la raíz del repo.

**Preguntas** (con valor por defecto y validación; mismo orden en ambos scripts): URL pública de la API `[http://localhost:3000]`
(o `/api` para servirla tras el proxy de la web), institución, RNC (9 dígitos), dirección, ciudad, teléfono, correo de contacto,
nombre y usuario del admin `[admin]`, **contraseña del admin** (oculta, dos veces, mín. 8; vacía = se genera), **PIN de supervisor**
(oculto, dos veces, 4–8 caracteres; vacío = 6 dígitos aleatorios), clave de licencia `STODIA1.*` (trae el plan; formato y, con Node, firma y vigencia),
puerto web `[8080]`, puerto de la API `[3000]`, **URL pública de la web** (origen CORS; por defecto `http://<host de la API>:<puerto web>`; se cambia si difiere),
zona horaria `[America/Santo_Domingo]`, moneda `[DOP]` y, opcional, **correo saliente** (`¿Configurar correo saliente ahora? (s/n) [n]`: servidor,
puerto `[587]`, usuario, contraseña oculta, remitente).

**Qué hace**: escribe `.env` (permisos 600; en Windows, ACL solo para el usuario actual; `JWT_SECRET` aleatorio, conservado al reinstalar;
`SEED_DEMO=false`), ejecuta `docker compose up -d --build`, espera `/health` y, si responde, **borra `ADMIN_PASSWORD` y `SUPERVISOR_PIN`
del `.env`** (el seed ya los consumió) y recrea solo el contenedor de la API para que tampoco queden en su entorno. Si `/health` no responde no los
borra y lo avisa: bórralos a mano (valores vacíos) y ejecuta `docker compose up -d`. El resumen final muestra la contraseña y el PIN
**solo si se generaron, una única vez**. Con `API_URL=/api` pone `TRUST_PROXY=true` y publica la API solo en `127.0.0.1`.

**Desatendido**: `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Config respuestas.env` o `sh install.sh --config respuestas.env`
(claves = las de `.env.example`; las no indicadas toman su valor por defecto; contraseña/PIN vacíos se generan; un dato obligatorio
faltante o inválido aborta). Con comillas simples se admiten espacios y ` #` en los valores. El correo se configura solo si `SMTP_HOST` trae valor.
**Borra el archivo de respuestas al terminar** (contiene secretos; `respuestas*.env` está en `.gitignore`).

En el primer arranque el API (`src/seed-instalacion.ts`, idempotente, no pisa lo editado luego en la app) crea el Super Admin real (bcrypt),
el perfil de la institución (`SisConfig 'perfil'`), la clave de licencia (`licenciaClave`; plan, módulos, cuotas y vencimiento salen de su payload
firmado) y el PIN de supervisor (hash scrypt). Con `SEED_DEMO=false` no existen usuarios demo. `/config.json` de la web recibe `apiUrl` e `institutionName`.

### Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `API_URL` | URL de la API vista por el navegador (`http://host:3000` o `/api`) |
| `INSTITUTION_NAME`, `TAX_ID`, `ADDRESS`, `CITY`, `PHONE`, `CONTACT_EMAIL` | Perfil inicial de la institución |
| `ADMIN_USER`, `ADMIN_NAME`, `ADMIN_PASSWORD` | Super Admin inicial (la contraseña solo el 1.er arranque; se borra) |
| `SUPERVISOR_PIN` | PIN de supervisor inicial (solo el 1.er arranque; luego se cambia en Configuración) |
| `LICENSE_KEY` | Licencia firmada `STODIA1.*` (obligatoria; el seed la exige al arrancar, no la borres) |
| `WEB_PORT`, `API_PORT`, `API_BIND` | Puertos publicados en el host; `API_BIND=127.0.0.1` con `/api` |
| `CORS_ORIGIN` | Origen(es) de la web permitidos (coma); la app móvil siempre se permite |
| `TRUST_PROXY` | `false` por defecto; `true` (o N saltos) solo si la API va tras el proxy nginx de la web (`API_URL=/api`) |
| `TIMEZONE`, `CURRENCY` | Zona horaria (también `TZ` del contenedor) y moneda |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo saliente (opcional) |
| `JWT_SECRET` | Aleatorio, obligatorio en producción |
| `SEED_DEMO` | `false` en producción (el compose lo fija) |
| `STODIA_HEALTH_TIMEOUT` | Solo instalador: segundos de espera a `/health` (120) |

### Actualizar la versión sin perder datos

Los datos viven en el volumen `stodia-data` (`/data/stodia.db`), que no se toca al reconstruir.

```bash
sh ./backup.sh                 # 1) respaldo (Windows: .\backup.ps1)
git pull                       # 2) nueva versión (o copiar el release sobre la carpeta; conserva .env)
docker compose up -d --build   # 3) reconstruye; el arranque hace prisma db push + seed idempotente
curl http://localhost:3000/health
```

No uses `docker compose down -v` (borra el volumen). Reejecutar el instalador también es seguro: respalda el `.env` anterior (`.env.bak.*`),
conserva `JWT_SECRET` y el seed no pisa lo ya creado. Para revertir una actualización fallida, restaura el respaldo (abajo) con la versión anterior del código.

### Respaldos y restauración

- **Manual / programado**: `sh ./backup.sh` (Linux/macOS; cron) o `.\backup.ps1` (Windows; Programador de tareas). Copia consistente con `sqlite3 .backup`
  a `./backups/stodia-AAAAMMDD-HHMMSS.db` y rota a 14 días (`BACKUP_DAYS` / `-Days`). La API debe estar en marcha. Copia `backups/` periódicamente a otro disco/equipo.
- **Automático diario (opcional)**: `docker compose --profile backup up -d backup` guarda en el volumen (`/data/backups`, 14 días); extrae uno con
  `docker compose cp backup:/data/backups/<archivo> ./backups/`.
- **Restaurar** (la API se detiene un momento):

```bash
docker compose stop api
docker compose run --rm --no-deps -v "$PWD/backups:/b:ro" api sh -c 'cp /b/stodia-AAAAMMDD-HHMMSS.db /data/stodia.db && rm -f /data/stodia.db-journal /data/stodia.db-wal /data/stodia.db-shm'
docker compose up -d api
```

  (PowerShell: `-v "${PWD}/backups:/b:ro"`.) El admin vive en la BD restaurada, así que no hace falta `ADMIN_PASSWORD` en `.env`.

## Convenciones para portar pantallas

- **Pantalla web**: `apps/web/src/screens/<id>/index.tsx` (`export default`), donde `<id>` es el id de `NAV` en
  `apps/web/src/lib/access.ts`. Se registra sola (ruta `/<id>/*`, con guard RBAC según `ACCESS`). Sub-rutas internas con `<Routes>` propio.
  Archivos auxiliares de la pantalla van dentro de su carpeta; componentes reutilizables en `src/components/`.
- **Móvil**: `apps/web/src/mobile/` (`/m/tutor`, `/m/lista`).
- **HTTP**: solo `api` de `src/lib/api.ts` (`api.get/post/put/del`); nunca `fetch` ni URLs fijas.
- **Estilos**: Tailwind con tokens (`accent`, `ok/warn/bad/info/mute`, `font-mono`); íconos Phosphor `<i className="ph ph-xxx" />`.
- **Módulo de API**: crear `apps/api/src/modules/<nombre>/index.ts` con `export default` un `FastifyPluginAsync`
  (prefijo `/<nombre>`, o `export const prefix = '...'`). Se registra automáticamente; no se edita ningún archivo común.
  Rutas protegidas: `{ onRequest: [app.authenticate] }` (+ `app.requireRole('Super Admin')`). BD: `import { prisma } from '../../db'`.
- **Modelos Prisma**: agregar al final de `apps/api/prisma/schema.prisma` (único archivo común inevitable; agregar solo `model`s nuevos).
  Catálogos maestros usan la tabla genérica `Catalogo` (`tipo` + `data` JSON).
- **Tipos**: entidades en `packages/shared/src/index.ts`; importar con `import type { ... } from '@stodia/shared'`.
- Esquema BD: `prisma db push` (sin migraciones todavía).

## UI global y servicios de sistema

- `AppLayout` monta `UiProvider` (`components/system/UiProvider.tsx`): `const { toast, openGuard, setCommands } = useUi()` (o `useToast()`).
- `toast(msg, 'ok'|'bad'|'warn'|'info')`; `openGuard({ title, desc, code?, pin?, label, onOk })` = confirmación destructiva con texto/clave (demo 1234; Super Admin omite la clave).
- `<Modal onClose width>` es el cascarón de modales (overlay, Esc, clic fuera). Paleta Ctrl/Cmd+K: añadir ítems con `setCommands('mi-pantalla', [{ type, label, sub, icon, go }])`.
- `useLicense()` (`screenOn(id)`, `info`) expone plan/módulos; estilos comunes en `components/system/styles.ts`.
- API: `audit(user, 'Insert'|'Update'|'Delete', { tabla, id, prev, next, ip })` desde `apps/api/src/lib/audit.ts` (nunca lanza). Licencia: clave firmada Ed25519 `STODIA1.*` (SisConfig `licenciaClave` > env `LICENSE_KEY` > clave dev si `SEED_DEMO=true`); la API solo embebe la pública (`apps/api/src/lib/license-pubkey.ts`). El cliente solo puede pegar una clave nueva (`PUT /licencia/clave`); `PUT /licencia` responde 403. Sin licencia válida/vencida => 402 salvo `/auth` y `/licencia`. Emisión: `scripts/license/README.md`.

## Pendiente / notas

- Hay que generar y commitear `pnpm-lock.yaml` tras el primer `pnpm install`.
- PWA: solo manifest (sin service worker, sin iconos PNG).
