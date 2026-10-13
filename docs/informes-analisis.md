# Análisis de factibilidad — Sección «Informes» (12 informes por ciclo, 5 entradas de menú)

> Documento de ANÁLISIS (solo lectura). No se modificó código, esquema ni datos. Fecha del análisis: 2026-10-12.
> Fuentes: `apps/api/prisma/schema.prisma`, `apps/api/src/lib/*`, `apps/api/src/modules/*`, `apps/web/src/lib/access.ts`, `apps/web/src/components/finanzas/{xlsx.ts,pdfEngine.tsx}`, `docs/*.md` y consultas SELECT agregadas a la BD `stodia` (solo conteos; ningún dato personal).
> Convención: `Modelo.campo` = columna Prisma; «no existe» = verificado por búsqueda en el esquema y en `src/`. Todo lo relativo a formatos oficiales de la DGII (606/607) está marcado **A VALIDAR**: no se contrastó con la fuente oficial en este análisis.

---

## 0. Resumen ejecutivo

| # | Informe | ¿Se puede HOY? | Cambio de BD | Esfuerzo |
|---|---|---|---|---|
| 1 | Cuentas por cobrar (por estudiante, matrícula, tutor) | **Sí** (ciclo activo y cerrados, con la salvedad de «saldo a fecha de cierre») | Ninguno (solo consulta API). Opcional: índice | **S** |
| 2 | Movimientos del alumnado (promovidos/reprobados/retirados/egresados/inactivos, origen→destino, promedio) | **Parcial**: origen→destino sí (Matricula N vs N+1); promedio solo 2025-26; sin motivo de retiro ni historial de «inactivo» | Mínimo: `Matricula.motivoRetiro`; recomendado: snapshot `MatriculaResultado` + `AlumnoEstadoHistorial` | **M** |
| 3 | Histórico consolidado de calificaciones por sección | **Sí en cálculo** (AcadNota + Matricula + rúbrica), pero solo hay notas reales de 2025-26; la rúbrica no está versionada | Recomendado: snapshot de finales al cierre (`CierreNota`); índice | **M** |
| 4 | Emisión total de facturas por concepto | **Parcial**: no hay catálogo de concepto; 3 fuentes de NCF (recibos, ventas kiosko, inscripciones) | Recomendado: `categoria` en cargo/línea (o clasificación en código) | **M** |
| 5 | Recaudación por método de pago / recibo | **Sí** (recibos + FinReciboPago); faltan ventas kiosko por ciclo e inscripción sin medio de pago | Opcional: `FinVenta.cicloId` | **S** |
| 6 | Cobrado neto tras devoluciones (NC) | **Sí** (FinReciboPago − NotaFiscalReembolso por método) | Ninguno | **S** |
| 7 | Notas de crédito/débito con motivos y montos | **Sí** (NotaFiscal + MotivoNota + líneas) | Ninguno | **S** |
| 8 | Consolidado 606 (compras) y 607 (ventas) | **607 parcial; 606 NO** (no existe ningún registro de compras/gastos/proveedores) | **Grande**: módulo de compras + campos fiscales en ventas (ITBIS, retenciones, RNC en kiosko) | **L** |
| 9 | Extracurriculares: ingresos por disciplina | **Parcial** (cargos `srv` ↔ ServicioAlumno.extraId), datos reales muy escasos | Recomendado: `ServicioAlumno.cicloId`, fechas de alta/baja | **S/M** |
| 10 | Extracurriculares: retención y proyección | **No de forma fiable**: no hay histórico de inscripción por ciclo ni tabla de inscripciones | `ServicioAlumno.cicloId/fechaAlta/fechaBaja` (mismo cambio que 9) | **M/L** |
| 11 | Planes de pago: facturado vs cobrado por plan | **Sí** vía Contrato(alumno,ciclo).planId (cargo no guarda plan) | Ninguno (opcional `FinCobroItem.planId` congelado) | **M** |
| 12 | Inventario y tienda: rotación + recaudado en uniformes/libros/útiles | **Parcial**: categorías existen; movimientos con `q` en texto, solo productos con stock; recaudado = ventas kiosko + cargos de servicio | Recomendado: `FinMovimiento.cantidad` numérica + índices; `FinVenta.cicloId` | **M** |

Veredicto global: 6 de 12 (1, 5, 6, 7, + 11 y 3 en cálculo) salen con las tablas actuales; 2, 4, 9, 12 salen con mejoras menores; **10 y 8 son los que exigen modelo nuevo** (10: histórico de inscripción extracurricular; 8: módulo de compras y datos fiscales de ventas).

Hallazgo transversal importante: hoy hay **tres fuentes de comprobantes con NCF** que no se unifican en ninguna tabla: `FinRecibo` (cobros de cartera), `FinVenta` (venta rápida kiosko, sin ciclo, sin RNC del comprador, sin ITBIS guardado) y `PersInscripcion` (NCF + `factura` de inscripción, **sin FinRecibo asociado: 24 de 24 inscripciones**, sin método de pago). Cualquier informe fiscal/recaudación debe unir las tres o declarar explícitamente cuál cubre.

---

## 1. Realidad de los datos (volumen e integridad, consulta a BD `stodia`)

### 1.1 Volumen medido (coincide con lo indicado)
FinCobroItem 15 697 · FinRecibo 4 753 · FinReciboItem 7 666 · AcadNota 27 296 · Matricula 2 526 (445 + 571 + 690 + 819 + 1) · NotaFiscal 3 · FinVenta 3 (7 líneas) · FinMovimiento 20 · ServicioAlumno 308 (288 alimentación, 8 producto, 7 extracurricular, 5 ruta) · AcadExtra 17 · SisAudit ~700.

### 1.2 Datos por ciclo

| Ciclo | Estado | Cargos | Recibos | Matrículas | Contratos | Notas AcadNota |
|---|---|---|---|---|---|---|
| 2023–2024 | Cerrado | 0 | 0 | 445 (todas `Promovido`) | 0 | 44 (1 alumno) |
| 2024–2025 | Cerrado | 0 | 0 | 571 (todas `Promovido`) | 0 | 44 (1 alumno) |
| 2025–2026 | Cerrado | 6 408 (6 395 pagados) | 4 284 | 690 (667 `Promovido`, 23 `Repitente`) | 690 | 27 196 (661 alumnos, 18 materias) |
| 2026–2027 | Cerrado (con `CierreCiclo`) | 9 278 (1 637 pagados) | 467 | 819 (804 `Activo`, 15 `Retirado`) | 805 | 12 (5 alumnos) |
| 2027–2028 | **Activo** | 11 | 2 | 1 | 1 | 0 |
| 2028–2029 | Planificado | 0 | 0 | 0 | 0 | 0 |

