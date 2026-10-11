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

- **No genera el XML firmado** del e-CF, **no lo transmite a la DGII**, no consulta su estado ni gestiona contingencia/rechazos. Un recibo con e-NCF queda en
  `estadoDgii = PendienteEnvio` y la UI lo dice (recibo, tirilla, historial). `Aceptado | Rechazado | Contingencia` existen en el modelo pero ningún proceso los escribe todavía.
- No genera los formatos **606 / 607 / 608 / IT-1** (módulo de contabilidad futuro; ver §9).
- No emite **notas de crédito / débito** como documentos (etapa 2/2): hoy solo existe el tipo, su secuencia y el número que se consume al anular un recibo.
- No valida el RNC contra el padrón de la DGII (solo largo 9/11); el certificado e-CF solo se registra como «cargado» (no se usa para firmar).

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
- Etapa 2/2 (pendiente): emisión de **notas de crédito (B04/E34) y de débito (B03/E33)** como documentos con comprobante modificado; el modelo ya trae tipos, secuencias y modalidad.
- Futuro: XML/firma/transmisión e-CF, formatos 606/607/608, `FiscNcfAnulado`.
