# Recargos por mora automaticos

Codigo: `apps/api/src/lib/mora.ts` (`generarMoras`, `generarMorasSeguro`, `programarMoras`, `calcularMora`). Sin cambios de esquema.

## Reglas
- Cuota elegible: `FinCobroItem` sin pagar del ciclo ACTIVO, `tipo` `col` o `srv` (servicio recurrente `kind='rec'`; comedor con plan «Sin mora» no genera), con `hoy > vence + gracia` (gracia del plan, zona horaria de `lib/cxc`).
- Configuracion: plan del contrato del alumno en el ciclo: `moraTipo` `pct` (`moraVal` %, si es 0 usa `finanzas.recargoMoraPct`), `fijo` (RD$ `moraVal`), `none` (no genera). Sin contrato o importe 0: no genera.
- Una vez por cuota, sin interes compuesto ni repeticion. Base = `monto` actual de la cuota (saldo si hubo abonos). Porcentaje a 2 decimales.
- No genera sobre cargos `mora`, ciclos cerrados/anteriores, ni cuotas ya pagadas. Si la cuota se paga despues, la mora queda pendiente (exoneracion con PIN de supervisor en el flujo existente).
- **Reinscripción (Etapa B)**: el cargo `reins` (cuota de reinscripción, ciclo destino Planificado o Activo) también genera su mora, una sola vez, al pasar `vence` + `diasGracia` de la política de reinscripción; plan del contrato del ciclo activo (sin plan o «sin mora»: `finanzas.recargoMoraPct`). No se genera si `perdidaCupoPorFaltaDePago` está activa. Ver docs/cierre-y-promocion.md §6.
- Mora creada: `tipo='mora'`, `est='Vencida'`, `vence` = vencimiento de la cuota + gracia, mismo alumno/tutor/ciclo, `orden` de la cuota, concepto `Recargo por mora · Sep. (3%)` o `(RD$ 25.00)`; para servicios se agrega ` · <servicio>`.

## Idempotencia
- Id determinista `mora-<idCuota>` (PK de `FinCobroItem`, hash si superara 100 caracteres): dos procesos concurrentes no pueden duplicar (el segundo recibe P2002 y lo ignora). No requiere columna nueva.
- Moras sembradas (ids sin prefijo `mora-`): una mora de colegiatura del mismo alumno + mes (concepto `Recargo por mora · Xxx.`) + ciclo cuenta como existente.

## Cuando corre
1. `GET /cobros/cuenta` (ciclo activo): solo el tutor consultado.
2. `POST /cobros/procesar`: antes de seleccionar, para los alumnos de las lineas elegidas (las moras nuevas no estaban en `ids`).
3. Pasada global cada 6 h + 20 s tras arrancar, NO bloqueante, activa por defecto (se apaga con `MORA_PASADA_GLOBAL=0`). Auditoria en SisAudit (usuario `sistema`, tabla Cobros, id `mora-auto`) con el resumen de cada pasada.

## Simulacion
`npx tsx scripts/simular-mora.ts` (no escribe): cuenta y monto de la pasada global.

## Cargos reabiertos por nota de credito
Un cargo reabierto («volver a cobrar») vuelve a ser elegible con su vencimiento ORIGINAL (no se reinicia el plazo). Si vence + gracia ya paso, se genera la mora una sola vez (id `mora-<cuota>`; si ya existia de antes, no se duplica). No hay exencion automatica: se exonera con el flujo de Exoneracion de mora. Ver docs/fiscal-ncf.md §12.4b.