Consecuencias: los ciclos 2023–25 **no tienen datos financieros ni notas utilizables** (solo matrículas); los informes financieros reales solo se pueden validar sobre 2025–26 y 2026–27; 2026–27 se cerró con la lógica nueva (matrículas `Activo`) y **la promoción nunca se aplicó** (`PromocionCiclo` = 0 filas, `PromocionDetalle` = 0 filas). El ciclo activo 2027–2028 ya está «adelantado» respecto a la fecha del sistema (2026-10-12): es dato de prueba.

### 1.3 Dónde falla hoy la integridad para reportar (seed/migración vs real)
1. **926 cargos `paid = true` sin línea de recibo** (`FinReciboItem.cobroItemId`) y **510 de 7 666 líneas de recibo sin cargo** (`cobroItemId NULL`; 347 en 2025–26, 163 en 2026–27). Origen: importación histórica. Efecto: un informe «por cargo» y uno «por recibo» no cuadran entre sí; hay que reportar siempre desde la línea de recibo (lo cobrado) y desde el cargo (lo facturado/pendiente) por separado y mostrar la diferencia.
2. **219 recibos con `metodoPagoId NULL`** (pago mixto o histórico) → el método siempre debe salir de `FinReciboPago` (los 4 753 recibos tienen pagos y Σ pagos = Σ monto en todos; Σ líneas = monto en todos).
3. **`FinCobroItem` no tiene fecha de emisión ni de pago**: solo `vence` (texto dd/mm/aaaa, 100 % válido) y `paid`. La fecha de cobro sale de `FinRecibo.createdAt` vía la línea; si no hay línea, no hay fecha.
4. **`FinCobroItem.tipo`** (col 12 204, com 2 266, mat 693, mora 406, srv 127, tra 1) es grueso: la reinscripción 2025–26 (690 cargos) está como `tipo='mat'` y solo se distingue por el texto de `con` («Reinscripción …»); `TIPO_CARGO_REINS='reins'` (lib/reinscripcion.ts:27) existe en código pero hay 0 filas con ese tipo (flujo nuevo no usado todavía). 2 cargos `srv` y 692 `mat` no tienen servicio.
5. **`FinMovimiento`**: `q` es **texto** con signo Unicode («−2», «+12»); `t` es solo hora «HH:mm»; la fecha real es `createdAt`; 11 de 15 salidas sin `ventaId`; referencias `CGO-xxxx` (3 salidas + 1 devolución) sin código vigente que las genere (residuo de una versión anterior). Todo el historial es de 2026-10-10 a 2026-10-12 (20 filas): **no hay histórico real de rotación**.
6. **Productos sin stock** (`stock NULL`: Servicios 10, Actividades 4, «Paquete de libros» y «Uniformes (2 juegos)») no generan `FinMovimiento` ni en kiosko (lib/kiosko index.ts:81) ni en expediente (expediente/index.ts:264): no tienen rotación medible.
7. **No existe `Alumno.estado` histórico**: `Alumno.estado` es el estado actual (Activo 796, Inactivo 9, Retirado 15); no hay estado 'Egresado' todavía (0). El único rastro de cambios es `SisAudit` (texto libre).
8. **`PersInscripcion.planId` ≠ `Contrato.planId`** en 1 caso; 5 cargos sin contrato del ciclo; 1 030 matrículas sin contrato (casi todas 2023–25).
9. **`AcadExtra.inscritos`** es un contador manual (p. ej. Fútbol `inscritos=26` vs 1 servicio real): no usar como fuente.
10. `Alumno.tutorId` y `FinCobroItem.tutorId` coinciden en el 100 % de los cargos (0 discrepancias) y `FinCobroItem.tutorId` nunca es NULL: el desglose por tutor es fiable.
11. `FinRecibo.est`: 3 anulados (2026–27). Todas las agregaciones deben excluir `est='Anulado'` (patrón ya usado en `resumenFinancieroCiclo`).

---

## 2. Informe por informe

Leyenda del detalle: (a) ¿hoy?, (b) qué falta, (c) cambio de BD mínimo aditivo, (d) rendimiento, (e) esfuerzo.

### Informe 1 — Cuentas por cobrar (balance pendiente; desglose por estudiante, matrícula y tutor)
- **(a) Sí.** Fuente única: `FinCobroItem` con `paid=false` y `cicloId` (lib/cxc.ts:5-12). Joins: `Alumno` (nombre, `code`), `Matricula(alumnoId,cicloId)` → `Seccion`/`Grado` (matrícula = sección del ciclo), `Tutor` por `FinCobroItem.tutorId` (financiero). Vencido/por vencer con `saldoCuenta`/`estadoCuota` (cxc.ts:57-63). Ya existe una versión parcial: `resumenFinancieroCiclo.deudaAlumnos` y `CierreCiclo.deudaAlumnos` (foto JSON por alumno).
- **(b) Matices.** (i) «Matrícula» es ambiguo: ¿la inscripción del alumno (sección) o el **concepto** matrícula/reinscripción (`tipo='mat'`)? El informe debe poder desglosar por ambos. (ii) En ciclos cerrados `paid` refleja el estado **de hoy** (la deuda del ciclo cerrado sigue cobrable, ciclo-cierre.ts cabecera): el «saldo al cierre» solo existe en `CierreCiclo.deudaAlumnos` (solo 2026–27, y sin tutor ni concepto). (iii) Vencido se deriva a fecha de consulta; para «a fecha X» parametrizar `hoy`.
- **(c) Sin cambio de BD.** Opcional: extender el JSON del snapshot de cierre con `tutorId` y desglose por `tipo` (sin DDL; es `NVarChar(Max)`), solo para cierres futuros.
- **(d) Rendimiento:** 15.7k cargos totales, ~7.6k pendientes en 2026–27; índice `(cicloId, paid)` ya existe. Agregación en memoria (como `resumenFinancieroCiclo`) < 1 s. Paginar por alumno. No materializar.
- **(e) S.**

