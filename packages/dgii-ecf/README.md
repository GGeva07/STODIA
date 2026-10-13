# @stodia/dgii-ecf (fork interno, privado)

Copia vendorizada de [victors1681/dgii-ecf](https://github.com/victors1681/dgii-ecf) v1.9.1 (MIT). Ver `UPSTREAM.md` para procedencia, modificaciones y politica de actualizacion, y `docs/dgii-ecf-auditoria.md` para la auditoria de seguridad.

## REGLA DE AISLAMIENTO (obligatoria)

- Este paquete contiene logica de **certificado digital, clave privada y firma**. Solo puede importarlo `apps/api` (backend), y **todavia no esta conectado** a ningun app.
- **`apps/web`, `apps/desktop`, `packages/shared` y `landing-site` NUNCA deben importarlo** (ni como dependencia ni por ruta relativa): el bundle de la web filtraria codigo de firma y arrastraria `node-forge`/`axios`.
- Comprobacion automatica: `pnpm --filter @stodia/dgii-ecf check:aislamiento` (falla si hay referencias a `dgii-ecf` en esas carpetas). El monorepo no tiene eslint; esta es la restriccion equivalente.
- El `.p12` y su contrasena jamas se guardan en el repositorio ni en logs (ver auditoria: el paquete hace `console.error` con datos de respuesta).

## Uso en desarrollo

```
pnpm --filter @stodia/dgii-ecf build          # tsc -> dist/
pnpm --filter @stodia/dgii-ecf typecheck
pnpm --filter @stodia/dgii-ecf test           # = test:offline (sin red ni certificado)
pnpm --filter @stodia/dgii-ecf check:aislamiento
```

`test:all` ejecuta la suite completa del upstream: algunas pruebas requieren el certificado `.p12` de la DGII (no incluido) y NO deben correrse contra TesteCF/CerteCF sin autorizacion.
