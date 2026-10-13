# Evaluación: integración con la facturación electrónica de la DGII (e-CF / e-NCF)

> **Checklist de trabajo secuencial para certificarse como emisor: [`docs/certificacion-ecf-checklist.md`](certificacion-ecf-checklist.md)** (fork `packages/dgii-ecf` y auditoría: [`docs/dgii-ecf-auditoria.md`](dgii-ecf-auditoria.md)).
>
> Fecha de la evaluación: **2026-10-11**. Documento de análisis (no cambia código, esquema ni datos).
> Convención: **A VALIDAR** = no confirmado en fuente oficial por el equipo; hay que verificarlo con la DGII, el contador o el proveedor antes de construir.
> **Verificado (2026-10-11, búsqueda en dgii.gov.do y ayuda.dgii.gov.do, solo resúmenes):** flujo semilla → firma → token; envío del e-CF en XML con respuesta de TrackId;
> consulta de resultado por TrackId; consulta de estado (RNC emisor, e-NCF, y RNC comprador y código de seguridad como campos condicionales); aprobación comercial (XML firmado);
> rutas por ambiente `.../testecf/...`, `.../certecf/...`, `.../ecf/...`; recepción de facturas de consumo (RFCE) en `fc.dgii.gov.do/.../recepcionfc`; errores frecuentes de
> «Certificado Digital No Válido / Tipo de certificado no admitido»; el proceso de certificación exige, al terminar las pruebas, registrar las URL productivas de autenticación,
> recepción y aprobación comercial. **No se pudo leer** el PDF «Proceso de Certificación para ser Emisor Electrónico» (descarga sin texto extraíble) ni los XSD: todo lo demás de la
> sección B es conocimiento del equipo y queda **A VALIDAR**. Fuentes: dgii.gov.do › Comprobantes Fiscales Electrónicos (e-CF) › «Documentación sobre eCF» (Informe Técnico,
> Descripción Técnica, Proceso de Certificación, XSD) y foros de ayuda.dgii.gov.do.

---

## A. Escenario actual (verificado en el código)

### A.1 Lo que existe

| Área | Qué hay | Dónde |
|---|---|---|
| Catálogo de tipos | B01–B17 físicos y E31, E32, E33, E34, E41, E43, E44, E45, E46, E47 electrónicos, con `logico`, `requiereRnc`, `nota` («A VALIDAR») | `apps/api/src/lib/fiscal.ts` L26–54; `schema.prisma` `TipoComprobante` (~L471) |
| Secuencias | `SecuenciaFiscal`: rango `desde/hasta`, `actual` = último usado, `vence`, `umbralPct`, estados, `autorizacion` (texto ≤60), `historica`. Electrónico = `E`+tipo(2)+secuencial(10) = 13 caracteres | `fiscal.ts` L62–67, `schema.prisma` ~L497 |
| Numeración | `asignarNcf` atómico (SQL Server `UPDATE … WITH (UPDLOCK,ROWLOCK) … OUTPUT`; SQLite `RETURNING`) dentro de la transacción del documento, elige la secuencia que vence antes, 409 si no hay; reintento ante deadlock; cola `enSerie` en SQLite | `fiscal.ts` L141–174, L378–406 |
| Modalidad | `SisConfig 'modalidadFiscal'` por tipo lógico (FISICA/ELECTRONICA); pasar a electrónica exige secuencia activa y, si no hay `ecf`, advertencia confirmable | `fiscal.ts` L109–118, L301–318 |
| Estado DGII | `FinRecibo.estadoDgii` y `NotaFiscal.estadoDgii`: `NoAplica | PendienteEnvio | Aceptado | Rechazado | Contingencia`. `asignarNcf` devuelve `PendienteEnvio` si es electrónico. **Nada escribe nunca Aceptado/Rechazado/Contingencia** | `fiscal.ts` L171; `schema.prisma` ~L388, ~L558 |
| Comprador | `clienteRnc`, `clienteNombre`, `regimenEspecial` en recibo y nota (instantánea); validación por tipo y umbral de consumo identificado (RD$ 250,000, A VALIDAR) | `fiscal.ts` L324–342 |
| Consulta de RNC | `lib/rnc-lookup.ts`: proveedores `tutor`, `historial` y `dgii` (API de terceros por `x-api-key`, **desactivada** por defecto, 6 s de timeout, sin bloquear el cobro) | `apps/api/src/lib/rnc-lookup.ts` |
| Notas | `NotaFiscal` B04/E34 y B03/E33 (hereda la modalidad del NCF modificado), `ncfModificado` (copia), `MotivoNota` con `codigoDgii` 01–05, líneas, reembolsos, plazo 30 días, idempotencia por `idempotencyKey` | `schema.prisma` ~L528–645; `lib/notas.ts` |
| ITBIS | Tasa en `SisConfig finanzas.itbis` (0.18). Solo la **venta rápida** lo calcula (`FinProducto.tax`) | `sisconfig.ts` L16; `modules/kiosko/index.ts` L39–42 |
| Descuentos | Por línea en `FinReciboItem` (`descuento`, `descuentoMotivo`, `descuentoBeca`, `montoBruto`) | `schema.prisma` ~L432–452 |
| Certificado | `SisConfig ecf` (booleano) y `ecfInfo {archivo, vence}`; `POST /config/ecf` guarda solo el flag y los metadatos, **nunca el .p12** | `modules/config/index.ts` L145–153; `packages/shared/src/sistema.ts` L60 |
| Perfil institucional | `SisConfig perfil` con `nombre`, `rnc`, `dir`, `tel`, `ciudad` | `sisconfig.ts` L6 |
| Instalador | `install.ps1` valida el RNC contra la DGII (vía API de terceros), compara el nombre con la razón social y avisa | `install.ps1` L142–260 |
| Impresión | Tirilla/recibo muestra «e-NCF pendiente de envío a la DGII»; el PDF engine tiene folio + SHA-256 + QR **propio** para boletines (`/verificar/<folio>`, «no es firma digital») | `components/finanzas/print.tsx` L66–70; `pdfEngine.tsx` L92–117 |
| Documentación | `docs/fiscal-ncf.md` con secciones «A VALIDAR» y declaración explícita de que no hay XML/firma/transmisión | `docs/fiscal-ncf.md` §1, §9 |