### Informe 2 — Movimientos del alumnado (promovidos, reprobados, retirados, egresados, inactivos; origen, destino, promedio)
- **(a) Parcial.**
  - *Origen→destino de ciclos ya cerrados*: **`PromocionDetalle` NO basta** (0 filas; los 2023–25 se cerraron con la lógica antigua y 2026–27 nunca se promovió). Pero **`Matricula` sí basta para reconstruir**: por alumno, la sección del ciclo N (origen) y del N+1 (destino) dan grado origen/destino; comparando `Grado.orden` se clasifica *Promovido* (grado destino > origen), *Repitente* (igual), *Sin matrícula siguiente* (retirado/egresado/baja). Verificado: 2023–24 → 445 `otroGrado`; 2024–25 → 571 `otroGrado`; 2025–26 → 667 `otroGrado` + 23 `mismoGrado` (coincide con `Repitente`); 2026–27 → 804 `Activo` y 15 `Retirado` sin siguiente (aún sin promover).
  - *Retirados*: `Matricula.estado='Retirado'` + `fechaRetiro` (15/15 con fecha). **No hay motivo** ni destino.
  - *Egresados*: `Matricula.estado='Graduado'` / `Alumno.estado='Egresado'`: hoy 0 filas; el mecanismo existe (promocion.ts: último grado aprobado → Graduado; ciclo-cierre.ts paso 5).
  - *Inactivos*: solo `Alumno.estado='Inactivo'` (9), estado **actual**, sin fecha ni ciclo. `Matricula` no tiene estado «Inactivo» (CK_Matricula_estado: Activo, Retirado, Promovido, Repitente, Graduado, Reservado, Liberada).
  - *Promedio*: solo calculable donde hay notas completas: **2025–26** (661 alumnos). 2023–24/24–25 tienen notas de 1 alumno → promedio no disponible (marcar «sin notas»). El promedio por alumno se calcula con `finalPeriodo` + rúbrica (promocion.ts) y hoy solo se persiste en `PromocionDetalle.promedio` (vacío).
- **(b) Falta:** motivo de retiro; historial de estado del alumno (inactivo/reactivado) con fecha; promedio congelado por ciclo cerrado (hoy se recalcularía con la rúbrica actual, que no está versionada); el reprobado de 2023–25 es indistinguible de promovido salvo por comparación de grados (la matrícula dice `Promovido` para todos, aunque alguno repita: el análisis arriba muestra 0 casos, pero el estado almacenado no es fiable).
- **(c) Cambios mínimos aditivos:**
  1. `Matricula.motivoRetiro NVarChar(200) NULL` (ver C3).
  2. Recomendado: tabla `MatriculaResultado` (snapshot por matrícula: promedio, reprobadas, incompletas, resultado, sección origen/destino, acción) escrita al aplicar promoción / al cerrar y **backfill reconstruido** para ciclos pasados (C4).
  3. Opcional: `AlumnoEstadoHistorial` (alumno, ciclo, estado anterior/nuevo, fecha, motivo, usuario) para «inactivos» (C5).
  Alternativa sin tablas: calcular todo bajo demanda (`promediosCiclo(cicloId)` extraído de `evaluarPromocion`, cuya lógica de notas ya existe) + `Matricula` N/N+1; queda sin motivo ni historial de inactivos.
- **(d) Rendimiento:** 2.5k matrículas + 27k notas: cálculo bajo demanda ≈ 1–3 s (en `evaluarPromocion` ya se carga todo en memoria). Para ciclos cerrados conviene snapshot (evita variación por rúbrica y repite el cálculo).
- **(e) M** (S si se acepta «sin motivo/sin historial de inactivos»).

### Informe 3 — Histórico consolidado de calificaciones por sección
- **(a) Sí, como cálculo.** `AcadNota` (rosterId × materiaId × periodoId; c1..c4, ex) → ciclo por `PeriodoAcademico.cicloId`; el alumno por `AcadRoster.alumnoId`; la **sección del ciclo** por `Matricula(alumnoId, cicloId).seccionId` (OJO: `AcadRoster.seccionId` solo manda para nómina sin Alumno; 10 de 788 rosters no tienen alumno → excluir/avisar). Docente por `AcadAsignacion(cicloId, seccionId, materiaId)`. Final de periodo con `finalPeriodo` (promocion.ts) y pesos de rúbrica (`rubricaDe`, academico.ts).
- **(b) Falta / riesgos:** (i) datos reales solo 2025–26; (ii) la rúbrica (pesos por competencia/examen) **no está versionada**: recalcular un ciclo cerrado con la rúbrica de hoy puede dar otro final; (iii) `AcadNota` por ciclo no se congela al cerrar; (iv) un ciclo con 18 materias × 4 periodos × ~661 alumnos ≈ 47k celdas potenciales (27k existentes).
- **(c) Cambio mínimo:** recomendado `CierreNota` (snapshot por matrícula×materia con finales P1..P4, final materia, `nombreRubrica`) llenado al cerrar el ciclo (C6); índice `AcadNota(periodoId, materiaId)` (C7). Sin esto el informe funciona pero «histórico» puede cambiar si cambian rúbricas.
- **(d) Rendimiento:** consolidar por sección = `GROUP BY` en memoria sobre ≤ 30k filas por ciclo (< 2 s). Exportar la matriz completa a PDF por alumno es pesado: ofrecer resumen por sección/materia (promedio, % aprobados, mín/máx) + detalle por sección bajo demanda; Excel con una hoja por sección requiere extender `xlsxBlob` (hoy una hoja).
- **(e) M.**

### Informe 4 — Emisión total de facturas por concepto
- **(a) Parcial.** «Facturas» = comprobantes con NCF. Tres fuentes: `FinRecibo` (+`FinReciboItem.concepto/monto/descuento*`), `FinVenta`/`FinVentaItem` (kiosko; ITBIS no guardado, ver informe 8) y `PersInscripcion` (`ncf`, `factura`). Cuidado: la app **no emite factura al facturar el cargo**: el comprobante se emite al **cobrar** (recibo). `CierreCiclo.facturado` define «facturado» como cobrado de cargos del ciclo + pendiente (contable/devengado), no como comprobante emitido. Hay que decidir qué quiere el usuario (ver preguntas).
- **(b) Falta:** catálogo de **concepto** normalizado. `FinReciboItem.concepto` es texto libre («Colegiatura Septiembre 2026», «Reinscripción 2025–2026», «2 × Camisa…»). Clasificación posible hoy: `FinCobroItem.tipo` (col/com/mat/mora/srv/tra) refinado con `ServicioAlumno` (ruta/alimentación/extra/producto → categoría del producto) y regex en `con` para reinscripción/inscripción/seguro/materiales. Las 510 líneas sin cargo solo se clasifican por regex. Inscripciones: sin líneas (un solo monto `factura`).
- **(c) Cambio:** primera opción **sin DDL** (función `categoriaCargo()` determinista + tabla de reglas en código). Recomendado a mediano plazo: `FinReciboItem.categoria NVarChar(30) NULL` (snapshot al emitir + backfill) y `FinCobroItem.categoria` (C8) para evitar clasificar por texto.
- **(d) Rendimiento:** 7.7k líneas; agregación trivial; con filtros por ciclo/fecha usa `FinRecibo(cicloId)`/`createdAt` existentes.
- **(e) M** (L si se exige unificar las 3 fuentes y la clasificación histórica con precisión).

