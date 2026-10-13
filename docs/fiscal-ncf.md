# Comprobantes fiscales: NCF físicos y e-NCF electrónicos (DGII)

> Convención de marcas (igual que `docs/contabilidad-rrhh.md`): **A VALIDAR** = norma, nombre, alcance o umbral de la DGII del que el equipo no tiene certeza; hay que
> confirmarlo con el contador / la DGII antes de usarlo en producción. Nada de esto sustituye la asesoría fiscal.

## 1. Qué hace y qué NO hace

**Hace**

- Lleva el **catálogo fijo** de tipos de comprobante (B01…B17 físicos, E31…E47 electrónicos) y las **autorizaciones de secuencia** que la DGII da al colegio
  (rango, vencimiento, número de autorización, umbral de alerta).
- Al cobrar (Cobros, Venta Rápida, Inscripción y anulación de recibo) **asigna el NCF / e-NCF** de la secuencia correcta, de forma **atómica** (sin repetir ni saltar números
  aunque haya cobros simultáneos) y **dentro de la misma transacción** del documento: si el cobro falla, el número se revierte.
- Permite elegir en el POS el comprobante (Crédito fiscal, Consumo, Gubernamental, Régimen especial) y guarda los datos fiscales del comprador (RNC/cédula, razón social).
- Configuración › Gestión fiscal: registrar/desactivar/reactivar/prorrogar autorizaciones, alertas de agotamiento y vencimiento (Dashboard) y la **modalidad por tipo**
  (física o electrónica).

**NO hace (alcance futuro, A VALIDAR con contador y proveedor de e-CF)**

- **Fase final (pendiente)**: la generación del XML firmado del e-CF, su envío a la DGII, la consulta de estado y la contingencia/rechazos se integrarán en la fase final (ver `docs/integracion-ecf.md`). Mientras tanto un recibo con e-NCF queda en
  `estadoDgii = PendienteEnvio` y la UI lo muestra como estado (recibo, tirilla, historial). `Aceptado | Rechazado | Contingencia` existen en el modelo pero ningún proceso los escribe todavía.
- No genera los formatos **606 / 607 / 608 / IT-1** (módulo de contabilidad futuro; ver §9).
- Las **notas de crédito / débito** se emiten como documentos desde la etapa 2/2 (ver §12).
- No valida el RNC contra el padrón de la DGII (solo largo 9/11); el certificado e-CF solo se registra como «cargado» (su uso para firmar se integrará en la fase final).

Qué falta para facturación electrónica real: certificado digital y su custodia, XML según el esquema vigente de la DGII, firma (XAdES), servicios web de recepción/aprobación
comercial/consulta de la DGII (ambientes de pre-certificación y certificación), acuse y reintentos, contingencia, representación impresa con QR y código de seguridad,
y conservación 10 años. **A VALIDAR** el calendario y obligatoriedad del colegio.

## 2. Modelo de datos

```
TipoComprobante (catálogo fijo, id = código B01…/E31…)
  codigo UNIQUE, nombre, uso, modalidad FISICA|ELECTRONICA, tipoNum, logico, requiereRnc, nota ('A VALIDAR…'), orden
        │ 1
        │ N
SecuenciaFiscal (una autorización de la DGII)                      FinRecibo
  id, tipoComprobanteId → TipoComprobante  (FK, NoAction)            tipoComprobanteId → TipoComprobante   (FK)
  modalidad, prefijo 'B'|'E', serie                                  secuenciaFiscalId → SecuenciaFiscal   (FK)
  desde, hasta, actual (= ÚLTIMO usado), vence (YYYY-MM-DD)          modalidad, ncf UNIQUE
  umbralPct, estado Activa|Agotada|Vencida|Inactiva                  clienteRnc, clienteNombre, regimenEspecial
  autorizacion, historica, creadaPor, createdAt                      estadoDgii NoAplica|PendienteEnvio|Aceptado|Rechazado|Contingencia
  UNIQUE (tipoComprobanteId, modalidad, historica, desde)          Tutor.comprobanteHabitual (tipo lógico, NULL = Consumo)
```

