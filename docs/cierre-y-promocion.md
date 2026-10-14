# Cierre del año escolar y promoción de curso

Dos procesos **separados** (decisión de negocio):

1. **Cierre del año escolar** (EOY): cierra **a nivel contable** las finanzas del ciclo y lo deja **cerrado para edición**. **No pasa estudiantes de curso.**
2. **Promoción / avance de curso**: pasa de curso a los estudiantes según las **notas reportadas por los maestros en la Matriz de Notas**. Aprueban los que están dentro del **rango seguro**, configurable por el director (70 por defecto).

La promoción puede ejecutarse **antes o después** del cierre; no dependen uno del otro.

---

## 1. Cierre del año escolar (contable y de edición)

| | |
|---|---|
| Dónde | Configuración → **Ciclos lectivos** → «Cerrar año escolar» (ciclo activo). En ciclos cerrados: enlace a **Informes › Informes de cierre de año** (resumen + detalle de cada cifra). |
| API | `GET /config/ciclos/:n/cierre` (vista previa / foto guardada) · `POST /config/ciclos/:n/eoy` `{ code: 'CERRAR-2026-2027', pin? }` |
| Permiso | `requireScreen('config')` + texto de confirmación + **clave de supervisor** (token de un solo uso de `/auth/supervisor`; el Super Admin no la necesita). Validada también en el servidor (`supervisorOk`). |
| Código | `apps/api/src/lib/ciclo-cierre.ts` (`resumenFinancieroCiclo`, `resumenCierre`, `cerrarCiclo`) · web `apps/web/src/screens/config/CierreCiclo.tsx` |

**Qué hace** (una transacción):

1. Valida que el ciclo sea el **Activo** y que exista un ciclo **Planificado** siguiente. *Decisión*: se exige el siguiente porque toda la aplicación trabaja sobre **un** ciclo activo (`UX_Ciclo_activo`, `cicloIdActivo()`); cerrar sin sucesor dejaría la instalación sin ciclo activo.
2. Calcula el **resumen financiero** y lo guarda como foto inmutable en `CierreCiclo` (totales, fecha, usuario y deuda por alumno en JSON) **y el detalle línea por línea en `CierreCicloDetalle`** (misma transacción; ver abajo).
3. Marca el ciclo **Cerrado** (solo lectura: el hook global de `app.ts` responde `409 CICLO_CERRADO` a toda escritura por ciclo) y activa el Planificado siguiente.
4. **No** promueve, **no** cambia grados ni secciones y **no** crea matrículas. Las matrículas del ciclo cerrado se conservan tal cual: `Activo` = «cursó ese año» hasta que la promoción las pase a `Promovido` / `Repitente` / `Graduado`. No se crea un estado `Cursado`: el CHECK `CK_Matricula_estado` solo admite `Activo | Retirado | Promovido | Repitente | Graduado` y los reportes ya leen `Activo` de un ciclo cerrado como alumno de ese ciclo.
5. **Coherencia al cambiar el ciclo activo** (`Alumno.seccionId` = sección del ciclo activo, ver `lib/matricula.ts`). Solo para decisiones ya tomadas:
   - alumnos que **ya tienen matrícula** en el ciclo que se activa (pre-inscritos nuevos o promoción aplicada antes del cierre): `Alumno.seccionId` ← esa sección y `Preinscrito` → `Activo`;
   - alumnos que la promoción marcó `Graduado` en el ciclo que se cierra (sin matrícula en el siguiente): `Alumno.estado` ← `Egresado`.
   El resto de alumnos queda intacto.

**Totales** (`resumenFinancieroCiclo`):

| Campo | Definición |
|---|---|
| `cobrado` | Σ `FinRecibo.monto` de recibos vigentes (≠ Anulado) emitidos en el ciclo (caja del ciclo; incluye cobros de deuda anterior). |
| `notasCredito` / `notasDebito` | Σ notas emitidas en el ciclo por clase. |
| `cobradoNeto` | `cobrado` − notas de crédito sobre recibos vigentes del ciclo (misma regla que el historial del POS). |
| `pendiente` / `vencido` | Σ cargos sin pagar del ciclo / su parte vencida (`cxc.saldoCuenta`, a la fecha del cálculo). |
| `facturado` | Σ monto bruto de las líneas de recibos vigentes que cobraron cargos **del** ciclo + `pendiente`. |
| `descuentos` | Σ descuento de esas líneas (pronto pago, exoneraciones). |
| `mora` / `moraPendiente` | Cargos `tipo = 'mora'` del ciclo (cobrados + pendientes) / pendientes. |
| `deudaAlumnos` | Deuda vigente por alumno (pendiente, vencido, nº de cargos), de mayor a menor. La vista previa devuelve las 50 mayores; la foto guarda todas. |

