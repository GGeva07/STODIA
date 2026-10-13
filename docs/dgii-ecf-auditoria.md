# Auditoría de seguridad básica: `dgii-ecf` (fork `packages/dgii-ecf`)

Fecha: **2026-10-11**. Alcance: lectura de fuentes del commit `075b0e7` (v1.9.1) en un clon aislado, sin ejecutar scripts del paquete ni `npm install` dentro del clon. Auditoría de dependencias con `pnpm audit --prod` (instalación con `--ignore-scripts`). Es una revisión básica, **no** una auditoría criptográfica completa. Procedencia y modificaciones: `packages/dgii-ecf/UPSTREAM.md`.

## 1. Resumen

- **Licencia:** MIT declarada en `package.json`/npm; **no hay archivo LICENSE** en el repositorio (ver UPSTREAM.md). Aceptada como permisiva; se recomienda pedir al autor que lo añada.
- **Código:** sin `eval`, `new Function`, `child_process` ni lectura de rutas inusuales. Único uso de `fs`: leer el `.p12` indicado por el llamador (`P12Reader.getKeyFromFile`) y un helper de CSV no exportado. Sin telemetría. El certificado y la clave privada no se envían a ningún destino; solo se firma la semilla/XML y se transmite el XML firmado (que contiene el certificado público X.509, normal en XMLDSig).
- **Hosts de red:** `https://ecf.dgii.gov.do`, `https://fc.dgii.gov.do`, `https://statusecf.dgii.gov.do` (ambientes `TesteCF`/`CerteCF`/`eCF` por ruta) **y `buyerHost` libre** (ver H-2).
- **Scripts de instalación:** el `package.json` upstream no tiene `preinstall/install/postinstall/prepare` (solo `postversion: git push`, irrelevante para consumidores). La instalación se hizo con `--ignore-scripts` y **no** se amplió `onlyBuiltDependencies`.
- **Criptografía/XML:** `node-forge` (PKCS#12, PEM), `xml-crypto` (XMLDSig, c14n 1.0, RSA-SHA256, digest SHA-256 propio «Digest.ts» por requisito de la DGII), `@xmldom/xmldom`, `xpath`, `xml-js`, `jsonwebtoken` (token propio RS256 en el lado receptor).

## 2. Hallazgos (críticos/altos primero)

| ID | Sev. | Hallazgo | Evidencia | Acción |
|---|---|---|---|---|
| H-1 | **Alta** | **Cliente HTTP y token globales**: `restClient` es un `axios` singleton y `setAuthToken()` escribe `Authorization: Bearer` en `defaults.common`. Dos instancias/ambientes/certificados en el mismo proceso comparten token (mezcla de identidades); además el token de la DGII viaja a cualquier host. | `networking/restClient.ts` L17-L52 | **Parche P-1** antes de conectar: un cliente por emisor y el header por petición. Mientras tanto, un solo emisor por proceso |
| H-2 | **Alta** | **`buyerHost` sin validar** (semilla, validación y envío al «host del comprador»): SSRF y **fuga del token DGII** al host indicado (el header global también se envía a `baseURL: buyerHost`). Como emisor puro no se necesita. | `RestApi.ts` L96, L127, L173; `ECF.ts` L31-L88 | **Parche P-2**: no exponer `buyerHost` salvo lista blanca HTTPS; nunca tomarlo de datos del usuario |
| H-3 | **Alta** | **Dependencias con CVE** (pnpm audit, 2026-10-11): `axios 1.15.0` (decenas de avisos: contaminación de prototipo, fuga de credenciales de proxy, ReDoS, SSRF por NO_PROXY; corregidos hasta 1.20.0), `@xmldom/xmldom 0.8.12` (inyección XML en serialización, ReDoS/DoS cuadrático; corregido en 0.8.15), `form-data 4.0.5` (inyección CRLF; corregido en 4.0.6). | `pnpm audit --prod` | **Aplicado en el fork**: axios 1.20.0, xmldom 0.8.15, form-data 4.0.6 (build y pruebas offline verdes). `xml-crypto` 6.1.2 resuelve a xmldom 0.8.15 |
| H-4 | Media | **`node-forge 1.4.0`** (CVE-2026-85393, alta): la verificación de firma RSA PKCS#1 v1.5 acepta elementos extra. Sin versión parcheada al 2026-10-11. El paquete usa forge solo para leer PKCS#12/PEM, **no** para verificar firmas de terceros. | `P12Reader.ts` | Exposición baja; vigilar y actualizar cuando haya parche. No usar `forge.pki` para verificar firmas |
| H-5 | Media | **Logs con datos de respuesta**: `console.error`/`console.log` en envío de documentos y resumen (mensaje, `data` de la DGII, recurso) y en validación de certificado. No imprime la clave, pero puede imprimir datos fiscales. | `RestApi.ts` L183, L272, L284; `validateXMLCertificate.ts` L102-L104; `getXmlFromBodyResponse.ts` L21 | **Parche P-3**: logger inyectado con redacción; no registrar XML, token ni `data` completa |
| H-6 | Media | **`dotenv.config()` al importar el paquete**: carga el `.env` del directorio actual en `process.env` del backend (efecto lateral). Las variables `CERTIFICATE_NAME`/`CERTIFICATE_TEST_PASSWORD` solo se usan en pruebas. | `src/index.ts` L1, L14 | **Parche P-4**: quitar; la configuración la inyecta `apps/api` |
| H-7 | Media | **Clave privada en PEM en memoria sin cifrar** (`P12ReaderData.key`) y contraseña como string; los errores incluyen la ruta del `.p12`. Es inherente al diseño; la custodia es nuestra. | `P12Reader.ts` | Descifrar el `.p12` solo en memoria del servicio de firma; no registrar errores con rutas; fase 4 del checklist |
| H-8 | Baja | **Dependencias innecesarias**: `fs@0.0.1-security` (placeholder del registro) eliminado; `csv-parser` (devDependency usada por `certification/`) excluido del build; `busboy`/`jsonwebtoken` solo sirven al lado receptor (se mantienen fijadas). | `package.json` upstream | Si no se usa recepción, podrían retirarse |
| H-9 | Baja | **Mantenedor único**, sin LICENSE en el repo, TS 4.9 y toolchain babel; las pruebas de firma/autenticación dependen de un certificado privado del autor (no disponible). Riesgo de continuidad y de cambios de la DGII sin respaldo. | Repo | Fork interno + política de actualización (UPSTREAM.md) |
| H-10 | Info | TLS: `https.Agent` con TLS 1.2-1.3 y cifrados ECDHE/DHE AES-GCM; **no** desactiva `rejectUnauthorized`. Digest SHA-256 y RSA-SHA256. Sin `process.env` en producción salvo dotenv. | `restClient.ts` | Verificar en TesteCF que los cifrados restringidos negocian con la DGII |
| H-11 | Info | `DOMParser` de xmldom sin `errorHandler` en `validateXMLCertificate` (el parseo estricto sí existe en `Signature.parseXmlStrict`). Los XML entrantes de terceros deben tratarse como no confiables y con límite de tamaño. | `validateXMLCertificate.ts` | Límite de tamaño en los endpoints de recepción (fase 8) |

Avisos de `pnpm audit` **ajenos a este paquete** (ya presentes en `apps/api`/`apps/web`, fuera de alcance): `fastify` 4.x (varios de severidad alta; parche en 5.12.x), `fast-jwt` (críticos, vía `@fastify/jwt`), `react-router`, `find-my-way`. Conviene una tarea aparte.

## 3. Pruebas

- Corren y pasan (sin red ni certificado): `Transform`, `customTransformer`, `generateQRCode`, `getCurrentFormattedDateTime`, `utils` (incluye conversión E32→RFCE), `DgiiApiError`, `senderReceiver`, `ECF.customerDirectory`, `ECF.summaryInquiry` (mocks `axios-mock-adapter`). `pnpm test` (subconjunto offline): 83 pruebas OK, 9 omitidas por falta de certificado.
- Requieren certificado privado y no se pueden ejecutar aquí: `Signature.test`, `ECF.test`, `CustomAuthentication`, `P12Reader` (su `.p12` de muestra se excluyó), `certification`. **Nada se ejecutó contra la DGII** (no hay certificado ni credenciales en este entorno).
- Nota de proceso: se ejecutó una vez la suite completa (`test:all`) para identificar qué requiere certificado; sin certificado las suites se omiten o fallan localmente, sin tráfico a la DGII. `pnpm test` ahora ejecuta solo el subconjunto offline.

## 4. Qué hay que fijar/parchear antes de conectar a `apps/api`

1. P-1 y P-2 (obligatorios): cliente por instancia, token por petición, sin `buyerHost` libre.
2. P-3 y P-4: logger inyectado sin datos; sin `dotenv` implícito.
3. Revisar `node-forge` cuando salga el parche; repetir `pnpm audit --prod` en cada actualización.
4. Pruebas con XSD y XML dorados propios (el paquete no valida contra el XSD oficial).
5. Pedir al autor un archivo LICENSE.