- Números como `Float` (enteros exactos hasta 2^53): un e-NCF llega a 10 dígitos, más que un `Int` de 32 bits.
- **Formato**: físico = `B` + tipo(2) + secuencial(8) = **11 caracteres** (`B0200001881`); electrónico = `E` + tipo(2) + secuencial(10) = **13** (`E310000000001`).
- **Sin solapes**: dos secuencias del mismo tipo+modalidad no pueden compartir números (lo valida la API en una transacción serializable; el UNIQUE sobre `desde` cubre la carrera
  del mismo inicio). Las filas `historica` quedan fuera de esa regla.
- `SisConfig 'ncf'` (JSON) y los contadores `FinCounter` `ncf/b01/nc` quedan **obsoletos**: solo los lee la migración. La clave se conserva (no se borra dato).
- Nuevos ajustes (SisConfig): `modalidadFiscal` (por tipo lógico), `finanzas.umbralConsumoIdentificado` (defecto RD$ 250,000; **A VALIDAR**), `ecf` / `ecfInfo` (se mantienen).
- Reconciliación con el diseño futuro de contabilidad (`docs/contabilidad-rrhh.md` §2.6): `TipoComprobante` ≈ `FiscNcfTipo` (código, nombre, usoVentas/usoCompras, exigeIdentificacion,
  esElectronico), `SecuenciaFiscal` ≈ `FiscNcfSecuencia` (`siguiente = actual + 1`; el umbral aquí es «% restante», allá «% usado»: convertir al migrar) y la tabla `FiscNcfAnulado`
  (608) sigue pendiente. Cuando exista el módulo se renombran/extienden estas tablas en lugar de duplicarlas.

## 3. Regla de consumo

`lib/fiscal.asignarNcf(tx, tipoLogico)`:

1. Tipo lógico → código según la modalidad configurada (`CONSUMO` → `B02` o `E32`, …).
2. Secuencias candidatas: del tipo+modalidad, estado `Activa`, no `historica`, con números libres y no vencidas; se usa la que **vence antes** (sin vencimiento al final, luego por `desde`).
3. Incremento atómico de **una sola sentencia** — SQL Server: `UPDATE … WITH (UPDLOCK, ROWLOCK) SET actual = actual + 1 … OUTPUT inserted.actual`; SQLite:
   `UPDATE … RETURNING`. Al llegar a `hasta` la propia sentencia la marca `Agotada`; la siguiente llamada usa la próxima secuencia.
4. Una secuencia cuyo `vence` pasó se marca `Vencida` (al consultar o cobrar) y no se usa.
5. Sin secuencia disponible → **409** `No hay secuencia NCF B01 disponible: registra una autorización en Configuración › Fiscal` (o «e-NCF E31»). **Nunca se emite sin NCF.**

Concurrencia: la fila de la secuencia es el punto de serialización y `asignarNcf` es el **primer paso** de la transacción (no se toma ningún otro bloqueo antes). En SQL Server un
deadlock residual se reintenta; en SQLite los handlers fiscales se encolan en memoria (`enSerie`) y la base usa `socket_timeout=60`. `nextSeq` (REC-xxxx, VTA-xxxx…) también es atómico ahora.

### Política de números consumidos y no emitidos (606/607/608)

- El número se consume **en la transacción del documento**: si el cobro falla o se revierte, el número también → **no hay huecos por errores**.
- Un recibo **anulado conserva su NCF** (queda `est = Anulado` con `nc` = la nota de crédito B04/E34 tomada de su secuencia). Para el **608** (anulados) hay que reportar el NCF
  original y la nota: esos datos están en `FinRecibo` (`ncf`, `nc`, `est`).
- Un hueco solo podría aparecer por una caída del servidor entre el commit del número y la respuesta (el recibo existe igualmente) o por edición manual de `actual`. Cualquier
  salto real se detecta comparando `actual` contra los NCF emitidos (`fk-auditar` lo verifica: «NCF fuera del rango de su secuencia»). **A VALIDAR** con el contador el tratamiento
  de saltos por fuerza mayor y la tabla `FiscNcfAnulado` del módulo contable.

## 4. Modalidad por tipo de comprobante

`SisConfig 'modalidadFiscal'` = `{ CREDITO_FISCAL, CONSUMO, GUBERNAMENTAL, REGIMEN_ESPECIAL, NOTA_DEBITO, NOTA_CREDITO } → FISICA | ELECTRONICA` (defecto: todo físico).