**Qué guarda el cierre ahora (Etapa 2 de Informes)**: además de `CierreCiclo` (totales + deuda por alumno), una fila por línea en `CierreCicloDetalle` (`lib/ciclo-cierre-detalle.ts`): cada **cargo** del ciclo (facturado, descuento, pendiente, estado Pagado/Pendiente/Vencido a la fecha del cierre, categoría, tutor), cada **recibo** (vigentes y anulados; método principal y desglose de pagos mixtos en `extra`), cada **nota** de crédito/débito (motivo, reembolsos por método, si reabre el cobro), cada **línea con descuento** (motivo, %) y las **ventas rápidas** del rango de fechas del ciclo (`FinVenta` no tiene ciclo; no suman a ningún total). Nombres, códigos y tutor son **instantáneas** (no cambian si luego se edita el alumno). Los totales de `CierreCiclo` y la suma de las filas cuadran (se verifica al cerrar y en el informe). Los ciclos cerrados antes de esta función **no se rellenan**: el informe muestra sus totales y deudores con el aviso «Sin detalle (cierre anterior a esta función)». Coste: el cierre inserta las filas por lotes de 1000 con `INSERT … SELECT FROM OPENJSON` en SQL Server (≈ 3 s para 16 000 filas; con `createMany` de Prisma eran ≈ 120 s).

**Qué congela además el cierre (Informes etapa 3)**: (1) `CierreNota`: las notas finales del ciclo (fórmula «Final» de la Matriz) por alumno × materia × período (+ el final de la materia con período NULL), con la sección de la matrícula; ≈ 34 000 filas para 800 alumnos y 18 materias, insertadas por lotes de 1000 con `INSERT … SELECT FROM OPENJSON` (medido: ≈ 1,8 s de cálculo + ≈ 3,1 s de escritura sobre un cierre total de ≈ 11,5 s con ≈ 9 600 filas de detalle). (2) `MatriculaResultado` (fuente `cierre`): resultado, promedio y destino de las matrículas que no tienen resultado de promoción (según el estado de la matrícula: Retirado, Graduado, Promovido→Aprobado, Repitente→Reprobado, resto→Pendiente). La promoción aplicada (antes o después) escribe sus propias filas (fuente `promocion`, con promedio y destino reales) y sobrescribe las del cierre; un cierre posterior no pisa las de promoción. Ambas escrituras van en la misma transacción del cierre y son idempotentes. Ver docs/informes-analisis.md §10.

**Cartera del ciclo cerrado**: sigue **cobrable**. El POS la muestra como «deuda anterior» desde el ciclo activo (`/cobros/cuenta` y `/cobros/procesar` aceptan cargos de ciclos Cerrados; el recibo se emite en el ciclo activo). Reimprimir o enviar recibos de un ciclo cerrado está permitido (`lib/ciclo.ESCRITURA_LIBRE`).

---

## 2. Promoción / avance de curso (por notas)

| | |
|---|---|
| Dónde | Configuración → **Promoción de curso** |
| API | `GET/PUT /academico/promocion/config` · `GET /academico/promocion/preview?origen=2026–2027` · `POST /academico/promocion/aplicar { origen?, esperado? }` |
| Permiso | `requireScreen('config')` (Director / Super Admin). No es ruta «por ciclo»: el ciclo de origen va en `?origen=`. |
| Código | `apps/api/src/lib/promocion.ts`, `apps/api/src/modules/promocion/index.ts`, tipos `packages/shared/src/promocion.ts`, web `apps/web/src/screens/config/Promocion.tsx` |

### Parámetros (`SisConfig` clave `promocion`, cambios auditados)