### Informe 5 — Detalle de recaudación por método de pago / recibo
- **(a) Sí.** `FinRecibo` (est≠Anulado) ⨝ `FinReciboPago` (una fila por medio: `metodoPagoId`, `monto`, `referencia`) ⨝ `MetodoPago`; caja/cajero/tutor/NCF ya en `FinRecibo`. Existe el patrón en dashboard (`paysDe`, `esEfectivo`) y `docRecibos` (printListados.ts:42) para PDF. Mixto = varias filas de pago por recibo.
- **(b) Falta:** (i) **ventas kiosko** (`FinVenta`, método único `metodoPagoId`) son recaudación pero **no tienen `cicloId`** (por ciclo solo por rango de fechas del ciclo); `resumenFinancieroCiclo.cobrado` las excluye; (ii) inscripciones (`PersInscripcion`) sin medio de pago; (iii) 219 recibos con `metodoPagoId` NULL → usar siempre `FinReciboPago`.
- **(c) Sin cambio obligatorio.** Opcional: `FinVenta.cicloId` nullable + backfill por fecha (C9) para filtrar por ciclo sin ambigüedad.
- **(d) Rendimiento:** 4.7k recibos ~ 1.1 pagos c/u: sin problema. Índices existentes `FinRecibo(cicloId)`, `(createdAt)`, `FinReciboPago(metodoPagoId)`.
- **(e) S.**

### Informe 6 — Cobrado neto tras devoluciones (notas de crédito)
- **(a) Sí.** Cobrado por método = Σ `FinReciboPago.monto` (recibos vigentes); devuelto por método = Σ `NotaFiscalReembolso.monto` (nota `clase='CREDITO'`, `metodoPagoId`); neto = cobrado − devuelto. Por cargo: `NotaFiscalLinea.cobroItemId` (+`efecto`: ReabreCargo / Ajuste / Devolucion) y `reciboItemId`. Funciones de apoyo: `reembolsosEnRango` (notas.ts:567), `resumenFinancieroCiclo` (`notasCredito`, `cobradoNeto`).
- **(b) Definición a fijar:** `CierreCiclo.cobradoNeto` resta NC **sobre recibos vigentes del ciclo** (ciclo del recibo), mientras `reembolsosEnRango` filtra por ciclo/fecha **de la nota**. Una NC emitida en otro ciclo que el recibo cambia el resultado. Además `cobradoNeto` ignora NC de ventas kiosko (`ventaId`). Hay solo 3 NC reales (todas 2026–27, sobre recibos, 32 250 RD$): sin volumen para validar.
- **(c) Sin cambio de BD.** Documentar la definición elegida y mostrar ambas columnas (NC por ciclo del recibo y por ciclo de la nota) si difieren.
- **(d) Rendimiento:** trivial.
- **(e) S.**

### Informe 7 — Notas de crédito/débito con motivos y montos (ajustes a NCF)
- **(a) Sí.** `NotaFiscal` (clase, `ncf`, `ncfModificado`, `tipoComprobanteId` B03/B04/E33/E34, `modalidad`, `estadoDgii`, `monto`, `fueraDePlazo`, `motivoTexto`, cliente RNC/nombre, caja/cajero, `createdAt`) ⨝ `MotivoNota` (código DGII 01–05 / operativo OPxx, `codigoDgii`) ⨝ líneas (`efecto`) ⨝ reembolsos por medio. Documento afectado: `reciboId` o `ventaId`. Notas de débito: `FinCobroItem.notaDebitoId` (cargos creados; hoy 0 notas de débito).
- **(b) Falta:** nada para el informe; la NC no desglosa ITBIS (relevante para 607/IT-1, no para este informe). `idempotencyKey` no se muestra.
- **(c) Sin cambio.**
- **(d) Rendimiento:** volumen mínimo; índices `NotaFiscal(cicloId, createdAt)`, `(motivoId)`, `(reciboId)` ya existen.
- **(e) S.**

### Informe 8 — Consolidado anual de compras (606) y ventas (607) para auditoría interna del ciclo
**Veredicto: 606 no es posible; 607 es posible solo parcialmente.**

**Compras (606) — «no existe»:** se buscó en `schema.prisma` y `src/` (proveedor, compra, gasto, retención, ITBIS): **no hay tabla, campo ni endpoint de compras, gastos o proveedores**. Lo único relacionado: el catálogo `TipoComprobante` incluye códigos de uso `Compras`/`Gastos`/`Exterior` (B11, B13, B17, E41, E43, E47) y la nota «módulo de contabilidad futuro» (docs/fiscal-ncf.md:22,158). El diseño futuro ya está especificado (no implementado) en `docs/contabilidad-rrhh.md` §tablas 24-37: `FiscProveedor`, `ContCompra` (con `itbisFacturado`, `itbisRetenido`, `tipoGasto606`, `formaPago`…), `ContCompraPago`, `FiscRetencionTipo`, `FiscDeclaracion`/`Linea`.

Campos que exige el 606 vs. lo que existe (**A VALIDAR todos contra la norma/formato DGII vigente**; lista de trabajo basada en el conocimiento del equipo y en el diseño de docs/contabilidad-rrhh.md):

| Campo 606 (A VALIDAR) | ¿Existe? |
|---|---|
| RNC/Cédula del proveedor y tipo de identificación | No (solo `Tutor.cedula`/`clienteRnc` de clientes) |
| Tipo de bienes y servicios comprados (códigos 01–11) | No |
| NCF y NCF modificado del proveedor | No (`SecuenciaFiscal` es de emisión propia) |
| Fecha del comprobante / fecha de pago | No |
| Monto facturado en servicios / en bienes / total | No |
| ITBIS facturado, retenido, sujeto a proporcionalidad, llevado al costo, por adelantar, percibido | No |
| Tipo y monto de retención de renta (ISR), ISR percibido | No |
| Impuesto selectivo, otros impuestos, propina legal | No |
| Forma de pago | Solo catálogo `MetodoPago` (para cobros, no mapeado a códigos DGII) |

**Ventas (607) — parcial.** Fuentes: `FinRecibo` (NCF, tipo B01/B02/E31/E32, `clienteRnc/clienteNombre`, `createdAt`, pagos por medio → forma de pago), `FinVenta` (NCF, `total`, método), `PersInscripcion` (NCF, `factura`) y `NotaFiscal` (NCF de notas + `ncfModificado`, tipos B03/B04/E33/E34). Lo que falta frente al 607 (A VALIDAR):