- Pares: `CREDITO_FISCAL` B01/E31 · `CONSUMO` B02/E32 · `REGIMEN_ESPECIAL` B14/E44 · `GUBERNAMENTAL` B15/E45 · `NOTA_DEBITO` B03/E33 · `NOTA_CREDITO` B04/E34.
- Pasar un tipo a **Electrónico** exige al menos una **secuencia electrónica activa** de ese tipo (409 si no) y registra auditoría. Si el interruptor global `ecf` (certificado cargado) está
  apagado es una **advertencia confirmable** (`confirmar: true`), no un bloqueo duro: los e-NCF quedan «Pendiente de envío» igual.
- Cambiar la modalidad, registrar, desactivar/reactivar, prorrogar el vencimiento y eliminar una secuencia exigen la **clave de supervisor** (también al Super Admin) y rol Super Admin.

## 5. Cobros

`POST /cobros/procesar` acepta `tipoComprobante` (`CREDITO_FISCAL | CONSUMO | GUBERNAMENTAL | REGIMEN_ESPECIAL`; defecto `CONSUMO`), `clienteRnc`, `clienteNombre`,
`regimenEspecial` (opcional) y `habitual` (guarda el tipo como habitual del tutor). El cliente nunca envía B01/E31: **el servidor resuelve el prefijo**.

| Tipo | Exige | Notas |
|---|---|---|
| Crédito fiscal (B01/E31) | RNC (9) o cédula (11) y razón social | 400 en español si falta o es inválido |
| Gubernamental (B15/E45) | ídem | la UI avisa si el RNC no parece de entidad pública (empieza por 4; **A VALIDAR**), sin bloquear |
| Régimen especial (B14/E44) | ídem + nº/certificación del régimen (opcional; **A VALIDAR**) | se guarda en `regimenEspecial` |
| Consumo (B02/E32) | nada, salvo total ≥ `umbralConsumoIdentificado` → cédula/RNC y nombre | umbral **A VALIDAR** |

Otros endpoints: `GET /cobros/comprobantes` (por tipo lógico: código que se usará, modalidad y disponibilidad), `GET /cobros/cuenta` (+ `comprobanteHabitual`, `datosFiscales` del tutor),
`reciboDto` (`tipoComprobante {codigo, nombre, modalidad}`, `clienteRnc`, `clienteNombre`, `regimenEspecial`, `estadoDgii`). Venta Rápida usa el mismo servicio (B01/E31 si «Crédito fiscal», si no
B02/E32); la factura de Inscripción usa Consumo. La anulación toma la nota de crédito de B04/E34.

## 6. API de configuración

| Método y ruta | Descripción |
|---|---|
| `GET /config` | `ncf: CfgNcf[]` (misma forma anterior `pref,tipo,desde,hasta,umbral,act` + `id, modalidad, actual, vence, estado, autorizacion, disponibles…`), `modalidadFiscal`, `tiposComprobante` |
| `GET /config/fiscal` | secuencias, tipos, modalidades, `ecf` |
| `POST /config/fiscal/secuencias` | alta (Super Admin + PIN). 400: rango, longitud (8/10 dígitos), solape, tipo vs modalidad, vencimiento pasado |
| `PUT /config/fiscal/secuencias/:id` | umbral (sin PIN); estado Activa/Inactiva, vencimiento (PIN) |
| `DELETE /config/fiscal/secuencias/:id` | solo si nunca emitió; si no, 409 amistoso |
| `PUT /config/fiscal/modalidad` | `{ tipo, modalidad, confirmar?, pin }` |
| `POST /config/ncf`, `PUT /config/ncf/:i` | compatibilidad con la pantalla anterior |

## 7. Migración de una base existente (aditiva)

`scripts/fk-fiscal.ts`, invocado por `fk-reparar --fiscal` (y por `--auto` en el arranque del contenedor). Patrón expandir → rellenar → contraer, idempotente, sin borrar ni modificar importes:

1. **Expandir**: crea `TipoComprobante`/`SecuenciaFiscal` y las columnas nuevas de `FinRecibo` (`NOT NULL DEFAULT` B02 / historica B02 / FISICA / NoAplica; el resto `NULL`) y `Tutor.comprobanteHabitual`.
2. **Rellenar**: catálogo de 21 tipos; una `SecuenciaFiscal` por cada rango de `SisConfig 'ncf'` (`actual` = contador − 1, porque el contador guardaba el *próximo* número; sin vencimiento ni
   autorización → «completar en Configuración › Fiscal»); cada recibo se clasifica por el **prefijo real de su NCF**: si el número cae entre el inicio contado (`act`) y `actual` de una secuencia
   migrada va a ella; el resto va a la secuencia **«Histórica migrada»** del prefijo (`historica = 1`, estado Inactiva, nunca se consume) con el rango observado min–max. No se inventa nada.
   Lo ambiguo (prefijo desconocido, rangos solapados, formato ilegible) es **BLOQUEANTE** (`--auto` sale con código 3 y no ejecuta el push).
3. **Contraer**: `prisma db push` (solo agrega FK e índices; los UNIQUE nuevos se crean antes con su nombre exacto para que Prisma no pida `--accept-data-loss`).

```
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --fiscal            # informe
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --fiscal --aplicar  # expandir + rellenar (haz respaldo antes)
pnpm --filter @stodia/api db:push                                            # contraer (sin --accept-data-loss)
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --fiscal --aplicar  # 2ª pasada: nada que hacer
pnpm --filter @stodia/api db:fk:auditar                                      # 0 huérfanos
```

Cambio visible de cifras: el cálculo antiguo de «restantes» era `hasta − contador` (el contador era el *próximo* número y quedaba 1 corto); ahora es `hasta − último usado`, correcto.
En la instancia de desarrollo B02 pasó de 6 a **7** restantes, B01 de 286 a 287 y B04 de 87 a 88. La demo conserva «B02 por agotar: 19 de 1900» porque su seed fija `actual = 1881`.

## 8. Pruebas realizadas

Ver el informe de la entrega: 59 comprobaciones automáticas (`apps/api` contra SQL Server temporal y SQLite temporal) — 50 cobros concurrentes del mismo tipo (NCF consecutivos, sin repetir ni saltar,
cruzando el cambio de secuencia 1900 → 1901), agotamiento, vencimiento, solapes, los 4 tipos × 2 modalidades con longitudes 11/13, validaciones de comprador, permisos (Cajero 403, Super Admin con PIN),
ciclo cerrado en solo lectura, alertas del Dashboard (incluida una electrónica próxima a vencer) y migración de 4,745 recibos con NCF únicos (copia restaurada del respaldo, dos corridas idempotentes).

## 9. A VALIDAR con contador / DGII

- Nombres exactos y alcance de cada tipo (en especial B12 «Registro Único de Ingresos» —vigencia—, B13, B14 y B15 frente a E44/E45; ver `TipoComprobante.nota`).
- Umbral de **RD$ 250,000** para identificar al comprador en consumo; si E32 menor al umbral debe enviarse como resumen (RFCE).
- Heurística «RNC gubernamental empieza por 4» y datos requeridos del régimen especial (número/certificación).
- Vigencia típica de una autorización (el seed de demo usa ~14 meses) y el tratamiento de secuencias vencidas con números sin usar.
- Si el ITBIS aplica a colegiaturas (ver D12 de `docs/contabilidad-rrhh.md`): hoy el recibo no desglosa ITBIS.
- Reporte de números anulados/saltados (608) y conservación de la representación impresa.
- Calendario y obligatoriedad de la facturación electrónica para el colegio; ambientes de pre-certificación/certificación; proveedor de firma.

## 10. Estado y avance

- Etapa 1/2 (esta): modelo, secuencias, modalidad, Cobros/Kiosko/Inscripción/anulación, Configuración, Dashboard, migración, pruebas. **Hecha.**
- Etapa 2/2 (**hecha**): notas de crédito (B04/E34) y de débito (B03/E33) con comprobante modificado, reembolsos, reapertura de cargos, inventario, cuadre y Dashboard netos, migración de anulaciones históricas (§12).
- Futuro: XML/firma/transmisión e-CF, formatos 606/607/608, `FiscNcfAnulado`.