| Parámetro | Por defecto | Significado |
|---|---|---|
| `notaMinima` | **70** | Rango seguro (0–100). |
| `criterio` | `promedio_general` | `promedio_general`: promedio general ≥ mínima · `todas_las_materias`: ninguna materia < mínima · `max_reprobadas`: promedio ≥ mínima y como mucho `maxReprobadas` materias < mínima. |
| `maxReprobadas` | 0 | Solo con `max_reprobadas`. |
| `requiereTodosLosPeriodos` | **true** | Si a una materia le falta la nota final de algún período del ciclo, el alumno queda **Pendiente de notas**. Con `false` se promedian los períodos que sí tienen nota final (solo queda pendiente quien no tiene ninguna). |

### Cálculo con la Matriz de Notas

`AcadNota` = alumno (roster) × materia × `PeriodoAcademico`, columnas `c1..c4` (competencias) + `ex` (examen), pesos de la rúbrica de la materia.

1. **Final del período** (misma fórmula que la columna «Final» de la Matriz): promedio **ponderado** de las competencias de la rúbrica; con examen, `final = prom × (1 − pesoEx) + ex × pesoEx` (`pesoEx` = peso del examen / suma de pesos; sin rúbrica: 17.5 por competencia + 30 examen). Solo cuenta si **todas** las competencias (y el examen, si la rúbrica lo tiene) tienen nota.
2. **Final de la materia** = promedio simple de sus finales de período (1 decimal). *Completa* = tiene final en todos los períodos del ciclo.
3. **Promedio general** = promedio simple de los finales de materia (1 decimal). Materia **reprobada** = final < `notaMinima`.
4. **Materias del alumno** = las asignadas a su sección en ese ciclo (`AcadAsignacion`, lo que ve cada maestro en la Matriz) ∪ las materias en las que tiene notas.
5. **Resultado**: `Aprobado` / `Reprobado` según el criterio, o `Pendiente de notas` (ver `requiereTodosLosPeriodos`).

Ejemplo (rúbrica por defecto, mínima 70): Matemática con finales 68, 72, 75, 71 → 71.5 (aprobada); Lengua 60, 65, 66, 70 → 65.3 (reprobada); Ciencias 80 × 4 → 80. Promedio general = (71.5 + 65.3 + 80) / 3 = 72.3 → **Aprobado** con `promedio_general`, **Reprobado** con `todas_las_materias`.

### Vista previa → Aplicar

- **Vista previa** (`preview`): no escribe. Devuelve por alumno promedio, materias, reprobadas, incompletas, resultado, **acción** que haría «Aplicar» y sección destino; conteos; filtros por grado/sección/resultado/acción y exportación a Excel en la web.
- **Ciclo destino** = el siguiente al de origen por fecha: **Planificado** si se promueve antes del cierre, **Activo** si después. Si no existe o está Cerrado, no se puede aplicar (`bloqueo`). Un ciclo promovido por el cierre **anterior** (todas sus matrículas ya en estado final, sin registro de promoción) también queda bloqueado: solo consulta.
- **Origen por defecto**: el último ciclo Cerrado si su siguiente es el Activo y aún tiene matrículas `Activo` sin resolver; si no, el ciclo Activo.
- **Aplicar** (`aplicar`, transacción por lotes, auditada, protegida contra doble ejecución). `esperado` = conteos de la vista previa: si cambiaron (notas o matrículas nuevas), responde **409** para volver a evaluar.

| Resultado | Acción | Matrícula destino | Matrícula de origen |
|---|---|---|---|
| Aprobado | **Promovido** → grado siguiente por `orden` | creada / reubicada | `Promovido` |
| Aprobado en el **último grado** por `orden` (no se fija «6to» en el código) | **Graduado** | se retira la copia automática si la hubiera | `Graduado`; `Alumno.estado = Egresado` si el origen ya no es el activo (si lo es, lo hace el cierre) |
| Reprobado | **Repitente** → mismo grado | creada / reubicada | `Repitente` |
| Pendiente de notas | **Pendiente**: no se mueve; queda listado | sin cambios | vuelve a `Activo` |
| Sin cupo | **SinCupo**: «sin sección asignada» (lo resuelve la etapa B) | ninguna nueva (conserva la que tuviera) | según el resultado |
| Ya matriculado en otro grado | **Respetada** (pre-inscripción, reserva, pase manual) | sin cambios | según el resultado |

**Sección destino**: misma letra y tanda; si no existe o no tiene cupo, la de esa tanda con menos carga; si no, cualquiera del grado con cupo. **Nunca sobrepasa `Seccion.cap`** (carga = matrículas `Activo` del ciclo destino; `cap ≤ 0` = sin límite). El orden de asignación es determinista (grado, sección, apellidos), así la vista previa coincide con lo aplicado.

