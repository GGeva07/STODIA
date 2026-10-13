# Checklist secuencial: certificarse como emisor electrónico (e-CF) con STODIA

> Documento de trabajo. Creado: **2026-10-11**. Base: `docs/integracion-ecf.md` (evaluación de brechas del 2026-10-11) y `docs/fiscal-ncf.md`. Paquete técnico: `packages/dgii-ecf` (fork interno de `dgii-ecf`, ver `UPSTREAM.md` y `docs/dgii-ecf-auditoria.md`).
> **A VALIDAR (2026-10-11)** = no confirmado en fuente oficial de la DGII por el equipo; se verifica con la DGII, el contador o el proveedor antes de construir. En esta fecha **no** se pudo leer el PDF «Proceso de Certificación para ser Emisor Electrónico» ni los XSD; todo lo que dependa de ellos queda A VALIDAR.

## Regla de trabajo

1. **No se inicia la fase N+1 hasta cerrar los ítems obligatorios de la fase N** (columna `Oblig.: Sí`). Los ítems opcionales pueden quedar abiertos con una nota.
2. **Cada ítem cerrado deja evidencia**: commit (hash), prueba automatizada, captura o documento firmado/recibido. Se anota en la línea del ítem al marcarlo `[x]` y se actualiza la fecha.
3. Responsables: **Cliente** (el contribuyente/colegio), **Nosotros** (STODIA), **DGII** (trámite o validación externa).
4. Estados: `Pendiente`, `En curso`, `Bloqueado (motivo)`, `Hecho (fecha)`, `A VALIDAR (fecha)`.
5. Una instancia = un cliente = un certificado: este checklist se repite por cliente a partir de la fase 0 y de la fase 11; las fases 1 a 9 son del producto y se hacen una vez.
6. Nunca se prueba contra la base real `stodia` ni se emiten e-CF de producción durante las fases 3 a 9.

## Avance por fase

| Fase | Nombre | Hechos / total | Obligatorios hechos / total | Estado |
|---|---|---|---|---|
| 0 | Prerrequisitos y trámites del cliente | 0/12 | 0/10 | Pendiente |
| 1 | Fork y base técnica | 7/11 | 7/9 | En curso |
| 2 | Datos fiscales del sistema | 6/16 | 4/13 | En curso |
| 3 | Generación del XML por tipo | 0/8 | 0/6 | Pendiente |
| 4 | Certificado y firma | 0/8 | 0/8 | Pendiente |
| 5 | Autenticación y envío (TesteCF) | 0/9 | 0/8 | Pendiente |
| 6 | Representación impresa y QR oficial | 0/4 | 0/4 | Pendiente |
| 7 | Notas, anulación de rangos (ANECF) y contingencia | 0/5 | 0/4 | Pendiente |
| 8 | Aprobación comercial, acuse y recepción | 0/5 | 0/1 | Pendiente |
| 9 | Set de pruebas de certificación (CerteCF) | 0/8 | 0/6 | Pendiente |
| 10 | Producción | 0/8 | 0/8 | Pendiente |
| 11 | Operación por cliente | 0/6 | 0/4 | Pendiente |
| **Total** | | **13/100** | **11/81** | |

*Tabla actualizada el 2026-10-11. Se recalcula contando las casillas marcadas y los ítems con «Oblig.: Sí» de cada fase.*

---

## Fase 0 — Prerrequisitos y trámites del cliente

Prerrequisito: ninguno. Responsable principal: Cliente (con apoyo nuestro). Todo A VALIDAR (2026-10-11) hasta recibir confirmación de la DGII/contador.