## 11. Datos fiscales del comprador y verificación DGII futura

**UI del POS (compacta).** El comprobante por defecto es Consumo (E32 si la modalidad es electrónica, B02 si es física) y el panel muestra solo la línea «Comprobante: Consumo · E32» con «Cambiar» (4 segmentos; las opciones sin secuencia llevan su motivo en el tooltip y un aviso breve con enlace a Configuración › Fiscal). El aviso de e-NCF pendiente de la DGII es un icono con tooltip; el detalle sigue en el recibo y la tirilla.

**Datos del comprador sin inputs si ya se tienen.** `GET /cobros/cuenta` devuelve `fiscal: { tieneIdentificacion, identificacion, nombre, esRnc, razonSocialPropia }`. Crédito fiscal y Consumo ≥ umbral muestran solo la casilla «Hacerlo a nombre de la cédula registrada» (marcada); al desmarcarla, o si la cuenta no tiene cédula/RNC, aparece el input de RNC/cédula (máscara, 9 u 11 dígitos). Gubernamental y Régimen especial siempre piden el RNC (sin casilla). La razón social NO se escribe: se resuelve por el RNC con `GET /cobros/rnc/:rnc` (roles Super Admin y Cajero) → `{ rnc, valido, encontrado, razonSocial?, fuente?: 'tutor'|'historial'|'dgii', estado? }`; si no se encuentra (200, `encontrado:false`) se pide a mano con la nota «Sin verificar». En `POST /cobros/procesar` el servidor vuelve a resolverla y **ignora el nombre del cliente cuando el RNC existe**; si no existe exige 3+ caracteres (B01/B15/B14). `Tutor` no guarda razón social propia: `razonSocialPropia` es siempre false por ahora.

**Proveedores (`apps/api/src/lib/rnc-lookup.ts`, interfaz `ProveedorRnc`).** Orden: `tutor` (Tutor.cedula/rnc), `historial` (FinRecibo.clienteRnc → último clienteNombre) y `dgii`. Los dos locales están siempre activos; `dgii` está implementado pero **DESACTIVADO** hasta configurarlo.

**Cómo activar la verificación DGII.** Requiere las tres cosas: (1) variables del servidor `STODIA_RNC_API_URL` (base, sin barra final) y `STODIA_RNC_API_KEY` (clave del proveedor; nunca se registra en logs ni se devuelve); (2) activarla con la fila SisConfig `rncVerificacion` = `{"activa":true}` (o la variable `STODIA_RNC_ACTIVA=1`); (3) reiniciar la API. Contrato: `GET {base}/api/v1/rnc/{rnc}` con cabecera `x-api-key`; 200 `{status:'success', data:{rnc, razon_social, nombre_comercial, estatus, regimen, updated_at}}` (el estado ACTIVO puede venir en `regimen` o `estatus`); 404 = no encontrado; 401/403/429/5xx/timeout (6 s) = indisponible → se cae a lo local sin bloquear el cobro. En desarrollo las tres variables están en `apps/api/.env` (gitignorado); sin ellas el proveedor queda desactivado. Tras activarla, la UI mostrará «verificado en la DGII ✓» (fuente `dgii`). Pendiente: reordenar para que la DGII tenga prioridad sobre el historial si se desea.

## 12. Notas de crédito y de débito (etapa 2/2 — HECHA)

Apartado **«Notas de Crédito / Débito»** en Cobros (botón junto a «Historial de Recibos»): listado de notas emitidas y asistente de 3 pasos. Acciones secundarias «Emitir nota de crédito / débito» en el modal de un recibo abierto desde el Historial de Recibos o el Historial de Turno (solo fuera de ciclos cerrados).

### 12.1 Modelo (aditivo, FK reales; ver `docs/db-relaciones.md`)