**Matrículas ya existentes en el ciclo destino**: *respetada* si está en un grado distinto al de origen y no la puso una promoción anterior; *ajustable* si está en el mismo grado que el origen (copia automática de `sincronizarMatricula` tras el cierre) o la creó una promoción anterior (Promovido/Repitente). Una matrícula destino `Retirado` se respeta. Nunca se duplica (`UNIQUE(alumnoId, cicloId)`).

**Idempotencia**: aplicar de nuevo con los mismos datos no cambia nada (0 creadas, 0 ajustadas). Tras corregir notas o la nota mínima, solo se reubica lo que cambió (p. ej. un repitente que pasa a aprobado se mueve al grado siguiente; un nuevo graduado pierde su matrícula destino).

Si el destino es el ciclo **Activo**, `Alumno.seccionId` se actualiza a la sección destino. `sincronizarMatricula` ya no revierte un estado final (Promovido/Repitente/Graduado) puesto por la promoción.

---

## 3. Tablas nuevas (aditivas)

- **`CierreCiclo`** (1 por ciclo, `cicloId` único → `Ciclo`): `cicloSiguiente`, `fecha`, `usuario`, `usuarioNombre`, totales (`facturado`, `cobrado`, `notasCredito`, `notasDebito`, `cobradoNeto`, `descuentos`, `pendiente`, `vencido`, `mora`, `moraPendiente`, `recibos`, `recibosAnulados`, `cargos`, `cargosPendientes`, `alumnosConDeuda`, `matriculas`) y `deudaAlumnos` (JSON).
- **`PromocionCiclo`** (una fila por aplicación): `cicloOrigenId`, `cicloDestinoId` (→ `Ciclo`), `fecha`, `usuario`, `parametros` (JSON), conteos (`evaluados`, `aprobados`, `reprobados`, `pendientes`, `graduados`, `sinSeccion`) y matrículas `creadas` / `ajustadas` / `sinCambios`.
- **`PromocionDetalle`** (por alumno y aplicación, cascada desde `PromocionCiclo`): `alumnoId` (→ `Alumno`), `resultado`, `promedio`, `reprobadas`, `incompletas`, `seccionOrigenId`, `seccionDestinoId`, `accion` (Promovido / Repitente / Graduado / Pendiente / SinCupo / Respetada), `matricula` (Creada / Ajustada / SinCambios / Retirada), `nota`.

Relaciones inversas añadidas (sin cambio de columnas): `Ciclo.cierre`, `Ciclo.promocionesOrigen`, `Ciclo.promocionesDestino`, `Alumno.promociones`. Instalaciones existentes: `pnpm --filter @stodia/api db:push` (aditivo; `pnpm dev` lo ejecuta al arrancar).

## 4. Auditoría

`SisAudit`: `CiclosLectivos` (cierre con sus totales), `TenantConfig/promocion` (parámetros antes/después), `PromocionCiclo` (cada aplicación con conteos y matrículas creadas/ajustadas).

## 5. Etapa B: reinscripción y cupos

Ver §6. Queda como **pendiente** (no incluido): crear cargo de reinscripción para quienes ya tenían una matrícula `Activo` en el destino sin pasar por la reinscripción (p. ej. promovidos antes de abrirla); trasladar los **servicios recurrentes** (comedor, transporte) al ciclo siguiente al confirmar; la acción «Reactivar» también desde el Expediente/Directorio (hoy solo en Configuración → Reinscripción); editar la fecha límite también desde la pestaña «Ciclos lectivos» (hoy en Reinscripción).

## 6. Reinscripción de alumnos existentes y política de cupo (Etapa B)

**Decisión de negocio**: el ciclo siguiente (p. ej. 2027–2028, *Planificado*) permite **inscribir y cobrar con anticipación** aunque el actual no esté cerrado. La reinscripción reserva el cupo de cada alumno vigente mediante el pago de una **cuota de reinscripción**; el Director decide con un check si no pagarla **pierde el cupo**.

