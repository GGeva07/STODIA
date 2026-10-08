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

El proveedor ejecuta `install.ps1` (Windows) o `sh install.sh` (Linux/macOS) en el equipo del cliente. Pide, con valor
por defecto y validación: URL pública de la API `[http://localhost:3000]`, nombre de la institución, RNC (9 dígitos),
dirección, ciudad/provincia, teléfono, correo de contacto, nombre completo del administrador, usuario admin `[admin]`,
contraseña del admin (oculta, dos veces, mínimo 8; vacía = se genera una aleatoria y se muestra **una sola vez** al final),
clave de licencia (`STODIA1.*`, trae el plan; se valida formato y, con Node instalado, firma y vigencia), puerto web `[8080]`, zona horaria
`[America/Santo_Domingo]` y moneda `[DOP]`. Escribe `.env` (permisos 600, con `JWT_SECRET` aleatorio y `SEED_DEMO=false`),
ejecuta `docker compose up -d --build` e imprime un resumen (URL web, URL API, usuario; la contraseña solo si fue generada).

Instalación desatendida: `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Config respuestas.env` o
`sh install.sh --config respuestas.env` (claves = las de `.env.example`; las no indicadas toman su valor por defecto,
una contraseña vacía se genera; si falta un dato obligatorio o es inválido, aborta).

En el primer arranque el API (`src/seed-instalacion.ts`, idempotente, no pisa lo editado luego en la app) crea el
Super Admin real (bcrypt), vuelca institución/RNC/dirección/teléfono/correo/moneda/zona horaria en el perfil
(`SisConfig 'perfil'`) y la clave de licencia (SisConfig `licenciaClave`; plan, módulos, cuotas y vencimiento salen de su payload firmado). Con `SEED_DEMO=false`
no existen usuarios demo ni la contraseña `stodia123`; el seed demo solo corre con `SEED_DEMO=true` (dev lo deja en true).
`ADMIN_PASSWORD` en `.env` solo se usa en el primer arranque: puede borrarse después. `/config.json` de la web recibe
`apiUrl`, `licenseKey` e `institutionName`.

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