- [ ] **0.1** Confirmar con el contador/DGII si el cliente está obligado a facturar electrónicamente y desde qué fecha (calendario de obligatoriedad por tipo de contribuyente) — Resp.: Cliente · Dep.: — · Evidencia: correo o nota del contador con la conclusión · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **0.2** Decidir emisión directa con la DGII vs. proveedor de servicios de facturación electrónica (PSFE), con 2-3 cotizaciones; decisión reversible por el puerto `PuertoEcf` — Resp.: Nosotros + Cliente · Dep.: 0.1 · Evidencia: acta de decisión en `docs/` · Estado: Pendiente · Oblig.: Sí
- [ ] **0.3** RNC activo y al día, acceso del representante a la Oficina Virtual de la DGII — Resp.: Cliente · Dep.: — · Evidencia: captura del acceso (sin datos sensibles) · Estado: Pendiente · Oblig.: Sí
- [ ] **0.4** Solicitud/postulación como emisor electrónico en la Oficina Virtual (orden exacto de pasos A VALIDAR) — Resp.: Cliente · Dep.: 0.1, 0.3 · Evidencia: constancia de solicitud o número de trámite · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **0.5** Obtener el certificado digital `.p12`/`.pfx` de una entidad certificadora acreditada y admitida por la DGII (tipo de certificado admitido A VALIDAR; errores conocidos «Tipo de certificado no admitido») — Resp.: Cliente · Dep.: 0.3 · Evidencia: huella SHA-256, vigencia y RNC del titular (sin entregar la clave por chat/correo) · Estado: Pendiente · Oblig.: Sí
- [ ] **0.6** Designar representante/responsable del certificado y de las claves; acuerdo escrito de custodia (quién guarda `.p12` y contraseña) — Resp.: Cliente + Nosotros · Dep.: 0.5 · Evidencia: acuerdo firmado (A VALIDAR con asesoría legal) · Estado: Pendiente · Oblig.: Sí
- [ ] **0.7** Acceso a los ambientes de pruebas (TesteCF) y certificación (CerteCF) y al contacto técnico de la DGII (`facturacionelectronica@dgii.gov.do`) — Resp.: Cliente + DGII · Dep.: 0.4 · Evidencia: credenciales/URL recibidas, correo de la DGII · Estado: Pendiente · Oblig.: Sí
- [ ] **0.8** Descargar y archivar los documentos vigentes: Descripción Técnica, Informe Técnico, XSD, Proceso de Certificación, set de pruebas, formato de ARECF/ACECF/ANECF — Resp.: Nosotros · Dep.: 0.7 · Evidencia: carpeta fuera del repo o `docs/` con fecha de descarga y versión · Estado: Pendiente · Oblig.: Sí
- [ ] **0.9** Solicitar secuencias e-NCF por tipo (E31, E32, E33, E34 primero) con su fecha de vencimiento; en pruebas se usan las de TesteCF/CerteCF — Resp.: Cliente · Dep.: 0.4 · Evidencia: autorización con rango y vencimiento · Estado: A VALIDAR (2026-10-11) · Oblig.: No (necesario recién para producción, fase 10)
- [ ] **0.10** Decisión fiscal del ITBIS por concepto (colegiaturas, servicios complementarios, papelería) y régimen de cada comprador — Resp.: Cliente (contador) · Dep.: 0.1 · Evidencia: tabla firmada concepto→indicador de facturación · Estado: Pendiente · Oblig.: Sí
- [ ] **0.11** Datos completos del emisor: razón social, nombre comercial, dirección, provincia/municipio (códigos DGII), correo, teléfono, actividad económica — Resp.: Cliente · Dep.: — · Evidencia: formulario del perfil institucional completo · Estado: Pendiente · Oblig.: Sí
- [ ] **0.12** URL pública HTTPS (dominio o IP fija con certificado TLS) si se requiere recepción/aprobación comercial desde la DGII (A VALIDAR si es obligatoria para un emisor de solo ventas) — Resp.: Cliente · Dep.: 0.2 · Evidencia: URL que responde desde internet · Estado: A VALIDAR (2026-10-11) · Oblig.: No (obligatoria solo si 0.12 se confirma como requisito; ver fase 8)

## Fase 1 — Fork y base técnica

Prerrequisito: ninguno técnico (puede avanzar en paralelo a la fase 0). Responsable: Nosotros.