| | |
|---|---|
| Dónde | Configuración → **Reinscripción** (política, fecha límite, «Abrir reinscripción», estado por alumno, exportación a Excel, «Reactivar») |
| API | `/reinscripcion`: `GET/PUT /config` · `PUT /limite` · `GET /preview` · `POST /abrir` · `GET /listado` · `POST /evaluar` · `POST /reactivar` (clave de supervisor) |
| Permiso | `requireScreen('config')` (Director / Super Admin) |
| Código | `apps/api/src/lib/reinscripcion.ts`, `apps/api/src/modules/reinscripcion/index.ts`, tipos `packages/shared/src/reinscripcion.ts`, web `screens/config/Reinscripcion.tsx`; prueba `apps/api/scripts/probar-reinscripcion.ts` |

### 6.1 Política (`SisConfig` clave `reinscripcion`, cambios auditados)

| Parámetro | Por defecto | Significado |
|---|---|---|
| `activa` | **false** | «Usar reinscripción». Apagada no se puede abrir (las reservas existentes se conservan). |
| `perdidaCupoPorFaltaDePago` | **false** | CHECK «Pérdida de cupo por falta de pago». **Apagado**: si la cuota vence solo se genera **mora** y el cupo queda **siempre asegurado**. **Activo**: pasada la fecha límite (+ gracia) el alumno pierde el cupo (§6.4). |
| `modo` / `cuotaReinscripcion` | `inscripcion` / 0 | `inscripcion` = la cuota de inscripción **vigente** (fija o por plan del contrato del alumno en el ciclo activo, según `finanzas.inscripcionModo`; con plan sin monto, el respaldo fijo); `propia` = un monto único de reinscripción. |
| `diasGracia` | 0 | Días tras la fecha límite antes de generar mora o liberar el cupo. |
| fecha límite | — | Por ciclo destino (tabla `CicloReinscripcion.limite`, ISO). Obligatoria y futura para abrir. Cambiarla mueve el vencimiento de las cuotas pendientes que seguían la fecha anterior (una prórroga individual no se pisa). |

### 6.2 Abrir la reinscripción (idempotente)

Ciclo destino = el **Planificado siguiente** al activo. Alumno vigente = `Alumno.estado = Activo` con matrícula `Activo` en el ciclo activo; se excluyen Retirado/Egresado/Inactivo/Preinscrito y quienes ya tienen matrícula (de cualquier estado) en el destino. Por cada uno, en **una transacción**:

1. `Matricula` en el destino con estado **`Reservado`** + fila en `ReinscripcionReserva` (marca explícita de reserva: la promoción no la trata como copia automática).
2. Cargo **«Cuota de reinscripción»**: `FinCobroItem` tipo **`reins`**, id determinista `reins-<ciclo>-<alumno>`, `cicloId` = destino, `vence` = fecha límite, monto según 6.1. Con cuota 0 la reserva queda **confirmada** (`Activo`) sin cargo. Se cobra en Cobros como cargo normal («anticipados»); sin pronto pago ni descuentos (solo `col`/`mora`).
3. Evento `Reserva` en `ReinscripcionEvento` y auditoría de la apertura (`Reinscripcion`).

**Sección provisional**: grado siguiente por `orden` (el mismo si es el último) con misma letra y tanda; si no cabe, la de esa tanda con menos carga, y si no, cualquiera del grado con cupo. **Nunca supera `Seccion.cap`** (`cap ≤ 0` = sin límite, como la promoción) contando todas las matrículas del destino salvo Retirado/Liberada. Quien no cabe **no se reserva** («Sin cupo» en la vista previa); al ampliar la capacidad se vuelve a abrir y solo se procesa a esos. Orden determinista (grado, sección, apellidos). Recomendación: **abrir antes de aplicar la promoción**; quienes ya fueron promovidos antes (matrícula `Activo` en el destino) no se reinscriben.

### 6.3 Estados de matrícula nuevos y cupos

`CK_Matricula_estado` admite además **`Reservado`** (cuenta cupo) y **`Liberada`** (no cuenta, como `Retirado`). `db-indices.ts` reemplaza el CHECK anterior de forma idempotente al arrancar la API (DROP + ADD si su definición no contiene «Liberada»).