| Campo 607 (A VALIDAR) | Estado |
|---|---|
| RNC/Cédula + tipo identificación del comprador | `FinRecibo.clienteRnc` solo si crédito fiscal/gubernamental (4 recibos con RNC); **`FinVenta` no guarda RNC/nombre** (la venta E31 de kiosko por RD$ 28 729 no tiene comprador); consumo B02 va sin identificación (umbral `umbralConsumoIdentificado`=250 000 en SisConfig); tipo ident. derivable de la longitud 9/11 |
| NCF / NCF modificado | `FinRecibo.ncf`, `FinVenta.ncf`, `PersInscripcion.ncf`, `NotaFiscal.ncf`/`ncfModificado` |
| Tipo de ingreso (01–06) | No existe; se puede asignar por defecto «ingresos por operaciones» por regla de concepto (A VALIDAR) |
| Fecha comprobante / fecha de retención | Fecha sí (`createdAt`); retención no |
| Monto facturado | `FinRecibo.monto` (con descuentos) — pero **sin separar base e ITBIS** |
| **ITBIS facturado** | **No se guarda** en `FinRecibo` ni `FinVenta` (docs/fiscal-ncf.md:150 lo reconoce). Kiosko: reconstruible = Σ(precio×cantidad de líneas con `tax`) × tasa, pero la tasa no se guarda (hoy `SisConfig.finanzas.itbis`=0.18; si cambia, se rompe el histórico) |
| ITBIS retenido por terceros, ISR retenido, ITBIS/ISR percibido, selectivo, otros impuestos, propina | No existen |
| Forma de pago (efectivo, cheque/transferencia, tarjeta, crédito, bonos, permuta, otras) | Derivable de `FinReciboPago.metodoPagoId` si se agrega un mapeo MetodoPago → código DGII (columna nueva en catálogo); inscripción sin medio |

Hay además una regla fiscal que debe confirmarse con contador (A VALIDAR): la educación formal está exenta de ITBIS, los uniformes/libros/otros bienes del kiosko pueden estar gravados (`FinProducto.tax=true` solo en uniformes).

- **(c) Cambios de BD:**
  - 607: `FinRecibo.itbis`, `FinRecibo.itbisRetenido`, `FinRecibo.isrRetenido` (Float default 0), `FinVenta.itbis`, `FinVenta.clienteRnc`, `FinVenta.clienteNombre`, `MetodoPago.codigoDgii` (C10). Backfill: ITBIS de ventas kiosko recalculado con la tasa de config (aproximación documentada); recibos históricos = 0 (exento) salvo revisión contable.
  - 606: módulo de compras mínimo: `FiscProveedor` + `ContCompra` (+ catálogos de códigos 606 como datos) tomando el subconjunto de docs/contabilidad-rrhh.md (C11). Es un módulo de captura (pantalla de registro de facturas de proveedores) que hoy no existe en la UI.
  - Alternativa para «auditoría interna del ciclo» a corto plazo: entregar solo el **607 interno** y marcar el 606 como «no disponible: requiere módulo de compras».
- **(d) Rendimiento:** unir ~4.7k recibos + ventas + notas por año: trivial; es un informe de cierre anual, se puede generar bajo demanda. Exportar a TXT de la DGII (pipe/ancho fijo, A VALIDAR) requiere generador de archivo propio (el `xlsxBlob` actual no sirve).
- **(e) 607: M (con columnas nuevas) · 606: L (módulo completo + validaciones RNC/NCF).**

### Informe 9 — Extracurriculares: ingresos por disciplina/taller
- **(a) Parcial.** Cómo se cobran: al contratar un servicio desde el Expediente se crea `ServicioAlumno` (FK `extraId`, `kind='rec'`, `cost`) y N `FinCobroItem` (`tipo='srv'`, `servicioId`, un cargo por mes; expediente/index.ts:272). Ingreso por taller = Σ `FinReciboItem.monto` de líneas cuyo `cobroItem.servicio.extraId = X` (cobrado) y Σ cargos (facturado/pendiente). Datos hoy: 6 disciplinas con servicio, 7 alumnos, 49 cargos **solo del ciclo 2026–27**, **1 cobrado**.
- **(b) Falta:** `ServicioAlumno` no tiene `cicloId` ni fecha de alta/baja (`est` = texto «Activo» o «Baja · dd/mm/aaaa»); por ciclo solo se obtiene vía `FinCobroItem.cicloId`. `AcadExtra` no es por ciclo (catálogo único; `ini`, `sem` texto/entero). Si se da de baja un servicio, se anulan cuotas futuras pendientes; si se cancela un único se **borra** el servicio (expediente/index.ts:327) y se pierde el vínculo cargo→disciplina (cargo borrado también).
- **(c) Cambio mínimo:** `ServicioAlumno.cicloId` FK NULL (+ índice) y `fechaAlta`/`fechaBaja` `NVarChar(10)` NULL, backfill desde el primer cargo (C12). Sin esto el informe sale por ciclo vía cargos.
- **(d) Rendimiento:** mínimo (decenas de filas hoy; en producción cientos). Índices `ServicioAlumno(extraId)`, `FinCobroItem(servicioId)` ya existen.
- **(e) S** (con C12) / M (sin él, por el parseo de `est`).

### Informe 10 — Extracurriculares: retención de alumnos y proyección de continuidad
- **(a) No de forma fiable.** «Retención» necesita saber quién estaba inscrito en una disciplina en el ciclo N y sigue en N+1. No existe tabla de **inscripción extracurricular por ciclo**: `ServicioAlumno` es una fila viva sin ciclo. Con cargos se puede inferir pertenencia por ciclo (alumno con cargo `srv`/`extraId` en el ciclo), pero hoy solo existe 2026–27 → no hay segundo ciclo para comparar. Si «retención» se entiende como retención **escolar** (alumnos del ciclo N con matrícula en N+1), eso sí sale de `Matricula` y `ReinscripcionReserva`/`ReinscripcionEvento` (hoy 0 filas: la reinscripción nueva no se ha usado).
- **(b) Falta:** histórico de inscripción por ciclo (alta/baja/fechas), y para la proyección: reservas de reinscripción (`ReinscripcionReserva`, `Matricula.estado='Reservado'`) con intención por actividad (no existe: la reserva es de matrícula, no de extracurricular).
- **(c) Cambio:** C12 (`cicloId`, `fechaAlta`, `fechaBaja`) y, para proyección real, asociar la intención de continuidad (campo nullable `ServicioAlumno.continuaProximoCiclo Boolean?`) o proyectar con tasa histórica (retención del ciclo anterior × alumnos actuales). Recomendado empezar con la **proyección por tasa histórica** (sin DDL adicional) y marcarla como estimación.
- **(d) Rendimiento:** mínimo.
- **(e) M** (L si se quiere intención explícita y flujo de reinscripción por actividad).