- [x] **1.1** Clonar el upstream `victors1681/dgii-ecf` en un directorio aislado y registrar commit, fecha y versión — Resp.: Nosotros · Dep.: — · Evidencia: `packages/dgii-ecf/UPSTREAM.md` (commit `075b0e7`, v1.9.1) · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.2** Verificar la licencia — Resp.: Nosotros · Dep.: 1.1 · Evidencia: MIT en `package.json`/npm; sin archivo LICENSE upstream (nota en `packages/dgii-ecf/LICENSE` y `UPSTREAM.md`) · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.3** Auditoría de seguridad básica (código, dependencias, hosts, scripts) — Resp.: Nosotros · Dep.: 1.1 · Evidencia: `docs/dgii-ecf-auditoria.md` · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.4** Vendorizar como paquete privado `@stodia/dgii-ecf` con dependencias exactas y sin certificados de prueba — Resp.: Nosotros · Dep.: 1.2, 1.3 · Evidencia: `packages/dgii-ecf/` (`package.json`, `UPSTREAM.md`) · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.5** Compila con la toolchain del monorepo y el resto sigue tipando — Resp.: Nosotros · Dep.: 1.4 · Evidencia: `pnpm --filter @stodia/dgii-ecf build` y `pnpm -r typecheck` verdes · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.6** Pruebas unitarias offline (sin red ni certificado) en verde — Resp.: Nosotros · Dep.: 1.4 · Evidencia: `pnpm --filter @stodia/dgii-ecf test` (83 OK, 9 omitidas) · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **1.7** Aislamiento: la web y shared no pueden importar el paquete — Resp.: Nosotros · Dep.: 1.4 · Evidencia: `packages/dgii-ecf/README.md` y `pnpm --filter @stodia/dgii-ecf check:aislamiento` · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [ ] **1.8** Parches de seguridad previos a la conexión: P-1 cliente/token por instancia, P-2 `buyerHost`, P-3 logger sin datos, P-4 sin `dotenv` implícito — Resp.: Nosotros · Dep.: 1.4 · Evidencia: commit(s) + fila en la tabla de modificaciones de `UPSTREAM.md` + pruebas · Estado: Pendiente · Oblig.: Sí
- [ ] **1.9** Pedir al autor un archivo LICENSE en el upstream o confirmar la licencia por escrito — Resp.: Nosotros · Dep.: 1.2 · Evidencia: issue/respuesta del autor · Estado: Pendiente · Oblig.: No
- [ ] **1.10** (Opcional) Fork público en GitHub (`gh repo fork victors1681/dgii-ecf`) para seguir el upstream — Resp.: Nosotros (cuenta del titular) · Dep.: 1.4 · Evidencia: URL del fork · Estado: Pendiente · Oblig.: No
- [ ] **1.11** Conectar `@stodia/dgii-ecf` a `apps/api` detrás del puerto `PuertoEcf` (emitir/consultar/anular/recibir) y bandera de configuración apagada por defecto — Resp.: Nosotros · Dep.: 1.8 · Evidencia: commit + typecheck + prueba con adaptador simulado · Estado: Pendiente · Oblig.: Sí

## Fase 2 — Datos fiscales del sistema

Prerrequisito: fase 1 cerrada (obligatorios) y 0.10, 0.11. Responsable: Nosotros.