### A.2 Lo que falta (todo lo propio de e-CF)

XML por tipo, validación XSD, firma XMLDSig, certificado (almacenamiento y uso), autenticación semilla/token, envío y consulta de estado, jobs con reintento, RFCE, aprobación
comercial/acuse, ANECF, contingencia, código de seguridad y QR oficial, conservación de XML, módulo de estado por comprobante en la UI y reenvío manual.

### A.3 Lo incompleto o incorrecto para e-CF (hallazgos concretos)

| # | Hallazgo | Evidencia | Impacto | Prioridad |
|---|---|---|---|---|
| 1 | **La venta rápida (`FinVenta`) no guarda tipo de comprobante, modalidad, estado DGII ni RNC/razón social del comprador.** Solo `ncf` (sin UNIQUE) y `doc` (`cf2`/…); el cliente va a la respuesta, no a la base. Una venta con e-NCF no puede enviarse ni reintentarse | `schema.prisma` `FinVenta` (~L744); `kiosko/index.ts` L56–70 | Bloqueante para E31/E32 de la papelería | Alta |
| 2 | **ITBIS no desglosado en recibos.** `FinRecibo.monto` es un total; no hay base gravada, exento, ITBIS ni tasa por línea (`FinReciboItem` no tiene indicador de facturación). La nota ya lo infiere (`notas.ts` L155 «no se guarda la tasa») | `schema.prisma` ~L432; `notas.ts` L155 | El XML exige montos gravados/exentos/ITBIS por línea y totales que cuadren al centavo | Alta |
| 3 | **Montos en `Float`** (recibo, línea, nota, venta). Redondeos binarios; el XML exige 2 decimales exactos y que sumas y totales cuadren | `schema.prisma` (`monto Float`) | Rechazos por descuadre; solución: calcular en céntimos enteros al armar el XML y validar | Alta |
| 4 | **Descuentos por línea sin mapeo a e-CF** (tabla de descuentos/recargos del XML, tipo de valor, monto) y becas ya incluidas en `monto` | `FinReciboItem` | Hay que decidir si el XML lleva precio neto o bruto con descuento | Media |
| 5 | **Líneas sin datos de ítem DGII**: unidad de medida, cantidad, precio unitario, indicador bien/servicio, código de ítem. `FinReciboItem` solo tiene `concepto` y `monto` | `schema.prisma` ~L432 | Datos a derivar o completar por catálogo de servicios | Alta |
| 6 | **Falta la autorización de secuencia electrónica con sus datos**: fecha de vencimiento sí existe (`vence`), pero no hay RNC emisor de la autorización, número de solicitud ni validación de que el rango electrónico coincida con lo autorizado por la DGII; `autorizacion` es texto libre | `SecuenciaFiscal` | Media | Media |
| 7 | **Certificado no se guarda ni se usa**; `ecf=true` es un interruptor manual sin verificación de vigencia (`vence` es texto libre `dd/mm/aaaa` en el seed, ver `seed-finanzas.ts` L165–166) | `config/index.ts` L145 | `cambiarModalidad` deja emitir e-NCF «Pendiente de envío» sin certificado real | Alta |
| 8 | **El e-NCF se consume en la emisión** y la numeración no distingue «reservado/enviado/aceptado»; una nota con e-NCF rechazado no tiene política de reuso/anulación (en e-CF un e-NCF rechazado normalmente se corrige con otro XML o se inhabilita por ANECF; A VALIDAR) | `fiscal.ts` L159–174 | Riesgo de huecos de secuencia que hay que reportar | Alta |
| 9 | **Anulación = nota de crédito total (E34)**. En e-CF no se «anula» un e-CF aceptado: se acredita con E34; las secuencias no usadas o rechazadas se anulan por rangos (ANECF). No existe la figura de anulación de rangos | `lib/notas.ts` | Falta módulo ANECF y reporte | Media |
| 10 | **Plazo de nota de crédito**: `notaPlazoDias=30` es una regla del colegio, no de la DGII (A VALIDAR el plazo oficial para E34) | `docs/fiscal-ncf.md` §12.5 | Baja | Baja |
| 11 | **Nota de débito**: referencia a recibo/venta existe (`ncfModificado`), pero la DGII exige código de modificación y fecha del comprobante modificado; el `codigoDgii` mapeado de motivos operativos es «el más cercano» (A VALIDAR) | `MotivoNota`, `notas.ts` | Media | Media |
| 12 | **QR de verificación es propio** (`/verificar/<folio>`) y solo para boletines; los recibos no llevan QR oficial ni código de seguridad | `pdfEngine.tsx` L92–117 | Fase 4 | Alta |
| 13 | **Consulta de RNC por API de terceros con clave embebida en el instalador** (`install.ps1` L147: clave en texto plano en el repositorio). No es el padrón oficial de la DGII y expone una credencial; conviene rotarla y sacarla del repo | `install.ps1` L143–148 | Seguridad; no bloquea e-CF | Media |
| 14 | **Zona horaria/fechas**: `hora` es texto `HH:mm`; el XML exige fecha/hora de firma con segundos y la fecha de emisión en `dd-MM-yyyy` (A VALIDAR formato exacto) | `FinRecibo.hora` | Baja (se calcula al firmar) | Baja |
| 15 | **Pagos**: `FinReciboPago` por medio (`MetodoPago`) sin mapeo a las formas de pago de la DGII (efectivo, cheque/transferencia, tarjeta, crédito, etc.; A VALIDAR códigos) | `schema.prisma` ~L455 | Media | Media |
| 16 | **Datos del emisor insuficientes**: `perfil` no tiene nombre comercial, municipio/provincia con códigos DGII, correo ni teléfonos en formato, ni actividad económica | `sisconfig.ts` L6 | Media | Media |
| 17 | **Comprador sin correo/dirección/país** y sin validación contra padrón en la emisión (la API de padrón está apagada; hoy solo se valida el largo 9/11) | `fiscal.ts` L324–342 | Media (los E31 rechazados por RNC no válido) | Media |
| 18 | **Una instancia por cliente**: el certificado, el RNC emisor y las URL productivas son por instalación; no hay gestión multi-tenant ni custodia | arquitectura (`docker-compose.yml`, `install.ps1`) | Define el modelo de custodia | Alta |

