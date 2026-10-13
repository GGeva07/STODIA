# Selector de ciclo lectivo (Fase 2D)

El selector «Ciclo lectivo» de la barra lateral permite **ver información de años pasados**. Es estado global de la web (`apps/web/src/lib/ciclo.tsx`) y la API filtra por el ciclo pedido (`apps/api/src/lib/ciclo.ts`).

## Cómo funciona

- **Web**: `useCiclo()` → `{ cicloSeleccionado, ciclos, cicloActivo, esActivo, soloLectura, clave, cambiar(n), volverAlActivo(), refrescar() }`. Se guarda en `localStorage['stodia.ciclo']` (con try/catch) y se **valida contra la lista real** (`GET /config → ciclos`); si el guardado ya no existe o no es seleccionable, vuelve al activo. El contenido de la pantalla se remonta con `key={clave}` (`'activo'` mientras se ve el activo): recarga sus datos sin tocar cabecera ni barra lateral.
- **Cabecera `X-Ciclo`**: `lib/api.ts` la añade a **todas** las peticiones **solo** cuando el ciclo elegido NO es el activo (con el activo no se envía nada y la API se comporta como siempre). Va en ASCII con guion normal (`2025-2026`; las cabeceras HTTP no admiten «–»). La API también acepta `?ciclo=` y el id (`cic-2025-2026`). Ciclo inexistente → 404; sin ciclo activo → 409.
- **Selector**: lista los ciclos de `GET /config` con `(activo)` / `(cerrado)` / `(planificado)`. Un **Planificado solo es seleccionable si ya tiene datos** (`CfgCiclo.datos`: tiene matrículas); sin datos no hay nada que consultar. Selección distinta del activo → select en ámbar, banner pegajoso bajo la cabecera («Estás viendo el ciclo 2025–2026 · solo lectura» + «Volver al ciclo activo») y chip del ciclo en las migas de cada pantalla por ciclo.
- **Solo lectura**: todo ciclo que no es el activo es solo lectura. Web: `useSoloLectura()`, `slProps(sl)` y `<Mutating>` (`lib/ciclo.tsx`) deshabilitan la acción con tooltip «Ciclo cerrado: solo lectura». **Servidor**: hook global `preHandler` (`app.ts`) → `409 { code: 'CICLO_CERRADO', error: 'El ciclo 2025–2026 está cerrado: solo lectura. Vuelve al ciclo activo para modificar.' }` para todo POST/PUT/PATCH/DELETE sobre rutas por ciclo con `X-Ciclo`/`?ciclo=` de un ciclo Cerrado (un Planificado responde `CICLO_NO_ACTIVO`: las pantallas por ciclo solo escriben en el activo). Aunque se fuerce la cabecera con curl no se puede escribir. Las rutas por ciclo son `PREFIJOS_POR_CICLO`/`RUTAS_POR_CICLO` en `lib/ciclo.ts`; `POST /directorio/saldos` es lectura y queda libre.
- **App móvil / portal tutor**: no usan el selector; siempre el ciclo activo (`MobileLayout` limpia la cabecera). `/movil/*` y el Portal Tutor ignoran `X-Ciclo` (salvo `PUT /movil/lista`, que se bloquea en ciclo cerrado).

## Pantallas: ¿por ciclo?