```
MotivoNota (catálogo tipado)            NotaFiscal  id NC-0001 / ND-0001, clase CREDITO|DEBITO
  codigo 01..05 (DGII) y OP01..OP08       tipoComprobanteId → TipoComprobante (B04/E34 o B03/E33)   secuenciaFiscalId → SecuenciaFiscal
  codigoDgii, aplica, origen, estado      ncf UNIQUE, modalidad, estadoDgii (electrónica = PendienteEnvio)
        │ 1                                reciboId → FinRecibo  ó  ventaId → FinVenta  (CHECK: exactamente uno)   ncfModificado (copia)
        │ N                                tutorId → Tutor, cicloId → Ciclo, motivoId → MotivoNota, motivoTexto, monto, fueraDePlazo
        ▼                                  cajeroId → User, cajaId → Caja, hora, createdAt, estado 'Emitida', idempotencyKey UNIQUE
NotaFiscalLinea (CASCADE)                NotaFiscalReembolso (CASCADE): notaId, metodoPagoId → MetodoPago, monto, referencia
  reciboItemId → FinReciboItem · cobroItemId → FinCobroItem · ventaItemId → FinVentaItem · productoId → FinProducto
  cantidad, concepto, monto, efecto ReabreCargo|Devolucion|Ajuste|NuevoCargo
FinCobroItem.notaDebitoId → NotaFiscal (nullable): cargos creados por una nota de débito
```

- **Documento afectado**: un **recibo** o una **venta rápida del kiosko** (`ventaId`; el modelo pedido tenía líneas de venta y productos, y los productos de inventario solo se mueven en el kiosko: los servicios de producto cobrados en Cobros no descuentan stock, por eso no se «reponen»). Las notas de **débito** solo sobre recibos (el cargo nuevo necesita alumno y tutor).
- **Modalidad**: la del NCF modificado (una nota sobre un e-NCF es **E34/E33**, sobre un NCF **B04/B03**), no la configurada para el tipo. `estadoDgii = PendienteEnvio` en electrónicas (envío a la DGII en la fase final).
- **Numeración**: `asignarNcf` es el primer paso de la transacción de la nota (misma garantía que los cobros). Sin secuencia B03/B04/E33/E34 → **409** `SIN_SECUENCIA` con `enlace: /config?tab=fiscal`. La demo siembra B03 1–300 como las otras.
- **Anulación**: `POST /cobros/recibos/:id/anular` (misma ruta, PIN y respuesta) delega en el servicio: nota de crédito TOTAL motivo 01, cargos reabiertos y dinero devuelto por los mismos medios del cobro. `FinRecibo.est = 'Anulado'` y `nc` se fijan cuando lo acreditado alcanza el monto del recibo (con cualquier motivo); `FinRecibo.nc` conserva el NCF de la nota por compatibilidad.

### 12.2 Reglas de negocio (configurables en `SisConfig 'finanzas'`: `notaPlazoDias` = 30, `notaCicloAnterior` = 0; Configuración › Finanzas)