La ocupación de un ciclo destino/planificado = matrículas `notIn [Retirado, Liberada]` (**incluye `Reservado`**) en `inscripcion` (`cargarCupos`), `academico.inscritosSeccion` y Catálogos; en el ciclo activo se cuenta por `Alumno.seccionId` sin quien tiene matrícula `Liberada` del ciclo activo. Un nuevo ingreso al planificado recibe **«Selecciona una sección con cupo»** si todo está reservado. `sincronizarMatricula` conserva `Reservado`/`Liberada`. El cierre del año alinea `Alumno.seccionId` también para las reservas pendientes (siguen `Reservado` hasta pagar).

### 6.4 Pagar, vencer, perder el cupo

- **Pagar por completo** la cuota en `POST /cobros/procesar` **confirma** (misma transacción): matrícula `Activo`, evento `Confirmada`, y se genera el **contrato y las cuotas de colegiatura** (+ materiales) del ciclo destino con el **mismo plan** del contrato anterior (ids `rei-<año>-<alumno>-…`; sin beca; **los servicios recurrentes no se trasladan**). Un abono parcial no confirma.
- **Mora** (`lib/mora.ts`): el cargo `reins` vencido (+ `diasGracia`) genera **una** mora (`mora-<id>`, ciclo destino, concepto «Recargo por mora · Reinscripción (…)») con el plan del contrato del ciclo activo; sin plan o «sin mora» usa `finanzas.recargoMoraPct`. Se genera aunque el ciclo destino aún sea Planificado. **No se genera si la pérdida de cupo está activa** (el cargo se anula).
- **Job diario** (`programarReinscripcion`: a los 25 s de arrancar y cada 6 h; se apaga con `REINSCRIPCION_PASADA_GLOBAL=0`; también el botón «Evaluar vencidas ahora»), idempotente, evalúa las reservas con cuota impaga vencida:
  - check **apagado**: no toca nada (cupo asegurado, solo mora);
  - check **activo** (y reinscripción activa): matrícula → **`Liberada`**, alumno `Activo` → **`Inactivo`** (no se toca a Retirado/Egresado), la **cuota y su mora se anulan** (se eliminan; si ya están referenciadas se marcan «Anulada»), el cupo vuelve a estar disponible para un nuevo ingreso. Evento `Liberada` con el motivo y auditoría resumida (`Reinscripcion/perdida-cupo`).
- **Reactivar** (Director, clave de supervisor; el Super Admin no la necesita): alumno `Inactivo` con matrícula `Liberada` → `Activo`, matrícula `Reservado` y **cuota nueva con 7 días** (no vuelve a perder el cupo al instante). Usa su sección si tiene cupo, otra del grado si no, y si no hay ninguna responde **409** «No hay cupo…» sin cambiar nada.
- Si pagan después de vencer pero antes de que corra el job, el pago se acepta y confirma (el job corre cada 6 h).

### 6.5 Promoción después de reservar (reconciliación)

`lib/promocion.ts` trata `Reservado` como matrícula **ajustable** (nunca se duplica): aprobado → su reserva ya está en el grado siguiente (*sin cambios*); **reprobado** → se mueve a su mismo grado (si no hay cupo, *SinCupo* y conserva la reserva provisional: revisión manual); pendiente de notas → no se mueve; último grado aprobado → la reserva sin pagar se **libera** (cupo + cuota; el alumno egresa por el cierre). La reserva conserva su estado (`Reservado`/`Activo`). Quienes están `Liberada` se **respetan** (no se les crea matrícula). Idempotente.

### 6.6 Tablas aditivas (Etapa B)

`ReinscripcionReserva` (1:1 con `Matricula`, marca de reserva), `ReinscripcionEvento` (historial: Reserva / Confirmada / Liberada / Reactivada, motivo, usuario) y `CicloReinscripcion` (fecha límite por ciclo). **Sin columnas nuevas en tablas existentes** (así una API ya en marcha no se rompe antes del `db:push`). Instalaciones existentes: `pnpm --filter @stodia/api db:push`. `CargoTipo` gana `'reins'`.

### 6.7 Verificación

`apps/api/scripts/probar-reinscripcion.ts` (solo contra una base `*_test` con la API arrancada): política, apertura, idempotencia, cap, cupo reservado vs nuevo ingreso, pago que confirma (y abono que no), fecha vencida con el check apagado (solo mora, cupo asegurado, alumno Activo) y activo (Inactivo, cupo liberado, un nuevo estudiante lo toma), gracia, reactivar (con y sin cupo), promoción que reconcilia (idempotente), job idempotente, cierre del año y pago con el ciclo ya activo.