- [x] **2.1** Catálogo de tipos de comprobante E31, E32, E33, E34, E41, E43, E44, E45, E46, E47 con modalidad por tipo lógico — Resp.: Nosotros · Dep.: — · Evidencia: `apps/api/src/lib/fiscal.ts` L26-54 y L109-118; `schema.prisma` `TipoComprobante` · Estado: Hecho (2026-10-11, notas «A VALIDAR» por tipo) · Oblig.: Sí
- [x] **2.2** Numeración atómica del e-NCF (E + tipo(2) + secuencial(10) = 13 caracteres) dentro de la transacción del documento — Resp.: Nosotros · Dep.: 2.1 · Evidencia: `fiscal.ts` `asignarNcf` L141-174, L378-406 · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **2.3** Secuencias con rango, vencimiento (`vence`), umbral y estados; elige la que vence antes y devuelve 409 sin rango — Resp.: Nosotros · Dep.: 2.2 · Evidencia: `SecuenciaFiscal` en `schema.prisma` y `fiscal.ts` L62-67 · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **2.4** Notas de crédito/débito (E34/E33) con motivos y `codigoDgii` 01-05, referencia al NCF modificado, idempotencia — Resp.: Nosotros · Dep.: 2.1 · Evidencia: `apps/api/src/lib/notas.ts`, `MotivoNota`, `NotaFiscal` (mapeo de códigos A VALIDAR) · Estado: Hecho (2026-10-11) · Oblig.: Sí
- [x] **2.5** Consulta de RNC (tutor, historial y proveedor externo desactivado por defecto) — Resp.: Nosotros · Dep.: — · Evidencia: `apps/api/src/lib/rnc-lookup.ts` · Estado: Hecho (2026-10-11); padrón oficial DGII pendiente (ver 2.14) · Oblig.: No
- [x] **2.6** Perfil institucional básico (nombre, RNC, dirección, teléfono, ciudad) — Resp.: Nosotros · Dep.: — · Evidencia: `apps/api/src/lib/sisconfig.ts` L6 · Estado: Hecho parcial (2026-10-11); faltan campos DGII, ver 2.13 · Oblig.: No
- [ ] **2.7** ITBIS por línea: indicador de facturación, base gravada, exento, ITBIS y tasa en `FinReciboItem` y totales que cuadren al centavo — Resp.: Nosotros · Dep.: 0.10 · Evidencia: migración aditiva + prueba de totales · Estado: Pendiente (hallazgo A.3 #2) · Oblig.: Sí
- [ ] **2.8** Datos de ítem DGII: cantidad, unidad de medida, precio unitario, indicador bien/servicio, código de ítem — Resp.: Nosotros · Dep.: 2.7 · Evidencia: columnas + catálogo de unidades (tabla DGII A VALIDAR) · Estado: Pendiente (A.3 #5) · Oblig.: Sí
- [ ] **2.9** `FinVenta` (venta rápida) con datos fiscales: tipo de comprobante, secuencia, modalidad, estado DGII, RNC y razón social del comprador — Resp.: Nosotros · Dep.: 2.1 · Evidencia: migración con DEFAULT + prueba de venta E32/E31 · Estado: Pendiente (A.3 #1) · Oblig.: Sí
- [ ] **2.10** Montos en `Decimal` (o céntimos enteros) en recibo, línea, nota y venta; verificación de sumas al armar el XML — Resp.: Nosotros · Dep.: 2.7 · Evidencia: migración + prueba de redondeo · Estado: Pendiente (A.3 #3) · Oblig.: Sí
- [ ] **2.11** Mapeo de formas de pago (`MetodoPago` → códigos DGII, A VALIDAR tabla) y tipo de ingresos/tipo de pago — Resp.: Nosotros · Dep.: 0.8 · Evidencia: catálogo + prueba · Estado: Pendiente (A.3 #15) · Oblig.: Sí
- [ ] **2.12** Descuentos/recargos por línea y becas mapeados a la estructura de descuentos del XML — Resp.: Nosotros · Dep.: 2.7 · Evidencia: regla documentada + XML dorado · Estado: Pendiente (A.3 #4) · Oblig.: Sí
- [ ] **2.13** Perfil del emisor ampliado (nombre comercial, provincia/municipio con códigos DGII, correo, teléfonos, actividad) — Resp.: Nosotros · Dep.: 0.11 · Evidencia: pantalla de configuración + validación · Estado: Pendiente (A.3 #16) · Oblig.: Sí
- [ ] **2.14** Datos del comprador (correo, dirección, país) y validación de RNC contra el padrón oficial; retirar la clave API embebida de `install.ps1` y rotarla — Resp.: Nosotros · Dep.: — · Evidencia: commit + clave rotada (A.3 #13, #17) · Estado: Pendiente · Oblig.: No
- [ ] **2.15** Revisar motivos de notas y fecha/código de modificación exigidos por la DGII (plazo oficial de E34 A VALIDAR) — Resp.: Nosotros + Cliente · Dep.: 2.4, 0.8 · Evidencia: tabla de códigos validada con la Descripción Técnica · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **2.16** Política del e-NCF rechazado/no enviado (reutilizar, corregir o inhabilitar por ANECF) y distinción reservado/enviado/aceptado — Resp.: Nosotros + DGII · Dep.: 0.8 · Evidencia: regla escrita + estados en el modelo · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí

## Fase 3 — Generación del XML por tipo

Prerrequisito: fase 2 cerrada y 0.8 (XSD vigentes). Responsable: Nosotros. Orden: E32 y E31 primero; luego E34/E33; después E41, E43, E44, E45, E46, E47 solo si el cliente los necesita.

- [ ] **3.1** Incorporar los XSD oficiales vigentes y un validador de XSD sin dependencias nativas pesadas (p. ej. `xmllint-wasm`) — Resp.: Nosotros · Dep.: 0.8 · Evidencia: módulo + prueba que rechaza un XML inválido · Estado: Pendiente · Oblig.: Sí
- [ ] **3.2** Mapeador `recibo|venta → ECF` para **E32** (consumo) con cálculo en céntimos y verificación de totales — Resp.: Nosotros · Dep.: 3.1, 2.7-2.12 · Evidencia: XML dorado validado contra XSD · Estado: Pendiente · Oblig.: Sí
- [ ] **3.3** Mapeador para **E31** (crédito fiscal): comprador con RNC y razón social obligatorios — Resp.: Nosotros · Dep.: 3.2 · Evidencia: XML dorado validado contra XSD · Estado: Pendiente · Oblig.: Sí
- [ ] **3.4** Mapeador para **E34** (nota de crédito) con `InformacionReferencia`, monto ≤ comprobante modificado — Resp.: Nosotros · Dep.: 3.2, 2.15 · Evidencia: XML dorado validado · Estado: Pendiente · Oblig.: Sí
- [ ] **3.5** Mapeador para **E33** (nota de débito) — Resp.: Nosotros · Dep.: 3.4 · Evidencia: XML dorado validado · Estado: Pendiente · Oblig.: Sí
- [ ] **3.6** Mapeadores E41, E43, E44, E45, E46, E47 (solo los que el cliente use; E44 regímenes especiales y E45 gubernamental posibles) — Resp.: Nosotros · Dep.: 3.2 · Evidencia: XML dorado por tipo · Estado: Pendiente · Oblig.: No
- [ ] **3.7** Casos límite: descuentos, redondeos, ítems exentos, múltiples tasas, Paginación, caracteres especiales y longitudes máximas — Resp.: Nosotros · Dep.: 3.2 · Evidencia: pruebas automatizadas · Estado: Pendiente · Oblig.: Sí
- [ ] **3.8** Reunir 20-50 recibos reales de ejemplo por tipo (anonimizados) para los XML dorados — Resp.: Cliente + Nosotros · Dep.: — · Evidencia: carpeta de muestras (fuera del repo si tiene datos personales) · Estado: Pendiente · Oblig.: No

## Fase 4 — Certificado y firma

Prerrequisito: fase 3 (3.2 al menos) y 0.5, 0.6, 1.8. Responsable: Nosotros.

- [ ] **4.1** Diseño de custodia: `.p12` cifrado (AES-256-GCM) con clave maestra por instalación fuera de la base (variable/secret/DPAPI), contraseña por separado, auditoría de cada uso — Resp.: Nosotros · Dep.: 0.6 · Evidencia: ADR + código + prueba de cifrado/descifrado · Estado: Pendiente · Oblig.: Sí
- [ ] **4.2** Carga del certificado en Configuración › Fiscal (sube `.p12`, pide la contraseña, nunca la devuelve a la web; UI en español, sin alertas del navegador) — Resp.: Nosotros · Dep.: 4.1 · Evidencia: captura + prueba de API; hoy solo se guardan metadatos (`ecfInfo`) — `apps/api/src/modules/config/index.ts` L145-153 · Estado: Pendiente · Oblig.: Sí
- [ ] **4.3** Validación al cargar: contraseña correcta, cadena de confianza, RNC del certificado = RNC del emisor, algoritmo RSA/SHA-256, vigencia (A VALIDAR requisitos exactos) — Resp.: Nosotros · Dep.: 4.2 · Evidencia: pruebas con certificado de prueba propio — Estado: Pendiente · Oblig.: Sí
- [ ] **4.4** Bloqueo de la emisión electrónica con aviso si el certificado está vencido o por vencer (alertas a 60/30/15 días); `ecf=true` deja de ser un interruptor manual — Resp.: Nosotros · Dep.: 4.3 · Evidencia: prueba + captura (A.3 #7) · Estado: Pendiente · Oblig.: Sí
- [ ] **4.5** Servicio de firma XMLDSig (enveloped, c14n, RSA-SHA256, `FechaHoraFirma`) usando `@stodia/dgii-ecf` solo en el backend — Resp.: Nosotros · Dep.: 1.11, 4.3 · Evidencia: XML firmado que valida con `validateXMLCertificate` y contra el XSD firmado · Estado: Pendiente · Oblig.: Sí
- [ ] **4.6** Código de seguridad (6 primeros caracteres del hash del `SignatureValue`; cálculo A VALIDAR) guardado por documento — Resp.: Nosotros · Dep.: 4.5 · Evidencia: prueba contra ejemplo oficial · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **4.7** Registro de uso de la clave: quién, qué documento, cuándo (sin guardar la clave ni la contraseña en logs) — Resp.: Nosotros · Dep.: 4.5 · Evidencia: tabla de auditoría + revisión de logs · Estado: Pendiente · Oblig.: Sí
- [ ] **4.8** Respaldo y restauración del `.p12` cifrado y de la clave maestra (`backup.ps1`/`backup.sh`) sin exponerlos en claro — Resp.: Nosotros · Dep.: 4.1 · Evidencia: prueba de restauración · Estado: Pendiente · Oblig.: Sí

## Fase 5 — Autenticación y envío (TesteCF)

Prerrequisito: fase 4 cerrada y 0.7 (acceso a TesteCF). Responsable: Nosotros. Solo ambiente de pruebas.

- [ ] **5.1** Autenticación: semilla → firma → token con caché y renovación (token por emisor, nunca global) — Resp.: Nosotros · Dep.: 1.8, 4.5 · Evidencia: log de autenticación exitosa en TesteCF (sin el token) · Estado: Pendiente · Oblig.: Sí
- [ ] **5.2** Tabla `EcfEnvio` (documento, e-NCF único, XML, XML firmado, hash, TrackId, estado, intentos, próximo intento, último error, respuesta) — Resp.: Nosotros · Dep.: 2.16 · Evidencia: migración aditiva + prueba de unicidad · Estado: Pendiente · Oblig.: Sí
- [ ] **5.3** Envío del XML firmado y recepción del TrackId; el cobro no espera a la DGII — Resp.: Nosotros · Dep.: 5.1, 5.2 · Evidencia: e-CF E32 y E31 aceptados en TesteCF · Estado: Pendiente · Oblig.: Sí
- [ ] **5.4** Consulta de resultado por TrackId y mapeo de estados (Aceptado, Aceptado condicional, Rechazado, En proceso; códigos A VALIDAR) a `estadoDgii` — hoy nada escribe Aceptado/Rechazado — Resp.: Nosotros · Dep.: 5.3 · Evidencia: pruebas con respuestas simuladas y reales de TesteCF · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **5.5** Cola con reintentos (backoff exponencial), bloqueo de un solo escritor e idempotencia (mismo e-NCF/hash no duplica; «ya recibido» se reconcilia por consulta de estado) — Resp.: Nosotros · Dep.: 5.3 · Evidencia: pruebas de reenvío/duplicado · Estado: Pendiente · Oblig.: Sí
- [ ] **5.6** RFCE para E32 menores al umbral (RD$ 250,000, A VALIDAR) hacia `fc.dgii.gov.do`, conservando el XML completo — Resp.: Nosotros · Dep.: 5.3 · Evidencia: resumen aceptado en TesteCF; `convertECF32ToRFCE` ya existe en el paquete — Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **5.7** UI de estado por comprobante: columna y filtro «Estado DGII», detalle con respuesta/errores, botón Reenviar con rol y PIN, panel de pendientes/rechazados (en español, sin alertas del navegador) — Resp.: Nosotros · Dep.: 5.4 · Evidencia: capturas — Estado: Pendiente · Oblig.: Sí
- [ ] **5.8** Envío de notas E34/E33 y de ventas rápidas por la misma cola — Resp.: Nosotros · Dep.: 5.5, 3.4, 2.9 · Evidencia: aceptados en TesteCF · Estado: Pendiente · Oblig.: Sí
- [ ] **5.9** Conciliación diaria: compara e-NCF emitidos vs. estado en la DGII y reporta diferencias — Resp.: Nosotros · Dep.: 5.4 · Evidencia: reporte de prueba · Estado: Pendiente · Oblig.: No

## Fase 6 — Representación impresa y QR oficial

Prerrequisito: 5.3 (documentos aceptados con código de seguridad). Responsable: Nosotros.

- [ ] **6.1** Campos mínimos de la representación impresa (e-NCF, tipo, vencimiento de la secuencia, fecha de emisión y de firma, código de seguridad) — Resp.: Nosotros · Dep.: 0.8, 4.6 · Evidencia: lista validada con la Descripción Técnica · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **6.2** QR oficial con la URL de consulta de la DGII (RNC emisor, e-NCF, fecha, monto y código de seguridad), distinto del QR propio de boletines — Resp.: Nosotros · Dep.: 6.1 · Evidencia: el QR abre la consulta de TesteCF/CerteCF · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **6.3** Tirilla, recibo carta y PDF muestran el estado real (se retira «e-NCF pendiente de envío» al aceptarse) — Resp.: Nosotros · Dep.: 6.2 · Evidencia: capturas de los tres formatos (`apps/web/src/components/finanzas/print.tsx`) · Estado: Pendiente · Oblig.: Sí
- [ ] **6.4** Impresión en contingencia (marca visible y reimpresión al regularizarse) — Resp.: Nosotros · Dep.: 7.5 · Evidencia: captura · Estado: Pendiente · Oblig.: Sí

## Fase 7 — Notas, anulación de rangos y contingencia

Prerrequisito: fase 5 cerrada. Responsable: Nosotros.

- [ ] **7.1** Notas de crédito/débito electrónicas aceptadas en TesteCF, con referencia correcta y límites — Resp.: Nosotros · Dep.: 5.8 · Evidencia: E34/E33 aceptados — Estado: Pendiente · Oblig.: Sí
- [ ] **7.2** La anulación de un cobro electrónico genera E34 total (no «anulación» del e-CF aceptado) — Resp.: Nosotros · Dep.: 7.1 · Evidencia: prueba (A.3 #9) · Estado: Pendiente · Oblig.: Sí
- [ ] **7.3** ANECF: anulación de rangos de e-NCF no usados o inutilizables (XML firmado y envío); formato y plazos A VALIDAR — Resp.: Nosotros · Dep.: 5.1, 2.16 · Evidencia: ANECF aceptado en TesteCF; tipos `IANECF` ya existen en el paquete — Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **7.4** Reporte de huecos de secuencia y vínculo con 608 — Resp.: Nosotros · Dep.: 7.3 · Evidencia: reporte de prueba · Estado: Pendiente · Oblig.: No
- [ ] **7.5** Contingencia: modo manual/automático cuando la DGII no responde; estado `Contingencia` distinto de `PendienteEnvio`; plazo máximo de envío posterior A VALIDAR (típicamente 72 h) — Resp.: Nosotros · Dep.: 5.5 · Evidencia: prueba que simula caída de la DGII — Estado: A VALIDAR (2026-10-11) · Oblig.: Sí

## Fase 8 — Aprobación comercial, acuse de recibo y recepción (si aplica)

Prerrequisito: fase 7 cerrada y decisión 0.12 sobre URL pública. Responsable: Nosotros + Cliente. Si la DGII confirma que un emisor de solo ventas no necesita recepción, marcar los ítems 8.1-8.5 como «No aplica (fecha, fuente)».

- [ ] **8.1** Confirmar si la certificación exige exponer los endpoints de recepción/aprobación comercial para un emisor de solo ventas — Resp.: DGII + Nosotros · Dep.: 0.7 · Evidencia: respuesta escrita de la DGII · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **8.2** Endpoints públicos `/ecf/autenticacion` (semilla/validación), `/ecf/recepcion` y `/ecf/aprobacion` con límite de tamaño, XML no confiable y sin SSRF — Resp.: Nosotros · Dep.: 8.1, 0.12 · Evidencia: pruebas + revisión de seguridad · Estado: Pendiente · Oblig.: No (según 8.1)
- [ ] **8.3** Generar y enviar acuse de recibo (ARECF) y aprobación comercial (ACECF) firmados — Resp.: Nosotros · Dep.: 8.2 · Evidencia: XML aceptados en TesteCF · Estado: Pendiente · Oblig.: No (según 8.1)
- [ ] **8.4** Registro de recepciones y de aprobaciones/rechazos recibidos de terceros — Resp.: Nosotros · Dep.: 8.2 · Evidencia: tabla + UI · Estado: Pendiente · Oblig.: No (según 8.1)
- [ ] **8.5** Exposición segura a internet (HTTPS, límites de tasa, lista de IP de la DGII si se publica) sin abrir el resto de la API — Resp.: Cliente + Nosotros · Dep.: 8.2 · Evidencia: prueba externa · Estado: Pendiente · Oblig.: No (según 8.1)

## Fase 9 — Set de pruebas de certificación (CerteCF)

Prerrequisito: fases 5 a 8 cerradas (los ítems obligatorios). Responsable: Nosotros + DGII.

- [ ] **9.1** Obtener de la DGII la lista exacta de casos requeridos por tipo (detalle A VALIDAR; se espera: XML válidos de cada tipo, rechazos controlados, notas, aprobación comercial, anulación de rangos, representación impresa) — Resp.: DGII · Dep.: 0.7 · Evidencia: documento del set de pruebas vigente · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **9.2** Script que emite los casos del set y genera la evidencia (XML enviados, TrackId, respuestas) — Resp.: Nosotros · Dep.: 9.1 · Evidencia: `scripts/` + carpeta de evidencia · Estado: Pendiente · Oblig.: Sí
- [ ] **9.3** Pasar el set de E31 y E32 (y RFCE) en CerteCF — Resp.: Nosotros + DGII · Dep.: 9.2 · Evidencia: aceptación en CerteCF · Estado: Pendiente · Oblig.: Sí
- [ ] **9.4** Pasar el set de E34 y E33 — Resp.: Nosotros + DGII · Dep.: 9.3 · Evidencia: aceptación · Estado: Pendiente · Oblig.: Sí
- [ ] **9.5** Pasar los sets de los demás tipos que use el cliente (E41, E43, E44, E45, E46, E47) — Resp.: Nosotros + DGII · Dep.: 9.3 · Evidencia: aceptación · Estado: Pendiente · Oblig.: No
- [ ] **9.6** Pasar aprobación comercial/recepción y ANECF si corresponde (8.1) — Resp.: Nosotros + DGII · Dep.: 9.3 · Evidencia: aceptación · Estado: Pendiente · Oblig.: No (según 8.1)
- [ ] **9.7** Revisión de la representación impresa por la DGII o autoverificación con su lista — Resp.: DGII + Nosotros · Dep.: 6.3 · Evidencia: constancia · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **9.8** Declaración/constancia final de certificación como emisor (o autorización para producción) — Resp.: DGII · Dep.: 9.3-9.7 · Evidencia: documento de la DGII · Estado: Pendiente · Oblig.: Sí

## Fase 10 — Producción

Prerrequisito: 9.8. Responsable: Cliente + Nosotros + DGII.

- [ ] **10.1** Registrar en la DGII las URL productivas (autenticación, recepción, aprobación comercial; la DGII las pide al cerrar la certificación) — Resp.: Cliente + DGII · Dep.: 9.8, 8.1 · Evidencia: confirmación de registro · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **10.2** Secuencias e-NCF reales por tipo cargadas con su vencimiento y autorización — Resp.: Cliente + Nosotros · Dep.: 0.9 · Evidencia: pantalla de secuencias + autorización (hoy `autorizacion` es texto libre) · Estado: Pendiente · Oblig.: Sí
- [ ] **10.3** Cambio de ambiente a producción (`eCF`) por configuración, con doble confirmación en la UI — Resp.: Nosotros · Dep.: 10.1 · Evidencia: captura + prueba · Estado: Pendiente · Oblig.: Sí
- [ ] **10.4** Primer e-CF real emitido y aceptado (monto bajo, con el contador presente) — Resp.: Cliente + Nosotros · Dep.: 10.2, 10.3 · Evidencia: e-CF aceptado + representación impresa · Estado: Pendiente · Oblig.: Sí
- [ ] **10.5** Monitoreo: cola, rechazos, vencimiento de certificado y de secuencias, alertas al administrador — Resp.: Nosotros · Dep.: 5.9 · Evidencia: panel/alertas · Estado: Pendiente · Oblig.: Sí
- [ ] **10.6** Conservación de XML firmados y respuestas por 10 años (plazo A VALIDAR), con respaldo y exportación — Resp.: Nosotros · Dep.: 5.2 · Evidencia: prueba de restauración — Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **10.7** Plan de renovación del certificado (aviso a 60/30/15 días, procedimiento y actualización en la DGII) y prueba del cambio de certificado — Resp.: Cliente + Nosotros · Dep.: 4.4 · Evidencia: procedimiento + prueba en CerteCF — Estado: Pendiente · Oblig.: Sí
- [ ] **10.8** Procedimiento de contingencia y de soporte (quién atiende, tiempos) — Resp.: Nosotros + Cliente · Dep.: 7.5 · Evidencia: documento operativo · Estado: Pendiente · Oblig.: Sí

## Fase 11 — Operación por cliente (instalador y licencia)

Prerrequisito: fase 10 para el primer cliente; la plantilla se prepara antes. Responsable: Nosotros.

- [ ] **11.1** El instalador pregunta ambiente (pruebas/certificación/producción), RNC y modalidad, y valida el RNC contra el padrón (hoy `install.ps1` L142-260 valida el RNC con API de terceros) — Resp.: Nosotros · Dep.: 2.14 · Evidencia: prueba del instalador · Estado: Pendiente · Oblig.: Sí
- [ ] **11.2** El instalador/Configuración valida el certificado (contraseña, RNC, vigencia) antes de activar `ecf` — Resp.: Nosotros · Dep.: 4.3 · Evidencia: prueba · Estado: Pendiente · Oblig.: Sí
- [ ] **11.3** Alta por cliente: lista de verificación de fases 0 y 10 (certificado, secuencias, URL, certificación) sin compartir claves entre instalaciones — Resp.: Nosotros · Dep.: 10.4 · Evidencia: plantilla de alta completada por cliente · Estado: Pendiente · Oblig.: Sí
- [ ] **11.4** Licencia: la emisión electrónica queda atada a la licencia de la instancia y bloquea con aviso si vence — Resp.: Nosotros · Dep.: — · Evidencia: prueba con `scripts/license` · Estado: Pendiente · Oblig.: No
- [ ] **11.5** Contrato/acuerdo de custodia de clave del cliente y responsabilidades fiscales (A VALIDAR con asesoría legal) — Resp.: Nosotros + Cliente · Dep.: 0.6 · Evidencia: documento firmado · Estado: A VALIDAR (2026-10-11) · Oblig.: Sí
- [ ] **11.6** Procedimiento de actualización normativa (cambios de la DGII → actualización de `@stodia/dgii-ecf` según `UPSTREAM.md`) — Resp.: Nosotros · Dep.: 1.4 · Evidencia: documento + calendario de revisión mensual · Estado: Pendiente · Oblig.: No