---

## B. Requisitos de la integración (normativa DGII)

> Todo lo de B es **A VALIDAR** salvo lo marcado «verificado». Norma de referencia (A VALIDAR números y vigencia): Norma General 06-2018 (facturación electrónica), Norma General 05-2019 y
> 07-2018 (e-CF y comprobantes), «Descripción Técnica de Facturación Electrónica», «Formato de Comprobantes Fiscales Electrónicos» (XSD) y el calendario de obligatoriedad por tipo de contribuyente.

### B.1 Habilitación como emisor (A VALIDAR el orden exacto)

1. **Cliente (contribuyente)**: RNC activo, al día, con acceso a la **Oficina Virtual**; solicita la **inscripción/postulación como emisor electrónico** (con certificado digital y, si aplica, indicar el software o proveedor).
2. **Obtener certificado digital** de una entidad autorizada (A VALIDAR; en RD suelen ser Cámara de Comercio y Producción de Santo Domingo, Avansi, Digifirma, entre otras acreditadas por INDOTEL).
3. **Ambientes**: pruebas (TesteCF), certificación (CerteCF) y producción (eCF) (rutas verificadas en foros y documentación). La DGII entrega un **set de pruebas** por tipo de e-CF que el software debe superar (XML válidos, firma, aceptación, rechazos controlados, aprobación comercial, anulación de rangos, representación impresa).
4. Superado el proceso: **registrar las URL productivas** (autenticación, recepción, aprobación comercial; verificado que las pide) y recibir la autorización; luego **solicitar las secuencias e-NCF** por tipo (hoy el sistema ya modela el rango y su vencimiento).
5. **Proveedor de servicios de facturación electrónica** (PSFE): existe una vía de certificación para emisores que usan proveedor (hay un PDF de la DGII titulado «Emisor Electrónico con Proveedor de Servicios de Facturación Electrónica»; verificado que existe, **no leído**). A VALIDAR si el proveedor certifica una vez (y el colegio solo se postula) o cada cliente certifica por su cuenta.
6. **Calendario de obligatoriedad** y si un colegio (RNC de persona jurídica, posiblemente exento de ITBIS en colegiaturas) está obligado: **A VALIDAR con el contador/DGII**.