### Informe 11 — Planes de pago: facturado vs cobrado por plan
- **(a) Sí.** `FinCobroItem` no guarda el plan, pero `Contrato(alumnoId, cicloId)` (único) lleva `planId` → `FinPlan.name`. Facturado por plan = Σ `FinCobroItem.monto` (col/mat del ciclo) de alumnos del contrato + lo cobrado ya reducido; cobrado = Σ `FinReciboItem.monto` de líneas de esos cargos; descuentos/becas en `descuento`, `descuentoBeca`, `montoBruto`. Planes reales: «Plan Regular 10 Cuotas» (1 131 contratos), «Pago Único Anual Contado» (123), «Plan Trimestral» (242), «Plan 11 Cuotas (Ago–Jun)» (0); **no existen «Plan A/B»**: son nombres de ejemplo del usuario. `FinPlan.data` (JSON) trae cuotas/frecuencia/mora; `FinPlanTanda` importe por tanda.
- **(b) Falta:** el cargo no congela el plan (si el contrato cambia durante el ciclo, el informe reasigna todo el histórico al plan actual; el cambio se audita en `SisAudit` solo como texto). 2023–25 sin contratos. 5 cargos sin contrato. `PersInscripcion.planId` difiere del contrato en 1 caso (usar Contrato).
- **(c) Sin cambio obligatorio.** Opcional: `FinCobroItem.planId` NULL (snapshot al generar el cargo) si el negocio permite cambiar de plan en el año (C13).
- **(d) Rendimiento:** join de 15.7k cargos + 805 contratos: trivial. Índices `Contrato(planId)`, `Contrato(cicloId)`, `FinCobroItem(cicloId, paid)` ya existen.
- **(e) M** (la lógica de «facturado» devengado vs cobrado y los abonos parciales que reducen `monto` requiere cuidado: `monto` de un cargo con abono ya viene descontado, cxc.ts:18).

### Informe 12 — Inventario y tienda: rotación de stock y total recaudado en uniformes, libros y útiles
- **(a) Parcial.**
  - *Categorías*: `CategoriaProducto` tiene **Uniformes (9 productos), Libros (9), Papelería (6), Servicios (10), Actividades (4)**; «útiles» ≈ Papelería (confirmar con el usuario).
  - *Rotación*: `FinMovimiento` (tipo Salida/Entrada/Devolución, `productoId`, `q` texto con signo, `createdAt`, `ref`, `ventaId`). Todas las variaciones de stock pasan por movimientos (verificado: kiosko ventas/entradas, notas de crédito, expediente); no hay ajuste manual sin movimiento. El stock inicial no se registra pero es reconstruible hacia atrás desde `FinProducto.stock`. Rotación = Σ salidas netas / stock promedio, alta/baja demanda por ranking.
  - *Recaudado*: dos orígenes — (1) venta al contado: `FinVentaItem` (`precio`×`cantidad`, `tax`) por `productoId`, `FinVenta.createdAt`; (2) **cargo a alumno desde el Expediente**: `ServicioAlumno.productoId` + `FinCobroItem.servicioId` (tipo `srv`) + líneas de recibo → **sí queda ligado al producto** (5 cargos hoy), y descuenta stock con `FinMovimiento(ref = servicioId)` solo si el producto tiene stock. Devoluciones: `NotaFiscalLinea.productoId/cantidad` (efecto Devolucion).
- **(b) Falta:** (i) `q` en texto (hay que parsear «−»/«+»); (ii) sin precio/costo ni stock resultante en el movimiento; (iii) `FinVenta` sin `cicloId`; (iv) productos sin stock (paquetes, servicios) no tienen movimientos → fuera de la rotación; (v) todo el histórico real es de 3 días (20 movimientos): el informe saldrá casi vacío hasta que haya operación; (vi) el servicio de producto que se cancela borra la fila `ServicioAlumno` (se pierde el total recaudado ligado, aunque el cargo pendiente también se elimina); (vii) la recaudación por cargo no distingue ITBIS.
- **(c) Cambio recomendado:** `FinMovimiento.cantidad Int NULL` (signo incluido, backfill desde `q`) y `stockResultante Int NULL` opcional; índices `FinMovimiento(productoId, createdAt)` y `(createdAt)`; `FinVenta(createdAt)` y opcional `FinVenta.cicloId` (C9, C14, C7).
- **(d) Rendimiento:** hoy trivial; en un año escolar completo serían miles de movimientos por producto → agregación SQL (`GROUP BY productoId`) con los índices anteriores. No materializar.
- **(e) M.**

---

## 3. Lista consolidada de cambios de esquema ADITIVOS (para APROBACIÓN)

Todos son aditivos (tablas nuevas, columnas NULL/default, índices). Ninguno altera datos existentes; los backfills son scripts idempotentes aparte. Prioridad: **P1** = necesario para que el informe exista; **P2** = recomendado (calidad/consistencia); **P3** = opcional.