| Regla | Detalle |
|---|---|
| Qué se puede acreditar | Recibos no anulados del ciclo activo (ciclo cerrado → 409; ciclo anterior no cerrado solo con `notaCicloAnterior = 1`). Acumulado de notas de crédito ≤ monto del recibo (`acreditado`, `disponible`, `neto`); por línea ≤ lo restante. Exceder → 400 (409 si ya había notas o cambió en la transacción). |
| Plazo | Pasados `notaPlazoDias` días desde la emisión se exige **motivo escrito** (≥ 10 caracteres) y la nota queda marcada `fueraDePlazo`. **A VALIDAR** el plazo con el contador. |
| PIN | **Siempre** (también el Super Admin): token de un solo uso de `/auth/supervisor` (o la clave). Sin PIN o PIN malo → 403 (5 fallos → 429). La anulación conserva su regla anterior (el Super Admin no necesita clave). El token se quema al validarlo: se valida lo último, tras las demás validaciones. |
| Roles | Super Admin y Cajero; el resto 403. |
| Idempotencia | `idempotencyKey` UNIQUE: reenviar la misma = la misma nota (200, no 201), también con doble clic concurrente. |
| Motivo 01 | Solo si se acredita TODO el recibo y no hay notas previas (si ya había notas, la anulación usa 03). |
| Efectos del crédito (UNA transacción) | Línea `ReabreCargo`: el cargo pagado vuelve a pendiente por el valor de la línea (CxC sube exactamente ese monto, conserva su `cicloId`); si el cargo ya estaba abierto por un abono se suma. Línea `Ajuste` (parcial, o «no volver a cobrar»): el cargo **sigue pagado** y el crédito queda en `NotaFiscalLinea` (el modelo de pago de cargos no guarda el monto original del cargo pagado, por eso el tope es el monto de la línea del recibo). `Devolucion` (venta): repone stock con `FinMovimiento` tipo **Devolución** (+N) y la venta como referencia. |
| Descuentos | Si el recibo tuvo descuento (pronto pago / exoneración) cada línea vale su parte proporcional de lo realmente cobrado; reabrir devuelve a la deuda el valor bruto del cargo. |
| Reembolso | Por medio de pago (referencia obligatoria si el medio la pide). **El total reembolsado debe ser IGUAL al monto de la nota** (no se implementó «saldo a favor»): lo que se acredita se devuelve, y si un cargo vuelve a la deuda el padre lo paga de nuevo con un recibo nuevo. Más estricto que «cubrir lo que no se reabre»: **A VALIDAR** si el colegio quiere saldo a favor. |
| Nota de débito | Sobre un recibo emitido (no anulado), con motivo (intereses por mora, recargo, ajuste, gastos adicionales) y monto > 0 por concepto (no puede reducir deuda): crea 1–10 cargos `tipo = 'nd'` en el ciclo activo (no les aplican pronto pago ni exoneración, así no se «borra» una ND ya numerada). Se cobran normalmente y el recibo de ese cobro referencia la nota (`notasDebitoCobradas`). Suman a CxC y, si vencen antes de hoy, a la morosidad. |
| Cuadre del turno | `GET /cobros/turno`: **bruto** (recibos del turno, también los anulados después: el dinero entró en ese turno) − **devoluciones** (reembolsos de las notas emitidas por ese cajero en la franja) = **neto**, por medio de pago; sección «Devoluciones / Notas» en pantalla y en el cuadre impreso. |
| Dashboard | Recaudo del mes **neto**: recibos por su fecha, cada nota resta en **la fecha de la nota** por el medio del reembolso. |
| Ciclo cerrado | Emisión 409; consulta, reimprimir y enviar por correo siguen permitidos (`ESCRITURA_LIBRE`). Becas y contratos no cambian. |
| Auditoría | `lib/audit`: `Notas` (Insert), `Cobros` (cargos reabiertos), reimpresión y envío. |

### 12.3 API (`/cobros`, roles POS)

`GET /notas` (q, tipo, desde, hasta, mios, page, size; ciclo por `X-Ciclo`; total y `suma {credito, debito, neto}`), `GET /notas/:id` (DTO completo, el mismo de la emisión: `notaDto`), `GET /notas/motivos`, `GET /notas/documentos?q=` (buscador del asistente: REC-, VTA-, NCF, nombre o cédula), `GET /recibos/:id/notas-disponible` y `/ventas/:id/notas-disponible`, `POST /notas/credito`, `POST /notas/debito`, `POST /notas/:id/enviar`, `POST /notas/:id/reimprimir`. Tipos en `packages/shared/src/notas.ts`.

### 12.4 Migración y reporte de anulaciones históricas (`fk-reparar --notas`)

Aditiva e idempotente (en `--auto`: código de salida **11**, el contenedor hace `db push` **sin** `--accept-data-loss`). Crea las tablas y la columna, siembra los 13 motivos y **migra cada recibo anulado** (`est = 'Anulado'` + `nc`) a una `NotaFiscal` con SU NCF B04/E34 ya consumido (no se vuelve a numerar; secuencia por rango, o la «Histórica migrada» B04), motivo 01, líneas con efecto `Ajuste` (el sistema anterior no reabría cargos), reembolso = los pagos del recibo (el sistema anterior lo excluía del recaudo), fecha y cajero tomados de la auditoría si existen. Lo ambiguo (NCF ilegible/repetido) es **BLOQUEANTE** (exit 3).

**DEFECTO CONOCIDO del sistema anterior**: anular emitía la B04 pero no reabría los cargos ni repuso inventario. `--notas` **reporta** cuántos recibos anulados tienen cargos aún pagados y cuánto dinero es (cargos que otro recibo activo también cubre se listan aparte, «revisar a mano»). Los cargos **no se reabren** sin la bandera explícita `--reabrir-cargos` (con `--aplicar`; nunca en `--auto`), que muestra la CxC antes y después y cambia el efecto de las líneas a `ReabreCargo`.