### B.2 Certificado digital

| Punto | Requisito (A VALIDAR) |
|---|---|
| Emisores | Entidades certificadoras acreditadas por INDOTEL (la DGII no acepta cualquiera: errores «Tipo de certificado no admitido» en foros) |
| Formato | `.p12`/`.pfx` (PKCS#12) con clave privada; RSA 2048 y SHA-256 (A VALIDAR) |
| Titularidad | A nombre del representante o de la persona jurídica; el certificado debe corresponder al RNC emisor (A VALIDAR) |
| Vigencia | Típicamente 1–2 años; alertar a 60/30/15 días; renovar antes de vencer (un cambio de certificado puede requerir actualizar la inscripción en la DGII) |
| Custodia | La clave **nunca** en el repositorio ni en texto plano. Almacenar el `.p12` cifrado (AES-256-GCM con clave maestra por instalación fuera de la base: variable de entorno/secret de Docker/DPAPI/KMS), contraseña por separado, acceso solo del servicio de firma, auditoría de cada uso. Hoy solo se guardan metadatos (`ecfInfo`) |

### B.3 Generación del XML por tipo (A VALIDAR contra los XSD vigentes)

| Tipo | Uso en un colegio | Particularidades (A VALIDAR) |
|---|---|---|
| E31 Crédito fiscal | Padres/empresas con RNC | Comprador con RNC y razón social obligatorios; ITBIS discriminado |
| E32 Consumo | Mayoría de cobros | Sin identificación bajo el umbral; si el total es menor a RD$ 250,000 (A VALIDAR) se envía **resumen RFCE** a `fc.dgii.gov.do` (verificado que existe el servicio) con el XML completo conservado por el emisor; ≥ umbral se envía completo y exige identificar al comprador |
| E33 Nota de débito | Mora, recargos | Referencia al e-NCF modificado, fecha y código de modificación; secuencia propia |
| E34 Nota de crédito | Anulación/devolución | Ídem E33; el monto no puede exceder el comprobante modificado; plazo de emisión (A VALIDAR; en normativa física era 30 días) |
| E41 Compras | No aplica hoy | Futuro (compras a informales) |
| E43 Gastos menores | No aplica hoy | Futuro |
| E44 Regímenes especiales | Zonas francas/exentos | Comprador con régimen |
| E45 Gubernamental | Estado | RNC público |
| E46 Exportaciones | No aplica | — |
| E47 Pagos al exterior | No aplica | — |

Estructura general (A VALIDAR nombres exactos): `Encabezado` (versión, `IdDoc` con tipo, e-NCF, vencimiento de la secuencia, indicador de monto gravado, tipo de ingresos, tipo de pago, forma de pago; `Emisor` con RNC, razón social, dirección, municipio/provincia, fecha de emisión; `Comprador`; `Totales` con montos gravados I/II/III, exento, ITBIS por tasa, total), `DetallesItems` (línea con indicador de facturación, nombre, indicador bien/servicio, cantidad, unidad de medida, precio, descuento, montos, impuesto), `Subtotales`, `DescuentosORecargos`, `Paginacion`, `InformacionReferencia` (en notas), `FechaHoraFirma` y la firma.
Codificaciones DGII a cargar como catálogos (A VALIDAR las tablas vigentes): tipo de ingresos (operaciones, financieros, extraordinarios, arrendamiento, venta de activos…), tipo de pago (contado/crédito/gratuito), forma de pago, unidades de medida, indicador de facturación (gravado a 18 %, 16 %, 0 %, exento…), códigos de provincia/municipio, tipos de impuesto adicional, códigos de modificación (01–05). Validación obligatoria contra los **XSD oficiales** antes de firmar (en Node: `libxmljs2` o `xmllint-wasm`; evitar dependencias nativas pesadas en Docker).

### B.4 Firma y autenticación

- **Firma XMLDSig** enveloped sobre el XML (canonicalización y digest conforme a la guía; RSA-SHA256 típico, A VALIDAR) con el certificado del emisor; incluir `FechaHoraFirma`.
- **Autenticación (verificado el flujo):** `GET …/Autenticacion/api/Autenticacion/Semilla` → firmar el XML de la semilla → `POST …/ValidarSemilla` → **token** (con vigencia corta; renovar y cachear). El token se usa en `Authorization: Bearer` en recepción y consulta.
- **Envío:** `POST` del XML firmado a recepción (multipart); respuesta con **TrackId** (verificado). Consulta de resultado por `trackId` (verificado); estados: **Aceptado, Aceptado condicional, Rechazado, En proceso** (A VALIDAR códigos numéricos y los mensajes de error).
- **Consulta de estado** por RNC emisor + e-NCF (+ RNC comprador y código de seguridad según el caso) para verificar un e-CF recibido (verificado).
- **Aprobación comercial / acuse de recibo**: el receptor firma y envía el XML de aprobación o rechazo; el emisor debe exponer un endpoint para recibirlos de **otros** emisores (si el colegio recibe e-CF de proveedores) y registrar la URL en la DGII (verificado que se registra la de aprobación comercial). Para un emisor de solo ventas, el endpoint de **recepción de e-CF de terceros** puede ser obligatorio igualmente para certificarse (A VALIDAR).
- **Anulación de rangos (ANECF)**: informar rangos de e-NCF no utilizados o inutilizables; A VALIDAR formato y plazos.
- **Contingencia**: cuando la DGII no está disponible, se emite con e-NCF y se envía después (plazo máximo A VALIDAR, típicamente 72 h) y se guarda la representación impresa; el sistema debe distinguir `Contingencia` (ya existe en el enum) de `PendienteEnvio`.

### B.5 Representación impresa

QR con URL de consulta de la DGII que incluye RNC emisor, e-NCF, fecha de emisión (y de firma), monto total y **código de seguridad** (6 primeros caracteres del hash SHA-256 del `SignatureValue`; A VALIDAR el cálculo exacto). Además: e-NCF, fecha de vencimiento de la secuencia, tipo de comprobante, texto de condiciones, y el **código de seguridad** impreso. Formato (tirilla/carta) sin exigencia visual estricta, A VALIDAR campos mínimos.

### B.6 Otras reglas

| Tema | Regla (A VALIDAR) |
|---|---|
| Vencimiento de secuencias e-NCF | Cada rango autorizado tiene fecha de vencimiento (el modelo ya lo maneja); no emitir con rango vencido |
| Conservación | El XML firmado y la respuesta de la DGII deben conservarse **10 años** (A VALIDAR) y ser recuperables |
| Reintentos/idempotencia | Reenviar el mismo XML con el mismo e-NCF no debe crear duplicado: guardar `trackId` y hash del XML; una respuesta «ya recibido» debe reconciliarse por consulta de estado |
| Rechazos | Un rechazo no libera el e-NCF; se corrige y se reenvía con el mismo número si la DGII lo permite, o se anula el rango (ANECF) |
| Conciliación | Job diario que compara e-NCF emitidos con estado en la DGII (consulta de estado) y reporta diferencias; base para 606/607/608 |
| Reportes | Con e-CF, los envíos de 607 los genera la DGII a partir de los e-CF recibidos (A VALIDAR); el 608 sigue para anulados |

---

## C. Brechas y plan

### C.1 Brechas → qué construir

| # | Brecha | Qué construir (aditivo) | Esfuerzo | Riesgo / dependencia externa |
|---|---|---|---|---|
| 1 | Sin XML | `lib/ecf/xml.ts`: mapeadores `recibo|nota|venta → ECF` por tipo; catálogos DGII; cálculo en céntimos con verificación de totales; tests con XML dorados | L | Normativa/XSD vigentes (A VALIDAR) |
| 2 | ITBIS y datos de línea | Columnas aditivas: `FinReciboItem.indicadorFacturacion`, `baseGravada`, `itbis`, `unidadMedida`, `cantidad`, `precioUnitario`; `FinVentaItem` ya tiene `tax`; backfill con reglas del colegio (colegiatura exenta/gravada: **decisión fiscal del cliente**) | M | Decisión del contador |
| 3 | FinVenta sin datos fiscales | Añadir a `FinVenta`: `tipoComprobanteId`, `secuenciaFiscalId`, `modalidad`, `estadoDgii`, `clienteRnc`, `clienteNombre`; migración con DEFAULT B02/histórica | M | Bajo |
| 4 | Certificado y secretos | Tabla `EcfCertificado` (id, rncEmisor, huella, vence, `p12Cifrado`, `kdfSalt`, estado) o archivo en volumen cifrado; clave maestra por variable de entorno/secret; pantalla Configuración › Fiscal: subir `.p12`, pedir contraseña, validar (RNC/vigencia/cadena) y mostrar huella; alerta de vencimiento | M | Custodia de claves, licencia |
| 5 | Firma y autenticación | `lib/ecf/firma.ts` (XMLDSig con `xml-crypto`/`xmldsigjs` + `node-forge` para el .p12), `lib/ecf/dgii-cliente.ts` (semilla/token con caché, ambientes por configuración) | M | Errores «certificado no admitido» (usar el certificado correcto) |
| 6 | Cola de envío | Tabla `EcfEnvio` (documento tipo+id, e-NCF, `xml`, `xmlFirmado`, `hashXml`, `trackId`, `estado`, `intentos`, `proximoIntento`, `ultimoError`, `codigoSeguridad`, `respuesta`, timestamps) con UNIQUE por e-NCF; worker con backoff exponencial, idempotencia y bloqueo (`UPDLOCK`/`SKIP`); sincroniza `estadoDgii` del recibo/nota/venta | L | Disponibilidad de la DGII |
| 7 | Estados y consulta | Job de consulta por TrackId hasta estado final; mapeo a `Aceptado/Rechazado/Contingencia` (+ «Aceptado condicional» → nuevo valor o campo aparte); no bloquear el cobro (emitir y enviar en segundo plano) | M | Estados oficiales A VALIDAR |
| 8 | RFCE (E32 < umbral) | Servicio de resumen y envío a `fc` | M | Umbral A VALIDAR |
| 9 | Aprobación comercial / acuse / recepción | Endpoints públicos firmados (`/ecf/recepcion`, `/ecf/aprobacion`) y registro de las URL; requiere dominio HTTPS accesible desde la DGII (la instalación local en la red del colegio puede no tenerlo) | M | Infraestructura del cliente |
| 10 | ANECF | Pantalla/servicio para anular rangos no usados o inutilizables; integración con `SecuenciaFiscal` | M | Normativa |
| 11 | Contingencia | Modo contingencia manual/automático; cola con marca `Contingencia` y plazo | M | Normativa |
| 12 | Representación impresa/QR | Código de seguridad y QR oficial en recibo/tirilla/PDF (reusar `qrcode-generator` de `pdfEngine`); leer de `EcfEnvio`; ocultar «pendiente» al aceptar | S–M | Bajo |
| 13 | UI de estado | Columna y filtro «Estado DGII» en historial de recibos y notas; detalle con XML, respuesta y errores; botón **Reenviar** (rol y PIN); panel de pendientes/rechazados | M | Bajo |
| 14 | Conservación y reportes | Almacén de XML de 10 años con respaldo (`backup.ps1`/`backup.sh` incluyen la tabla); exportación; conciliación diaria | M | Retención y tamaño |
| 15 | Pruebas | Set oficial de pruebas de certificación automatizado (script que emite los casos y genera evidencia), tests unitarios de XML/firma con XSD, simulador local de la DGII | L | Acceso a TesteCF/CerteCF |
| 16 | Datos del emisor | Ampliar `perfil`: nombre comercial, dirección estructurada con códigos DGII, correo, teléfonos, actividad | S | Bajo |
| 17 | Seguridad de la consulta de RNC | Quitar la clave embebida de `install.ps1`, rotarla y pasar a variable de entorno; usar el padrón de la DGII (descarga oficial) como fuente local | S | Bajo |

### C.2 Construir directo vs. proveedor

| Criterio | Construir directo con la DGII | Proveedor / PAC / API intermediaria |
|---|---|---|
| Control y dependencia | Total; sin cuotas por documento | Depende del proveedor y su disponibilidad |
| Esfuerzo inicial | Alto (XML + XSD + firma + cola + certificación) | Bajo-medio (mapear a su JSON/API) |
| Certificación | Hay que superar el set de pruebas **por emisor** (A VALIDAR si es por emisor o por software) | Normalmente ya certificado como proveedor; el cliente se postula con él |
| Costo | Desarrollo + mantenimiento normativo; certificado del cliente | Cuota mensual/por documento (rango referencial **A VALIDAR** con cotizaciones; el equipo no tiene precios confirmados) |
| Custodia del certificado | La instancia del cliente (riesgo de seguridad a gestionar) | Muchos proveedores piden cargar el certificado en su plataforma (riesgo de custodia en terceros) o firman con el suyo (A VALIDAR si la DGII lo admite) |
| Cambios normativos | Los asume el equipo | Los asume el proveedor |
| Cuándo conviene | Muchos clientes, volumen alto, equipo que sostenga el cumplimiento | Pocos clientes, poca capacidad de mantenimiento, plazo corto |

**Recomendación:** arquitectura de **puerto + adaptadores** (`PuertoEcf` con operaciones `emitir`, `consultar`, `anular`, `recibir`), un adaptador **proveedor** primero para salir a producción rápido (menos riesgo de rechazos y certificación, la cola y la UI de estado se construyen una sola vez) y un adaptador **directo DGII** después si el volumen lo justifica. La cola `EcfEnvio`, el estado por comprobante, el QR y la conciliación sirven a ambos. Esta decisión es reversible. **A VALIDAR** con 2–3 cotizaciones antes de decidir.

### C.3 Arquitectura recomendada

```
Cobros/Kiosko/Notas ──(transacción: asignarNcf + documento + EcfEnvio 'Pendiente')──▶ DB
                                                            │
                        Worker (mismo proceso Fastify o contenedor aparte, un solo escritor)
                        └─ construir XML ─▶ validar XSD ─▶ firmar (certificado cifrado) ─▶ PuertoEcf
                                         ├─ AdaptadorProveedor (API REST del PAC)
                                         └─ AdaptadorDgii (semilla/token, recepción, consulta)
                        └─ consultar estado (trackId) ─▶ actualizar estadoDgii + QR/código de seguridad
UI: estado por comprobante, reenviar, contingencia, conciliación, alertas de certificado/secuencia
```

Reglas: el cobro **no espera** a la DGII; el e-NCF se asigna en la transacción como hoy; el envío es asíncrono con idempotencia; la tabla `EcfEnvio` es el único lugar donde se escribe `estadoDgii`.

### C.4 Fases

| Fase | Contenido | Salida |
|---|---|---|
| 0 | Prerrequisitos y trámites del cliente: confirmar obligatoriedad, inscripción, certificado, secuencias, decidir PAC vs directo, cotizaciones | Decisión y accesos |
| 1 | Modelo y XML: columnas aditivas, `FinVenta` fiscal, ITBIS por línea, catálogos DGII, mapeadores, validación XSD | XML válido de E31/E32/E33/E34 |
| 2 | Firma y autenticación: custodia del certificado, XMLDSig, semilla→token | Autenticación exitosa en TesteCF |
| 3 | Envío y estados: cola `EcfEnvio`, TrackId, consulta, reintentos, UI de estado, RFCE | Documentos aceptados en TesteCF |
| 4 | Impresa/QR: código de seguridad y QR oficial, textos, tirilla y PDF | Representación impresa conforme |
| 5 | Certificación en CerteCF: set de pruebas, aprobación comercial/recepción, ANECF, contingencia | Autorización de producción |
| 6 | Producción: registrar URL, secuencias reales, monitoreo, conciliación, respaldo de XML | Operación |

### C.5 Riesgos fiscales

- **Cada instancia es de un cliente distinto con su certificado propio**: proceso de alta por cliente (certificado, RNC, secuencias, URL productivas, certificación), sin compartir claves entre instalaciones. Qué pasa si un colegio no renueva el certificado: el sistema debe bloquear la emisión electrónica con aviso, no seguir emitiendo «Pendiente de envío».
- **Licencia y custodia**: el contrato debe dejar claro que STODIA custodia (o no) la clave del cliente; si se usa PAC, quién es responsable de los datos; el `.p12` y la contraseña no deben salir de la instalación sin consentimiento por escrito (A VALIDAR con asesoría legal).
- **Datos sin validar**: ITBIS de colegiaturas (D12 de `docs/contabilidad-rrhh.md`), umbral RFCE, plazos de notas: errores = rechazos o multas.
- **Huecos de secuencia** y e-NCF sin enviar: política y reporte 608/ANECF.
- **Acceso desde la DGII**: aprobación comercial y recepción requieren URL pública HTTPS.
- **Clave API del padrón en el repositorio** (ver A.3 #13).

### C.6 Qué necesitamos de ti / del cliente

| Quién | Qué |
|---|---|
| Producto (tú) | Decisión build vs. proveedor; presupuesto; cuántos clientes y fecha objetivo; quién da soporte fiscal |
| Cliente | Confirmación con su contador de si está obligado y desde cuándo; RNC activo y acceso a Oficina Virtual; trámite de inscripción como emisor electrónico; **certificado digital** (`.p12`, contraseña, vigencia) o autorización para que se gestione; secuencias e-NCF autorizadas (por tipo, con vencimiento); decisión sobre ITBIS de cada concepto; dirección/municipio/provincia/correo del emisor; dominio o IP pública HTTPS si se reciben aprobaciones |
| Accesos | Cuenta en TesteCF/CerteCF; contacto `facturacionelectronica@dgii.gov.do`; XSD y Descripción Técnica vigentes (descargar de dgii.gov.do); credenciales de sandbox del proveedor si se elige PAC |
| Datos | 20–50 recibos reales de ejemplo por tipo (consumo, crédito fiscal, nota) para generar los XML dorados |

---

## Primeras acciones recomendadas

1. Confirmar con el contador/DGII si el colegio (o cada cliente) está obligado y el calendario; actualizar las secciones A VALIDAR de `docs/fiscal-ncf.md`.
2. Descargar y guardar en `docs/` (o fuera del repo) los XSD, la Descripción Técnica y el set de pruebas vigentes; leer el PDF «Proceso de Certificación» completo.
3. Pedir 2–3 cotizaciones de PAC/API de e-CF y decidir build vs. proveedor (con adaptador intercambiable).
4. Decidir el tratamiento fiscal del ITBIS por concepto y completar el modelo (columnas por línea, datos del emisor).
5. Dar datos fiscales a `FinVenta` (tipo, modalidad, estado DGII, comprador) y revisar los `Float`.
6. Diseñar la custodia del certificado y los secretos (cifrado, variables, auditoría) y retirar la clave API embebida de `install.ps1` (rotarla).
7. Crear la tabla `EcfEnvio` y la cola con idempotencia antes de escribir la firma; comenzar por E32/E31 en TesteCF.
8. Preparar el entorno de pruebas y el script del set de certificación.

## Preguntas abiertas

- ¿Cuántos clientes y para cuándo? ¿Cada uno certifica por su cuenta o hay una certificación única de STODIA como proveedor?
- ¿Las colegiaturas llevan ITBIS o están exentas? ¿Y los servicios complementarios y la papelería?
- ¿Se aceptan facturas de consumo menores al umbral como RFCE? ¿Cuál es el umbral vigente?
- ¿Habrá recepción de e-CF de proveedores (compras) en el mismo software?
- ¿La instalación local del cliente tendrá URL pública HTTPS para aprobación comercial?
- ¿Cómo se trata un e-NCF rechazado (reuso o ANECF) y cuál es el plazo de contingencia?
- ¿El proveedor firma con el certificado del cliente o con el propio (y si la DGII lo permite)?
- ¿Qué plazo oficial rige para las notas de crédito electrónicas?
