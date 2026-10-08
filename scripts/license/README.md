# Licencias STODIA (herramienta del PROVEEDOR)

La licencia es una **clave firmada**: `STODIA1.<payload base64url>.<firma Ed25519 base64url>`.
El payload es JSON `{v:1, cliente, rnc?, plan, features[], cuotas{alumnos,usuarios,campus}, emitida, vence, id}` y la firma cubre los bytes exactos del payload.
La API solo embebe la clave **pública** (`apps/api/src/lib/license-pubkey.ts`, sobreescribible con `LICENSE_PUBLIC_KEY` fuera de producción, solo para pruebas). La **privada nunca** está en el repo ni en la imagen Docker (`.gitignore`/`.dockerignore` excluyen `*.pem` y `scripts/license`).
El cliente no puede editar plan, módulos, cuotas ni vencimiento: solo pegar una clave nueva (Licenciamiento > "Pegar clave de licencia" o `PUT /licencia/clave`, solo Super Admin; se verifica firma, vigencia y que coincida RNC/nombre del cliente; se audita).

## Comandos (desde la raíz del repo, requieren `pnpm install`)

```
pnpm license:keygen [--force] [--out <ruta.pem>]
pnpm license:issue --cliente "Colegio X, SRL" --plan Avanzado --vence 2027-08-31 [--rnc 131556782] [--features +comedor,-rbac] [--cuotas alumnos=900,usuarios=12] [--id LIC-...] [--key <ruta.pem>]
pnpm license:inspect <clave>
```

- `keygen`: genera el par Ed25519. Guarda la privada en `%USERPROFILE%\.stodia\license-private.pem` (Windows: ACL solo para tu usuario; Linux/macOS: `chmod 600`), **no la imprime**, escribe la pública en `license-pubkey.ts`. Se niega a sobrescribir una privada existente sin `--force` (regenerar invalida todas las claves emitidas).
- `issue`: imprime la clave. Los módulos salen del plan (Básico/Intermedio/Avanzado); `--features` ajusta (`+id` agrega, `-id` quita) y `--cuotas` sobreescribe los límites por defecto del plan. `--vence` es obligatorio.
- `inspect`: valida firma y muestra el contenido (exit 0 válida, 2 inválida, 3 vencida).
- Nota: en Windows ejecuta estos comandos con un `PATH` sin rutas con espacios problemáticas para `cmd`; alternativa directa: `cd apps/api && node_modules/.bin/tsx ../../scripts/license/cli.ts issue ...`.

## Producción: emitir una clave real

1. Una sola vez, en la máquina del proveedor: `pnpm license:keygen` (respalda `license-private.pem` en un gestor seguro; quien la tenga puede emitir licencias). **Antes de desplegar**, commitea el `license-pubkey.ts` resultante: es lo que verificarán las instancias.
2. Por cliente: `pnpm license:issue --cliente "..." --rnc <RNC> --plan <Plan> --vence <AAAA-MM-DD>` y entrega la clave.
3. Instalación: el instalador pide la clave (valida formato y, si hay Node, firma y vigencia con `scripts/license/verify.mjs`) y la guarda en `LICENSE_KEY`; el seed la verifica y deriva plan/perfil de ella.
4. Renovación: emite una clave nueva con `--vence` posterior; el Super Admin del cliente la pega en Licenciamiento.

## Desarrollo

El par de DESARROLLO se generó con `keygen`; su privada está en `%USERPROFILE%\.stodia\license-private.pem` (fuera del repo). `apps/api/src/lib/license-dev-key.ts` guarda una clave de ejemplo (Colegio Los Pinos, SRL, Avanzado, 1 año) que la API usa solo con `SEED_DEMO=true` y sin otra clave. Si regeneras el par, reemite esa clave y reemplázala. Esa pareja de claves NO debe usarse en producción: genera otra con `keygen` en la máquina del proveedor antes de publicar.

Pruebas: `pnpm --filter @stodia/api test` (firma válida, payload alterado, sin firma, basura, otro par, payload malformado, vencida).
