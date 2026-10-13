# UPSTREAM — procedencia del fork interno

| Campo | Valor |
|---|---|
| Repositorio origen | https://github.com/victors1681/dgii-ecf (mantenedor único: Victor Santos) |
| Paquete npm | `dgii-ecf` 1.9.1 |
| Rama / commit importado | `main` @ `075b0e706e0c02585cc1712dc01a0bfe22dea4fc` (2026-10-07 15:11 -04:00, «Merge pull request #33 ... inquiry_invoice_summary»); es v1.8.4 + 15 commits; el CHANGELOG indica 1.9.1 (2026-10-07) |
| Fecha de importación | 2026-10-11 |
| Licencia | MIT según `package.json` y el registro npm. **El repositorio no contiene archivo LICENSE** (GitHub no detecta licencia). El `LICENSE` de esta carpeta es el texto MIT estándar reconstruido, con nota de procedencia. Pendiente: pedir al autor que publique un LICENSE |
| Clon de trabajo | scratchpad de la sesión (`dgii-ecf-upstream`), solo lectura; no se ejecutó ningún script del upstream |

## Qué se copió y qué no

- Copiado: `src/` completo (incluye pruebas unitarias) con finales de línea normalizados a LF.
- Excluido: `.git`, `.github`, `.vscode`, `.env*`, `package-lock.json`, `.babelrc`, `.eslint*`, `.prettierrc.js`, `jest-setup.js`, `test.xml`, `.nvmrc`, y los certificados/llaves de prueba (`src/__tests__/sample/SAMPLE_CERT.p12`, `alice.key`, `alice.crt`).
- Compilación: `tsc` (CommonJS + `.d.ts`) con `tsconfig.build.json`; se excluyen del build `__tests__`, `test_cert` y `certification/` (este último importa `csv-parser`, una devDependency; es un asistente del set de pruebas de la DGII que no se exporta desde `index.ts`).

## Modificaciones locales (a partir de la importación)

| # | Fecha | Archivo | Cambio | Motivo |
|---|---|---|---|---|
| 1 | 2026-10-11 | `package.json` (nuevo, reemplaza el del upstream) | nombre `@stodia/dgii-ecf`, `private`, dependencias a versiones **exactas**; **axios 1.15.0 -> 1.20.0, @xmldom/xmldom 0.8.12 -> 0.8.15, form-data 4.0.5 -> 4.0.6** (parches de seguridad, ver `docs/dgii-ecf-auditoria.md`); se elimina la dependencia `fs@0.0.1-security` (paquete placeholder; `fs` es nativo); TypeScript 5.9.3; sin babel/eslint/nodemon | Auditoría |
| 2 | 2026-10-11 | `src/**` | Finales de línea CRLF -> LF (el clon de Windows con autocrlf rompía pruebas con XML embebido) | Pruebas |
| 3 | 2026-10-11 | `tsconfig*.json`, `jest.config.js`, `.gitignore`, `.gitattributes`, `scripts/check-aislamiento.mjs`, `README.md`, `LICENSE`, `UPSTREAM.md` | Archivos propios de STODIA | Build/aislamiento |

Código de `src/` (lógica): **sin cambios** respecto al upstream (solo finales de línea).

## Parches pendientes (no aplicados; ver auditoría)

P-1 cliente axios por instancia y token por petición (no global); P-2 validar `buyerHost`; P-3 sustituir `console.*` por logger inyectado; P-4 quitar `dotenv.config()` de `index.ts`. Cada uno se aplica **solo** cuando el paquete se conecte a `apps/api` y se registra aquí con fecha, archivo y motivo.

## Política de actualización y parches

1. Revisar el upstream (tags/CHANGELOG) mensualmente y siempre que la DGII cambie un servicio (los cambios de endpoints llegan como versiones menores, p. ej. 1.9.0/1.9.1).
2. Clonar en un directorio nuevo fuera del repo, **sin ejecutar scripts**, comparar `git diff <commit importado>..<nuevo>` solo sobre `src/` y `package.json`; revisar dependencias nuevas con `pnpm audit --prod` y buscar `eval|child_process|fetch|axios` hacia hosts distintos de `*.dgii.gov.do`.
3. Aplicar el diff a mano (no copiar `package.json` entero), mantener versiones **exactas**, actualizar la tabla de modificaciones y el commit de esta ficha, correr `build`, `test` (offline) y la comprobación de aislamiento.
4. Las correcciones propias se hacen aquí y, si son generales, se ofrecen al upstream por PR. Un parche de seguridad en una dependencia se aplica de inmediato aunque el upstream no lo haya adoptado.
5. Opción: fork público en GitHub (`gh repo fork victors1681/dgii-ecf`) para seguir el upstream con `git remote`; decisión del titular de la cuenta.