```
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --notas                               # informe (incluye el reporte del defecto)
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --notas --aplicar                     # expandir + rellenar (respaldo antes)
pnpm --filter @stodia/api db:push                                                              # contraer (sin --accept-data-loss)
pnpm --filter @stodia/api exec tsx scripts/fk-reparar.ts --notas --aplicar --reabrir-cargos    # SOLO con confirmación explícita
pnpm --filter @stodia/api exec tsx scripts/probar-notas.ts                                     # pruebas de integración (solo bases *test* / *temp*)
```

### 12.4b Estado de cuenta (Expediente › Estado de cuenta)

- NC con «volver a cobrar» (efecto `ReabreCargo`): el cargo vuelve a `paid=false` (estado derivado Vencida / Por vencer / Pendiente según su vencimiento ORIGINAL) y el estado de cuenta lo muestra como **Pendiente de cobro** con la leyenda «Recibo REC-xxxx · acreditado por NC-xxxx (NCF) · pendiente de cobro». Entra en el saldo vencido/pendiente y en `/cobros/cuenta`.
- NC sin reabrir (`Ajuste`/`Devolucion`): el cargo sigue pagado y se muestra **Acreditado** («devolución definitiva, no se vuelve a cobrar»); NO entra en la deuda.
- ND: el cargo nuevo muestra la nota que lo originó. El Expediente añade el bloque «Notas de crédito y débito» (`ExpedienteResp.notas`, `cuenta[].nc`; lógica en `lib/notas-cuenta.ts`, solo lectura). Prueba: `scripts/probar-nc-estado-cuenta.ts`.
- Mora: no se exonera ni se recalcula. Un cargo reabierto conserva su vencimiento original; si ese vencimiento + gracia ya pasó, la pasada de mora (`lib/mora.ts`, una sola vez por cuota, id `mora-<cuota>`) puede generarle recargo aunque el tutor lo hubiera pagado a tiempo. A VALIDAR con la institución si una reapertura por error de la institución debe exonerar esa mora (hoy se hace con Exoneración de mora + PIN).

### 12.5 A VALIDAR con el contador / la DGII (notas)

- Redacción y alcance de los códigos de modificación 01–05 por tipo de nota (en especial 04 y 05) y el código que reportan los motivos operativos (hoy 03).
- Plazo de 30 días para emitir una nota de crédito y si el plazo cuenta desde la emisión o el pago.
- Si una nota puede dejar «saldo a favor» (hoy: se devuelve el 100 %) y el tratamiento fiscal de reabrir un cargo ya acreditado.
- Representación de notas sobre ventas de consumo menores al umbral (RFCE) y si una nota de débito sobre un comprobante anulado es admisible.
- Reporte 608 con las notas y los comprobantes anulados (ahora: `NotaFiscal` + `FinRecibo.nc`).
- Que las anulaciones históricas migradas se traten como devoluciones por el mismo medio del cobro.


**Verificación del RNC del perfil institucional.** Configuración › Perfil institucional muestra «RNC no verificado» hasta que se verifica. Usa las mismas variables (`STODIA_RNC_API_URL`, `STODIA_RNC_API_KEY`, `STODIA_RNC_ACTIVA=1`) a través de `POST /config/perfil/verificar-rnc` (pantalla `config`; cuerpo opcional `{ rnc }` para consultar un RNC aún no guardado, en cuyo caso no se modifica el perfil). Resultados: ACTIVO → `rncVerificado=true`, `rncVerificadoAt`, `razonSocial`, `nombreComercial`, `rncEstado`; existe pero no ACTIVO → `rncVerificado=false` con `rncEstado`; 404 → «El RNC no existe en el registro de la DGII» (`rncVerificado=false`); sin configurar → 503; 401/403/429/5xx/timeout → 502 «No se pudo consultar la API de RNC ahora; reintenta» sin cambiar lo guardado. La UI ofrece el botón «Verificar con la DGII» y, si la razón social de la DGII difiere, la sugerencia «Usar este nombre». Al guardar el perfil con el RNC cambiado se intenta la verificación automática (best-effort). Si la API devuelve 401/403 hay que rotar/actualizar la clave.