| ID | Cambio | Informes | Prioridad | Notas |
|---|---|---|---|---|
| C1 | **Capa de informes sin DDL**: lib/informes + endpoint común | todos | — | Sin cambio de BD |
| C3 | `Matricula.motivoRetiro NVarChar(200) NULL` | 2 | P2 | Se llena al retirar (UI de retiro) |
| C4 | Tabla `MatriculaResultado` (`matriculaId` PK/FK, `cicloId`, `promedio`, `reprobadas`, `incompletas`, `resultado`, `seccionOrigenId`, `seccionDestinoId`, `accion`, `origen` 'Aplicada'\|'Reconstruida', `calculadoEn`) | 2 (3) | P2 | Alternativa: reutilizar `PromocionDetalle` — se descarta porque exige `PromocionCiclo` y puede interferir con la lógica de re-promoción (promocion.ts `previas`) |
| C5 | Tabla `AlumnoEstadoHistorial` (`alumnoId`, `cicloId`, `estadoAnterior`, `estadoNuevo`, `fecha`, `motivo`, `usuario`) | 2 | P3 | Para «inactivos» con fecha; hoy solo en SisAudit texto |
| C6 | Tabla `CierreNota` (snapshot de finales por matrícula×materia al cerrar: `p1..p4`, `final`, `rubrica`) | 3 (2) | P2 | Evita que cambios de rúbrica alteren ciclos cerrados |
| C7 | Índices: `AcadNota(periodoId, materiaId)`; `Matricula(cicloId, estado)`; `FinMovimiento(productoId, createdAt)` y `(createdAt)`; `FinVenta(createdAt)`; `FinRecibo(cicloId, est, createdAt)` | 2,3,5,12 | P2 | Verificar plan de ejecución antes; los actuales ya cubren los filtros por ciclo |
| C8 | `FinReciboItem.categoria NVarChar(30) NULL` y `FinCobroItem.categoria NVarChar(30) NULL` | 4 (1,5,11,12) | P2 | Alternativa sin DDL: clasificar en código |
| C9 | `FinVenta.cicloId NVarChar(100) NULL` FK→Ciclo + backfill por fecha | 5,6,12 | P2 | Hoy las ventas kiosko no pertenecen a un ciclo |
| C10 | `FinRecibo.itbis`, `itbisRetenido`, `isrRetenido` (Float default 0); `FinVenta.itbis`, `clienteRnc`, `clienteNombre`; `MetodoPago.codigoDgii NVarChar(2) NULL` | 8 (607) | P1 | A VALIDAR con contador/DGII; recibos históricos = 0 |
| C11 | Módulo de compras: `FiscProveedor`, `ContCompra` (subconjunto de docs/contabilidad-rrhh.md tablas 24-25, 31-32) | 8 (606) | P1 | Incluye pantalla de captura (no existe) |
| C12 | `ServicioAlumno.cicloId` FK NULL (+índice), `fechaAlta`, `fechaBaja` `NVarChar(10)` NULL, backfill desde el primer cargo | 9,10 | P1 para 10 / P2 para 9 | Registra histórico por ciclo |
| C13 | `FinCobroItem.planId` FK NULL (snapshot al generar el cargo) | 11 | P3 | Solo si el plan puede cambiar en el ciclo |
| C14 | `FinMovimiento.cantidad Int NULL` (signo incluido) + `stockResultante Int NULL`; backfill parseando `q` | 12 | P2 | `q` y `t` se conservan |
| C15 | Extender el JSON de `CierreCiclo.deudaAlumnos` con tutor y desglose por tipo (sin DDL) | 1 | P3 | Solo cierres futuros |
| C16 | Tabla `InformeSnapshot` (tipo, ciclo, parámetros, `generadoEn`, `json`) | 1,3,6 | P3 | Solo si el rendimiento lo exige; hoy NO se recomienda |

Sin aprobar nada de P1/P2, los informes 1, 5, 6, 7 y 11 se pueden entregar completos; 2, 3, 4, 9 y 12 se entregan con las limitaciones descritas; 8 (606) y 10 no.

---

## 4. Menú «Informes» y permisos

### 4.1 Agrupación propuesta (12 informes en 5 entradas)

| Entrada de menú | `ScreenId` nuevo | Informes | Observaciones |
|---|---|---|---|
| Informes de cierre de año escolar | `inf-cierre` | 2, 3, + resumen contable `CierreCiclo` (ya existe en Configuración → Ciclos) | Mostrar también el resumen de cierre y la deuda al cierre (foto) |
| Informes de facturación | `inf-facturacion` | 4, 5, 6, 7, 8 | 8-606 oculto hasta que exista módulo de compras |
| Informes de estudiantes | `inf-estudiantes` | 9, 10 (+ acceso directo a 2 y 3) | 2 y 3 se implementan **una vez** y se listan en «Cierre» (principal); en «Estudiantes» pueden aparecer como atajos con el mismo componente |
| Informes de inventario | `inf-inventario` | 12 | Permiso afín al de `inventario` |
| Informes CxC | `inf-cxc` | 1, 11 | |

Alternativa considerada: un único `ScreenId` `'informes'` con sub-permisos internos. Se prefiere **un ScreenId por entrada** porque la matriz RBAC (Configuración → Roles y permisos, `config/index.tsx:200-209`) itera `NAV` y trabaja por `ScreenId`; así los 5 aparecen solos como filas asignables y `requireScreen` protege cada API. Trade-off: más ScreenId en la matriz (5 filas más).

### 4.2 Cambios necesarios (cuando se implemente)
- `packages/shared/src/index.ts:16`: ampliar la unión `ScreenId` con los 5 ids.
- `apps/web/src/lib/access.ts`: nuevo grupo en `NAV` (`{ g: 'Informes', items: [...] }`, iconos Phosphor), agregar a `ALL` y a `ACCESS` por rol.
- API: `app.requireScreen('inf-…')` por ruta (patrón actual de config/catalogos/alimentación; `requireScreen` responde 403 si el rol no está en la matriz guardada y deja pasar al Super Admin: plugins/auth.ts:32).
- **Trampa de despliegue:** si la instalación ya guardó una matriz en `SisConfig 'access'` (override), las pantallas nuevas **no aparecen** para ningún rol salvo Super Admin hasta que se asignen en Roles y permisos (`access.ts` usa `override[rol] ?? ACCESS[rol]`). Prever una migración/semilla que añada los ids a los roles propuestos, o avisar en la nota de versión.
- `auth.ts` bloquea a `Tutor` con `TUTOR_OK` (solo portal): no hace falta tocar.

### 4.3 Permisos por rol (propuesta por defecto)

| Rol | inf-cierre | inf-facturacion | inf-estudiantes | inf-inventario | inf-cxc |
|---|---|---|---|---|---|
| Super Admin | ✔ | ✔ | ✔ | ✔ | ✔ |
| Director Académico | ✔ | — | ✔ | — | ✔ |
| Cajero | — | — (ver pregunta 6) | — | ✔ (si ya accede a `inventario`) | ✔ |
| Docente / Encargado Comedor / Tutor | — | — | — | — | — |

Racional: facturación/606/607 son información fiscal sensible (solo Super Admin por defecto, ampliable); el Director ve lo académico y la cartera. El informe 3 (notas por sección) para Docente podría limitarse a sus secciones (`AcadAsignacion`), pero no se propone en la primera entrega.

---

## 5. Capa común de informes (evaluación)

**Recomendación: sí, una capa común con registro de informes, no 12 endpoints sueltos.**