| Pantalla / API | ¿Por ciclo? | Qué muestra con otro ciclo |
|---|---|---|
| Dashboard `/dashboard` | Sí | Matrícula = `Matricula` del ciclo; recaudo y barras = `FinRecibo` del ciclo por fecha, 6 meses hasta el último mes del ciclo; morosidad = saldo pendiente histórico del ciclo; proyección = lo contratado; asistencia = acumulado de `AsistenciaResumen`; sin alertas NCF/stock/e-CF. Solo el activo muestra las alertas operativas |
| Directorio `/directorio` | Sí | Alumnos con `Matricula` en ese ciclo, con la sección **de ese ciclo**; cuenta (mora/al día) y saldos del ciclo |
| Expediente `/expediente/:id` | Sí | Contrato, cargos, becas, servicios con cargos y plan del ciclo + `cicloDetalle` (notas por materia/período y asistencia resumida). El Historial académico siempre muestra todos los ciclos. 404 si el alumno no estuvo matriculado |
| Notas / Asistencia / Horarios | Sí | Asignaciones, horarios y períodos de ese ciclo; nómina = matrículas del ciclo en la sección. Asistencia de un ciclo cerrado = resumen (`AsistenciaResumen`), no hay pase de lista diario. Un ciclo cerrado abre en un período 4 / una sección con alumnos |
| Cobros / POS `/cobros/cuenta` | Sí | Cargos del ciclo; historial de turno solo en el activo (en otro ciclo, los recibos del tutor en ese ciclo) |
| Planes de pago | Sí (conteo) | Las plantillas no son por ciclo; «alumnos» = contratos del ciclo |
| Becas | Sí | `?periodo=` (la web envía el ciclo elegido) |
| Inscripción | Solo activo | En otro ciclo la pantalla avisa y el asistente queda deshabilitado |
| Tutores | Sí | Tutores con hijos matriculados en el ciclo; saldo del ciclo |
| Comunicaciones (destinatarios) | Sí | Destinatarios = alumnos matriculados en el ciclo. Enviar solo en el activo. La bandeja de salida NO es por ciclo |
| Extracurriculares | UI | Sin `cicloId` en la tabla; en otro ciclo solo lectura |
| **No son por ciclo** (ignoran `X-Ciclo`, siguen editables) | — | Catálogos, usuarios/accesos, licencia, configuración (también el cierre de ciclo), auditoría, comedor / alimentación / monedero, inventario / kiosko, PIN de supervisor, `/documentos/folios` |

## Deuda anterior (saldos de ciclos cerrados)

Desde el ciclo **activo**, `GET /cobros/cuenta` añade `deudaAnterior` (cargos sin pagar de ciclos Cerrados del tutor y sus hijos, con `ciclo`). El POS los muestra en una línea aparte («Deuda de ciclos anteriores») y son **cobrables**: `POST /cobros/procesar` acepta cargos del ciclo activo y de ciclos cerrados en el mismo cobro (ordena el ciclo más antiguo primero para los abonos). Cómo queda:

- El **cargo conserva su `cicloId`** (2025–2026) y pasa a `paid = true`; el saldo histórico del ciclo cerrado baja y su dashboard lo refleja.
- El **recibo se emite en el ciclo ACTIVO** (`FinRecibo.cicloId` = activo, fecha de hoy, NCF nuevo); sus líneas (`FinReciboItem.cobroItemId`) apuntan al cargo viejo. Es un recibo corriente: el recaudo del mes del ciclo activo lo incluye y se puede anular (el recibo es del ciclo activo; los recibos de ciclos cerrados siguen sin poder anularse).
- La deuda anterior **no** entra en la morosidad, el índice ni la proyección del ciclo activo (regla ya vigente: `cxcResumen` es del ciclo).
- Observación previa: anular un recibo emite la nota de crédito pero no reabre los cargos que cobró.

## Verificación (resumen)

Cifras con el ciclo activo, sin cabecera o con `X-Ciclo: 2026-2027`, idénticas a antes: 786 / 2,015,700 / 3,220,455 / ≈62.4 M / 14 / 2. Ciclo 2025–2026: 690 matrículas, recaudo de julio 2026 RD$ 600,000, barras feb–jul 4.4/3.9/5.6/2.0/1.2/0.6, contratado RD$ 65,287,000, saldo pendiente histórico RD$ 198,800 (13 cargos), Juan Mendoza en 4to A con 89.4.

## Cierre del año escolar (EOY) y promoción

El **cierre del año escolar** (Configuración → Ciclos lectivos → «Cerrar año escolar») es un cierre **contable y de edición**: guarda la foto financiera del ciclo en `CierreCiclo`, deja el ciclo **Cerrado** (solo lectura con el selector, 409 `CICLO_CERRADO` en el servidor) y activa el Planificado siguiente. **No promueve alumnos ni crea matrículas**; la deuda del ciclo cerrado se sigue cobrando desde el activo como «deuda anterior». La **promoción de curso** es un proceso aparte basado en la Matriz de Notas (Configuración → Promoción de curso, `/academico/promocion`). Detalle completo: [cierre-y-promocion.md](cierre-y-promocion.md).

La **reinscripción** de alumnos existentes (reserva de cupo en el ciclo Planificado, cuota de reinscripción cobrable como «anticipado», política de pérdida de cupo y job diario) está en [cierre-y-promocion.md](cierre-y-promocion.md) §6.