Opción A (recomendada) — `GET /informes/:tipo?ciclo=&desde=&hasta=&…&page=&pageSize=` sobre `lib/informes/<tipo>.ts`, cada uno con la firma `(filtros) → { columnas, filas, totales, meta }`:
- Reutiliza la convención existente de ciclo (`cicloReq`: `?ciclo=` o cabecera `X-Ciclo`, lib/ciclo.ts:98) y `requireScreen` por grupo.
- Respuesta tabular uniforme → una sola pantalla genérica de tabla/filtros y una sola exportación.
- Excel: `xlsxBlob(sheet, head, rows)` (components/finanzas/xlsx.ts) solo escribe **una hoja con cadenas**; para informes con varias hojas (3, 8) hay que extenderlo (hojas múltiples, tipos numéricos/moneda) — cambio pequeño y acotado.
- PDF: `pdfEngine.generarPdf(PDoc)` con documentos tipo `docRecibos`/`docInventario` (printListados.ts); añadir una plantilla genérica «tabla + totales + encabezado de ciclo».
- Paginación en servidor para vistas en pantalla; para exportar se pide la consulta completa por bloques. PDF > ~5 000 filas no es práctico: ofrecer resumen agregado en PDF y detalle completo solo en Excel/CSV.
- 606/607: además un generador de archivo TXT (formato DGII, A VALIDAR), fuera del motor xlsx/pdf.

Opción B — endpoints específicos por informe sin registro común: más rápido el primero, pero duplica filtros, permisos y exportación; descartada salvo prototipo.

Cómputo: bajo demanda con agregaciones SQL/memoria; **no materializar** al inicio (volúmenes ≤ 30k filas por ciclo). Materializar (snapshot) solo lo que debe quedar **congelado**: promedios/finales al cierre (C4/C6) y, si se desea, deuda al cierre extendida (C15). Un `InformeSnapshot` genérico (C16) no se recomienda.

Índices que ayudarían: ver C7 (`Matricula(cicloId, estado)`, `AcadNota(periodoId, materiaId)`, `FinMovimiento(productoId, createdAt)`, `FinVenta(createdAt)`, `FinRecibo(cicloId, est, createdAt)`) y, solo si aparecen consultas lentas, `FinCobroItem(cicloId, tipo, paid)` para el desglose por concepto. Los índices actuales ya cubren los filtros por ciclo: `FinCobroItem(cicloId, paid)`, `FinRecibo(cicloId)`, `NotaFiscal(cicloId, createdAt)`, `Contrato(planId)`.

Riesgos de la capa: (1) decidir una sola definición de «cobrado/facturado/neto» (hoy hay dos para neto: ver informe 6); (2) las funciones de promedio deben extraerse de `evaluarPromocion` (acoplada a destino/plan de matrículas) para no duplicar `finalPeriodo`; (3) ciclos cerrados son de solo lectura para escritura, no para lectura: el hook `CICLO_CERRADO` de app.ts no debe bloquear los GET de informes (verificar al implementar).

---

## 6. Orden de implementación sugerido (valor / riesgo)

1. **Fase 0 – Infraestructura** (S/M): registro de informes, endpoint común, pantalla genérica, exportación PDF/Excel, ScreenIds y menú. Sin DDL.
2. **Fase 1 – Rápidos con datos actuales** (alto valor, bajo riesgo): **1 (CxC)**, **5 (recaudación)**, **7 (notas)**, **6 (neto)**, **11 (planes)**. Todos sin DDL.
3. **Fase 2 – Cierre de año**: **2 y 3** (cálculo bajo demanda primero; luego C4/C6 + backfill reconstruido de 2025–26 y snapshot en el próximo cierre). Aprobar C3.
4. **Fase 3 – Facturación por concepto e inventario**: **4** (clasificación en código, luego C8), **12** (C14 + C7 + C9).
5. **Fase 4 – Extracurriculares**: aprobar C12; **9** y luego **10** (la proyección por tasa histórica puede salir antes que la intención explícita).
6. **Fase 5 – Fiscal DGII**: aprobar C10 → **607 interno**; luego, con módulo de compras (C11) → **606**. Es la de mayor esfuerzo y la única con dependencia normativa (A VALIDAR con contador).

---

## 7. Preguntas abiertas para el usuario

1. **«Facturas» (informe 4):** ¿se refiere a comprobantes emitidos (recibos/NCF al cobrar, que es lo que la app emite) o a lo **devengado** (cargos facturados aunque no cobrados, como `CierreCiclo.facturado`)? ¿Se incluyen kiosko e inscripciones?
2. **«Matrícula» en el informe 1:** ¿sección/matrícula del alumno, o el concepto «matrícula/reinscripción» (`tipo='mat'`), o ambos?
3. **Informe 2:** ¿basta «origen→destino» por grado/sección reconstruido de matrículas? ¿Se necesita motivo de retiro y fecha de inactivación (requiere C3/C5)? ¿Los ciclos 2023–25 deben mostrarse sin promedio (no hay notas)?
4. **Definición de cobrado neto (informe 6):** ¿las NC restan en el ciclo del recibo original o en el ciclo en que se emite la nota? ¿Se incluyen NC de ventas kiosko?
5. **Informe 8:** ¿para el 606 se aprueba construir un módulo de compras (captura de facturas de proveedores) o se entrega solo el 607 interno? ¿Existe contador que valide formatos, códigos de tipo de bien/servicio e ingreso, y la regla de ITBIS (educación exenta; uniformes/libros gravados o no)?
6. **Acceso a facturación:** ¿el Cajero debe ver algún informe de facturación (p. ej. solo su caja/turno) o solo Super Admin y administración?
7. **Informe 10:** ¿«retención» es de alumnos **en la actividad extracurricular** (continuidad entre ciclos) o retención **escolar** general? ¿La proyección usa tasa histórica o intención declarada por el tutor?
8. **Informe 12:** ¿«útiles» = categoría Papelería? ¿Se desea incluir Actividades/Servicios o solo Uniformes, Libros y Papelería? ¿Costo de compra para calcular margen (hoy no existe costo, solo precio)?
9. **Informe 11:** ¿«Plan A / Plan B» corresponden a los planes actuales («Plan Regular 10 Cuotas», «Pago Único Anual Contado», «Plan Trimestral») o se crearán planes nuevos? ¿Puede un alumno cambiar de plan en mitad del ciclo (justifica C13)?
10. **Agrupación:** informes 2 y 3 aparecen en «Cierre de año» y también como atajo en «Estudiantes»; ¿está bien, o prefiere duplicarlos como vistas independientes? ¿9 y 10 deben ir en «Estudiantes» o en «Facturación» (9 es de ingresos)?
11. **Datos de prueba:** el ciclo activo es 2027–2028 con la fecha del sistema en 2026-10-12 y los ciclos 2023–25 no tienen finanzas/notas: ¿se cargará un dataset realista antes de validar los informes, o se validará solo contra 2025–26 y 2026–27?
12. **Exportación:** ¿el PDF debe llevar firma/folio de verificación como los boletines (`DocFolio`, SHA-256) para informes oficiales (cierre, 606/607)?
