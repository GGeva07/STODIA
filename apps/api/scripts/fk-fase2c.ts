/**
 * FASE 2C para INSTANCIAS YA EXISTENTES (SQLite o SQL Server): cierre de la base. Lo invoca scripts/fk-reparar.ts con --fase2c (o --auto). Idempotente y SIN BORRAR
 * datos de negocio; lo ambiguo se informa como BLOQUEANTE (exit 3 en --auto): nunca se inventa un dato.
 *
 * Secuencia (expandir -> rellenar -> contraer -> retirar), igual que las fases 2A y 2B:
 *   1. EXPANDIR: crea las 13 tablas nuevas (Ciclo, PeriodoAcademico, Matricula, AsistenciaResumen, TutorAlumno, FinReciboItem, FinReciboPago, FinPlanTanda,
 *      TipoDocumento, ServicioAlumno, Monedero, MonederoMovimiento, MobPagoIntencionCargo) y agrega las columnas NULLables (cicloId, periodoId, tipoId...).
 *      Tambien crea los Ciclo (desde SisConfig 'ciclos' + los nombres que ya usan Contrato.ciclo / FinBeca.periodo) y sus periodos: las fases anteriores los necesitan.
 *   2. RELLENAR:
 *      - cicloId de Contrato (texto), FinBeca (texto), PersInscripcion / FinRecibo (fecha de emision), FinCobroItem (fecha de vencimiento), AcadAsignacion / AcadHorario
 *        (ciclo activo) y AcadNota.periodoId ('1'..'4' del ciclo activo);
 *      - Matricula del ciclo activo de todo alumno (no Egresado) y TutorAlumno (Alumno.tutorId = Financiero, tutorLegalId = Legal, Academico segun Tutor.tipo);
 *      - FinReciboItem / FinReciboPago desde los JSON items / pays (las lineas historicas sin cargo quedan con cobroItemId NULL: se informan);
 *      - FinPlanTanda desde FinPlan.data.tm (y se quita tm del JSON); TipoDocumento desde SisConfig docsRequeridos + PersDocumento.n;
 *      - ServicioAlumno desde PersServicio (catKey rt:/ali:/ext:/prd: -> FK; claves heredadas por NOMBRE; si no hay catalogo, el servicio pasa a ser un producto);
 *      - Monedero (+ movimiento de consumo del dia) desde MobWallet y ComCarnet; MobPagoIntencionCargo desde `detalle`; MobPagoIntencion.resueltoPorId.
 *   3. CONTRAER: `prisma db push --accept-data-loss` (NOT NULL, FK, UNIQUE; elimina PersServicio, MobWallet, Catalogo y las columnas heredadas ya copiadas).
 *   4. RETIRAR/VERIFICAR: indices filtrados y CHECK (asegurarIndices) y comprobacion de que Catalogo ya no existe.
 */
import { cuenta, ejecutar, esSqlServer, filas, prisma, q, sinAcento, tablaExiste, tbl, tieneCol } from './fk-comun';
import { crearTabla, type Informe, type Paso } from './fk-fase2a';
import { FORMATO_CICLO, crearCiclo, nombreCiclo, y0DeHoy } from '../src/lib/ciclo';
import { reconciliarMatriculas } from '../src/lib/matricula';
import { reconciliarTutorAlumno } from '../src/lib/tutor-alumno';
import { fkDeCatKey } from '../src/lib/servicios';
import { venceISO } from '../src/lib/cxc';

const TABLAS_NUEVAS = ['Ciclo', 'PeriodoAcademico', 'Matricula', 'AsistenciaResumen', 'TutorAlumno', 'FinReciboItem', 'FinReciboPago', 'FinPlanTanda', 'TipoDocumento', 'ServicioAlumno', 'Monedero', 'MonederoMovimiento', 'MobPagoIntencionCargo'];
/** [tabla, columna, tipo SQL Server, tipo SQLite] agregadas NULLables a tablas que ya existen. */
const COLUMNAS_NUEVAS: [string, string, string, string][] = [
  ['FinCobroItem', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'], ['FinRecibo', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'], ['FinBeca', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['Contrato', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'], ['PersInscripcion', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadAsignacion', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['AcadHorario', 'cicloId', 'NVARCHAR(100) NULL', 'TEXT'], ['AcadNota', 'periodoId', 'NVARCHAR(100) NULL', 'TEXT'], ['PersDocumento', 'tipoId', 'NVARCHAR(100) NULL', 'TEXT'],
  ['MobPagoIntencion', 'resueltoPorId', 'NVARCHAR(100) NULL', 'TEXT'],
];
const trozos = <T>(l: T[], n = 400) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
const marcas = (n: number) => Array.from({ length: n }, () => '?').join(',');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const fechaDe = (v: unknown): string | null => { if (v == null) return null; const d = v instanceof Date ? v : new Date(typeof v === 'bigint' ? Number(v) : (v as string | number)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const json = <T,>(s: unknown, def: T): T => { try { const v = JSON.parse(String(s)); return v as T; } catch { return def; } };

/** true si la base es anterior a la Fase 2C (aun no existe Ciclo o el recibo todavia guarda sus lineas / pagos en JSON). */
export async function pendiente2c(): Promise<boolean> {
  if (!(await tablaExiste('Alumno'))) return false;
  return !(await tablaExiste('Ciclo')) || (await tieneCol('FinRecibo', 'items'));
}

// ---------------------------------------------------------------- EXPANDIR (+ ciclos)
export async function expandir2c(paso: Paso, informe: Informe) {
  for (const t of TABLAS_NUEVAS) await paso(`FASE 2C ESTRUCTURA: tabla ${t} (nueva)`, async () => ((await tablaExiste(t)) ? 0 : 1), async () => { await crearTabla(t); });
  for (const [t, c, ss, sl] of COLUMNAS_NUEVAS) {
    await paso(`FASE 2C ESTRUCTURA: ${t}.${c} (columna nueva NULLable)`, async () => ((await tablaExiste(t)) && !(await tieneCol(t, c)) ? 1 : 0), async () => {
      await ejecutar(`ALTER TABLE ${tbl(t)} ADD ${esSqlServer ? '' : 'COLUMN '}${q(c)} ${esSqlServer ? ss : sl}`);
    });
  }
  if (!(await tablaExiste('Ciclo'))) return;
  // ---- Ciclo: SisConfig 'ciclos' + nombres usados por los datos ----
  const cfg = await filas<{ valor: string }>(`SELECT valor FROM ${tbl('SisConfig')} WHERE clave = 'ciclos'`);
  const lista = cfg[0] ? json<{ n: string; estado: string }[]>(cfg[0].valor, []) : [];
  const usados = new Set<string>();
  if (await tieneCol('Contrato', 'ciclo')) for (const r of await filas<{ c: string }>(`SELECT DISTINCT ciclo AS c FROM ${tbl('Contrato')}`)) usados.add(nombreCiclo(r.c));
  if (await tieneCol('FinBeca', 'periodo')) for (const r of await filas<{ c: string }>(`SELECT DISTINCT periodo AS c FROM ${tbl('FinBeca')}`)) usados.add(nombreCiclo(r.c));
  const todos = new Map<string, string>(); // nombre -> estado
  for (const c of lista) todos.set(nombreCiclo(c.n), c.estado);
  for (const n of usados) if (n && !todos.has(n)) todos.set(n, 'Cerrado');
  const malos = [...todos.keys()].filter(n => !FORMATO_CICLO.test(n));
  if (malos.length) { informe.push({ paso: `Ciclos con nombre que no es «AAAA–AAAA» (${malos.slice(0, 3).join(', ')}) -> BLOQUEA`, filas: malos.length, estado: 'BLOQUEANTE' }); return; }
  const activos = [...todos].filter(([, e]) => e === 'Activo').map(([n]) => n);
  if (activos.length > 1) { informe.push({ paso: `Mas de un ciclo ACTIVO en SisConfig ciclos (${activos.join(', ')}) -> BLOQUEA: deja uno Activo`, filas: activos.length, estado: 'BLOQUEANTE' }); return; }
  if (!activos.length) { // sin ciclo activo: el del ano en curso (se crea si no existe)
    const n = `${y0DeHoy()}–${y0DeHoy() + 1}`; todos.set(n, 'Activo');
  }
  const hay = new Set((await prisma.ciclo.findMany({ select: { nombre: true } })).map(c => c.nombre));
  const faltan = [...todos].filter(([n]) => !hay.has(n));
  await paso(`Ciclo / PeriodoAcademico <- SisConfig ciclos y nombres usados (${faltan.map(([n, e]) => `${n} ${e}`).join(', ')})`, async () => faltan.length, async () => {
    for (const [n, e] of faltan.sort((a, b) => a[0].localeCompare(b[0]))) await crearCiclo(prisma, n, e as 'Planificado' | 'Activo' | 'Cerrado');
  });
  // Asignaciones y horarios son del ciclo ACTIVO: se asignan YA (la Fase 2A materializa asignaciones y necesita ver las existentes de este ciclo).
  const act = await prisma.ciclo.findFirst({ where: { estado: 'Activo' } });
  if (act) for (const t of ['AcadAsignacion', 'AcadHorario']) {
    await paso(`FASE 2C: ${t}.cicloId <- ciclo activo ${act.nombre} (antes de la Fase 2A/2B)`, async () => ((await tieneCol(t, 'cicloId')) ? cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} WHERE ${q('cicloId')} IS NULL`) : 0), async () => {
      await ejecutar(`UPDATE ${tbl(t)} SET ${q('cicloId')} = ? WHERE ${q('cicloId')} IS NULL`, act.id);
    });
  }
}

// ---------------------------------------------------------------- RELLENAR
export async function rellenar2c(paso: Paso, informe: Informe, opc: { aplicar: boolean }) {
  const info = (p: string, n: number, e = 'informativo') => informe.push({ paso: p, filas: n, estado: e });
  if (!(await tablaExiste('Ciclo')) || !(await tablaExiste('TipoDocumento'))) { info('FASE 2C: tablas nuevas aun no existen (ejecuta con --aplicar para expandir)', 0, 'pendiente'); return; }
  const ciclos = await prisma.ciclo.findMany();
  const activo = ciclos.find(c => c.estado === 'Activo');
  if (!activo) { info('FASE 2C: no hay ciclo activo todavia (ejecuta con --aplicar para expandir)', 0, 'pendiente'); return; }
  const porNombre = (n: string) => ciclos.find(c => c.nombre === nombreCiclo(n));
  const deFecha = (iso: string | null) => (iso ? ciclos.find(c => c.fechaInicio <= iso && iso <= c.fechaFin) : undefined);
  const idsEn = (n: number) => marcas(n);

  /** UPDATE <tabla> SET cicloId = ? WHERE id IN (...) agrupado por ciclo destino. */
  const asignar = async (tabla: string, col: string, destinos: Map<string, string[]>, clave = 'id') => {
    for (const [ciclo, ids] of destinos) for (const ch of trozos(ids)) await ejecutar(`UPDATE ${tbl(tabla)} SET ${q(col)} = ? WHERE ${q(clave)} IN (${idsEn(ch.length)})`, ciclo, ...ch);
  };

  // ---- cicloId por texto (Contrato.ciclo, FinBeca.periodo) ----
  for (const [tabla, legacy] of [['Contrato', 'ciclo'], ['FinBeca', 'periodo']] as const) {
    if (!(await tieneCol(tabla, legacy))) continue;
    const pend = await filas<{ id: string; t: string }>(`SELECT id, ${q(legacy)} AS t FROM ${tbl(tabla)} WHERE ${q('cicloId')} IS NULL`);
    const destinos = new Map<string, string[]>();
    for (const r of pend) { const c = porNombre(r.t); if (c) destinos.set(c.id, [...(destinos.get(c.id) ?? []), r.id]); }
    await paso(`${tabla}.cicloId <- ${tabla}.${legacy} (texto «AAAA–AAAA»)`, async () => [...destinos.values()].reduce((a, l) => a + l.length, 0), async () => { await asignar(tabla, 'cicloId', destinos); });
  }
  // ---- cicloId por fecha de emision (PersInscripcion, FinRecibo) ----
  for (const tabla of ['PersInscripcion', 'FinRecibo']) {
    const pend = await filas<{ id: string; f: unknown }>(`SELECT id, ${q('createdAt')} AS f FROM ${tbl(tabla)} WHERE ${q('cicloId')} IS NULL`);
    const destinos = new Map<string, string[]>(); let fuera = 0;
    for (const r of pend) { const c = deFecha(fechaDe(r.f)) ?? activo; if (!deFecha(fechaDe(r.f))) fuera++; destinos.set(c.id, [...(destinos.get(c.id) ?? []), r.id]); }
    await paso(`${tabla}.cicloId <- ciclo que contiene su fecha de emision`, async () => pend.length, async () => { await asignar(tabla, 'cicloId', destinos); });
    if (fuera) info(`${tabla}: ${fuera} fila(s) con fecha fuera del rango de todos los ciclos (se asignaron al ciclo activo)`, fuera);
  }
  // ---- FinCobroItem.cicloId por fecha de vencimiento (dd/mm/aaaa) ----
  {
    const pend = await filas<{ id: string; v: string }>(`SELECT id, vence AS v FROM ${tbl('FinCobroItem')} WHERE ${q('cicloId')} IS NULL`);
    const destinos = new Map<string, string[]>(); let fuera = 0;
    for (const r of pend) { const c = deFecha(venceISO(r.v ?? '')); if (!c) fuera++; const d = c ?? activo; destinos.set(d.id, [...(destinos.get(d.id) ?? []), r.id]); }
    await paso('FinCobroItem.cicloId <- ciclo que contiene su fecha de vencimiento', async () => pend.length, async () => { await asignar('FinCobroItem', 'cicloId', destinos); });
    if (fuera) info(`FinCobroItem: ${fuera} cargo(s) con vencimiento ilegible o fuera de todo ciclo (se asignaron al ciclo activo)`, fuera);
  }
  // ---- asignaciones y horarios: del ciclo activo ----
  for (const t of ['AcadAsignacion', 'AcadHorario']) {
    await paso(`${t}.cicloId <- ciclo activo (${activo.nombre})`, () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} WHERE ${q('cicloId')} IS NULL`), async () => { await ejecutar(`UPDATE ${tbl(t)} SET ${q('cicloId')} = ? WHERE ${q('cicloId')} IS NULL`, activo.id); });
  }
  // ---- AcadNota.periodoId ('1'..'4' del ciclo activo) ----
  if (await tieneCol('AcadNota', 'periodo')) {
    const per = new Map((await prisma.periodoAcademico.findMany({ where: { cicloId: activo.id } })).map(p => [String(p.orden), p.id]));
    const pend = await filas<{ p: string; n: unknown }>(`SELECT periodo AS p, COUNT(*) AS n FROM ${tbl('AcadNota')} WHERE ${q('periodoId')} IS NULL GROUP BY periodo`);
    await paso('AcadNota.periodoId <- periodo «1»..«4» del ciclo activo', async () => pend.filter(x => per.has(x.p)).reduce((a, x) => a + Number(x.n), 0), async () => {
      for (const x of pend.filter(y => per.has(y.p))) await ejecutar(`UPDATE ${tbl('AcadNota')} SET ${q('periodoId')} = ? WHERE periodo = ? AND ${q('periodoId')} IS NULL`, per.get(x.p), x.p);
    });
    const raras = pend.filter(x => !per.has(x.p));
    if (raras.length) info(`AcadNota con periodo fuera de 1..4 (${raras.map(r => r.p).join(', ')}) -> BLOQUEA db push (NOT NULL)`, raras.reduce((a, x) => a + Number(x.n), 0), 'BLOQUEANTE');
  }

  // ---- Matricula del ciclo activo y TutorAlumno ----
  const sinSeccion = (await tieneCol('Alumno', 'seccionId')) ? await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Alumno')} WHERE ${q('seccionId')} IS NULL OR ${q('tutorId')} IS NULL`) : 1;
  if (sinSeccion) info('Matricula / TutorAlumno omitidos: hay alumnos sin seccion o sin tutor financiero (resuelve la Fase 2A / Fase 1 primero)', sinSeccion, 'BLOQUEANTE');
  else {
    const faltanM = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Alumno')} a WHERE a.estado <> 'Egresado' AND NOT EXISTS (SELECT 1 FROM ${tbl('Matricula')} m WHERE m.${q('alumnoId')} = a.id AND m.${q('cicloId')} = ?)`, activo.id);
    await paso('Matricula <- Alumno (seccion y estado del ciclo activo; Retirado -> Retirado, Inactivo -> Activo)', async () => faltanM, async () => { await reconciliarMatriculas(); });
    const sinTutor = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Alumno')} a WHERE NOT EXISTS (SELECT 1 FROM ${tbl('TutorAlumno')} t WHERE t.${q('alumnoId')} = a.id AND t.${q('hasta')} IS NULL)`);
    await paso('TutorAlumno <- Alumno.tutorId (Financiero), tutorLegalId (Legal) y Tutor.tipo (Academico)', async () => sinTutor, async () => { await reconciliarTutorAlumno(); });
  }

  // ---- FinReciboItem / FinReciboPago desde los JSON del recibo ----
  if (await tieneCol('FinRecibo', 'items')) {
    const cobros = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('FinCobroItem')}`)).map(r => r.id));
    const metodos = await prisma.metodoPago.findMany({ select: { id: true, nombre: true } });
    const metodoDe = (m: string) => metodos.find(x => x.nombre === m)?.id ?? metodos.find(x => sinAcento(x.nombre) === sinAcento(m))?.id ?? (sinAcento(m) === 'tarjeta' ? metodos.find(x => sinAcento(x.nombre).startsWith('tarjeta de credito'))?.id : undefined);
    const sinLineas = await filas<{ id: string; items: string }>(`SELECT r.id, r.items FROM ${tbl('FinRecibo')} r WHERE NOT EXISTS (SELECT 1 FROM ${tbl('FinReciboItem')} i WHERE i.${q('reciboId')} = r.id)`);
    const lineas = sinLineas.flatMap(r => json<{ con: string; monto: number; cobroItemId?: string }[]>(r.items, []).map((l, orden) => ({ reciboId: r.id, orden, concepto: String(l.con ?? ''), monto: Number(l.monto) || 0, cobroItemId: l.cobroItemId && cobros.has(l.cobroItemId) ? l.cobroItemId : null })));
    await paso('FinReciboItem <- FinRecibo.items (JSON)', async () => lineas.length, async () => { for (const c of trozos(lineas)) await prisma.finReciboItem.createMany({ data: c }); });
    const sinCargo = lineas.filter(l => !l.cobroItemId).length;
    if (sinCargo) info('Lineas de recibo sin cargo de cartera (cobroItemId NULL permitido: reinscripciones, libros, meses anteriores al registro del vinculo)', sinCargo);
    const sinPagos = await filas<{ id: string; pays: string }>(`SELECT r.id, r.pays FROM ${tbl('FinRecibo')} r WHERE NOT EXISTS (SELECT 1 FROM ${tbl('FinReciboPago')} p WHERE p.${q('reciboId')} = r.id)`);
    const pagos: { reciboId: string; orden: number; metodoPagoId: string; monto: number; referencia: string }[] = [], malosM = new Set<string>();
    for (const r of sinPagos) json<{ m: string; r?: string; amt: number }[]>(r.pays, []).forEach((p, orden) => { const id = metodoDe(String(p.m)); if (!id) { malosM.add(String(p.m)); return; } pagos.push({ reciboId: r.id, orden, metodoPagoId: id, monto: Number(p.amt) || 0, referencia: String(p.r ?? '') }); });
    await paso('FinReciboPago <- FinRecibo.pays (JSON; medio de pago por nombre del catalogo)', async () => pagos.length, async () => { for (const c of trozos(pagos)) await prisma.finReciboPago.createMany({ data: c }); });
    if (malosM.size) info(`Pagos de recibo con un medio inexistente en el catalogo (${[...malosM].slice(0, 3).join(', ')}) -> BLOQUEA`, malosM.size, 'BLOQUEANTE');
    const vacios = sinPagos.filter(r => !json<unknown[]>(r.pays, []).length).length;
    if (vacios) info('Recibos sin ningun pago en el JSON (quedan sin FinReciboPago)', vacios);
  }

  // ---- FinPlanTanda desde FinPlan.data.tm ----
  {
    const tandas = await prisma.tanda.findMany({ select: { id: true, nombre: true } });
    const planes = await filas<{ id: string; data: string }>(`SELECT id, data FROM ${tbl('FinPlan')}`);
    const conTm = planes.filter(p => json<{ tm?: unknown }>(p.data, {}).tm !== undefined);
    const filasT: { planId: string; tandaId: string; monto: number }[] = [], malos: string[] = [];
    const hay = new Set((await filas<{ k: string }>(`SELECT ${q('planId')} AS k FROM ${tbl('FinPlanTanda')}`)).map(r => r.k));
    for (const p of conTm) for (const [nombre, v] of Object.entries(json<{ tm?: Record<string, string> }>(p.data, {}).tm ?? {})) {
      const t = tandas.find(x => x.nombre === nombre), monto = parseFloat(String(v));
      if (!Number.isFinite(monto) || String(v).trim() === '') continue; // importe vacio: no hay dato
      if (!t) { malos.push(`${p.id}:${nombre}`); continue; }
      if (!hay.has(p.id)) filasT.push({ planId: p.id, tandaId: t.id, monto });
    }
    await paso('FinPlanTanda <- FinPlan.data.tm (importe anual por tanda)', async () => filasT.length, async () => { await prisma.finPlanTanda.createMany({ data: filasT }); });
    if (malos.length) info(`FinPlan.tm con tandas inexistentes (${malos.slice(0, 3).join(', ')}) -> BLOQUEA`, malos.length, 'BLOQUEANTE');
    await paso('FinPlan.data: quitar `tm` del JSON (ya vive en FinPlanTanda)', async () => (malos.length ? 0 : conTm.length), async () => {
      for (const p of conTm) { const { tm: _tm, ...resto } = json<Record<string, unknown>>(p.data, {}); await ejecutar(`UPDATE ${tbl('FinPlan')} SET data = ? WHERE id = ?`, JSON.stringify(resto), p.id); }
    });
  }

  // ---- TipoDocumento desde SisConfig docsRequeridos + PersDocumento.n ----
  if (await tieneCol('PersDocumento', 'n')) {
    const cfgD = await filas<{ valor: string }>(`SELECT valor FROM ${tbl('SisConfig')} WHERE clave = 'docsRequeridos'`);
    const requeridos: string[] = cfgD[0] ? json<string[]>(cfgD[0].valor, []) : [];
    const usadosD = (await filas<{ n: string }>(`SELECT DISTINCT n FROM ${tbl('PersDocumento')}`)).map(r => r.n);
    const hayT = await prisma.tipoDocumento.findMany();
    const orden = [...new Set([...requeridos, ...usadosD])].filter(n => n.trim());
    const nuevos = orden.filter(n => !hayT.some(t => sinAcento(t.nombre) === sinAcento(n)));
    await paso(`TipoDocumento <- docsRequeridos y PersDocumento.n (${nuevos.slice(0, 4).join(', ')})`, async () => nuevos.length, async () => {
      const base = hayT.length;
      await prisma.tipoDocumento.createMany({ data: nuevos.map((nombre, i) => ({ id: `doc-${pad(base + i + 1)}`, nombre, requerido: requeridos.length ? requeridos.includes(nombre) : true, orden: orden.indexOf(nombre) })) });
    });
    const tipos = await prisma.tipoDocumento.findMany();
    const pend = await filas<{ n: string; c: unknown }>(`SELECT n, COUNT(*) AS c FROM ${tbl('PersDocumento')} WHERE ${q('tipoId')} IS NULL GROUP BY n`);
    await paso('PersDocumento.tipoId <- n (nombre del documento)', async () => pend.reduce((a, x) => a + Number(x.c), 0), async () => {
      for (const x of pend) { const t = tipos.find(y => sinAcento(y.nombre) === sinAcento(x.n)); if (t) await ejecutar(`UPDATE ${tbl('PersDocumento')} SET ${q('tipoId')} = ? WHERE n = ? AND ${q('tipoId')} IS NULL`, t.id, x.n); }
    });
    const dup = await cuenta(`SELECT COUNT(*) AS n FROM (SELECT ${q('alumnoId')}, n FROM ${tbl('PersDocumento')} GROUP BY ${q('alumnoId')}, n HAVING COUNT(*) > 1) d`);
    if (dup) info('PersDocumento repetido (alumno, tipo de documento) -> BLOQUEA el UNIQUE(alumnoId, tipoId)', dup, 'BLOQUEANTE');
  }

  // ---- ServicioAlumno desde PersServicio ----
  if (await tablaExiste('PersServicio')) {
    const ps = await filas<Record<string, unknown>>(`SELECT * FROM ${tbl('PersServicio')}`);
    const ya = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('ServicioAlumno')}`)).map(r => r.id));
    const [rutas, planes, extras, prods] = await Promise.all([prisma.rutaTransporte.findMany(), prisma.aliPlan.findMany(), prisma.acadExtra.findMany(), prisma.finProducto.findMany()]);
    const ex = { rt: new Set(rutas.map(r => r.id)), ali: new Set(planes.map(r => r.id)), ext: new Set(extras.map(r => r.id)), prd: new Set(prods.map(r => r.id)) };
    const porNombre = (n: string) => {
      const k = sinAcento(n), base = sinAcento(n.split(' · ')[0]);
      const hit = (xs: { id: string; nombre: string }[]) => { const c = xs.filter(x => sinAcento(x.nombre) === k || sinAcento(x.nombre) === base); return c.length === 1 ? c[0].id : null; };
      return { ali: hit(planes.map(p => ({ id: p.id, nombre: p.name }))), ext: hit(extras.map(p => ({ id: p.id, nombre: p.name }))), prd: hit(prods.map(p => ({ id: p.id, nombre: p.name }))), rt: hit(rutas.map(p => ({ id: p.id, nombre: p.nombre }))) };
    };
    const pend = ps.filter(r => !ya.has(String(r.id)));
    type Fk = { rutaId: string | null; aliPlanId: string | null; extraId: string | null; productoId: string | null };
    const resolver = (r: Record<string, unknown>): { fk?: Fk; crear?: string; mal?: string } => {
      const key = String(r.catKey ?? ''), pref = key.slice(0, key.indexOf(':'));
      if (r.rutaId) return { fk: { rutaId: String(r.rutaId), aliPlanId: null, extraId: null, productoId: null } };
      const f = fkDeCatKey(key);
      if (f) { const id = (f.rutaId ?? f.aliPlanId ?? f.extraId ?? f.productoId)!; return ex[pref as keyof typeof ex]?.has(id) ? { fk: f } : { mal: `${key} (el elemento del catalogo no existe)` }; }
      const nom = porNombre(String(r.name ?? ''));
      if (nom.ali) return { fk: { rutaId: null, aliPlanId: nom.ali, extraId: null, productoId: null } };
      if (nom.ext) return { fk: { rutaId: null, aliPlanId: null, extraId: nom.ext, productoId: null } };
      if (nom.prd) return { fk: { rutaId: null, aliPlanId: null, extraId: null, productoId: nom.prd } };
      if (nom.rt) return { fk: { rutaId: nom.rt, aliPlanId: null, extraId: null, productoId: null } };
      return { crear: String(r.name ?? '') };
    };
    const res = pend.map(r => ({ r, x: resolver(r) }));
    const malos = res.filter(v => v.x.mal), crear = [...new Set(res.filter(v => v.x.crear).map(v => v.x.crear!))];
    await paso(`CategoriaProducto «Servicios» + FinProducto <- servicios sin catalogo (${crear.slice(0, 3).join('; ')}): el servicio pasa a ser un producto del catalogo`, async () => crear.length, async () => {
      const cat = await prisma.categoriaProducto.upsert({ where: { nombre: 'Servicios' }, update: {}, create: { id: 'cat-servicios', nombre: 'Servicios' } });
      let n = (await prisma.finProducto.count()) + 1;
      for (const nombre of crear) {
        const costo = Number(ps.find(r => String(r.name ?? '') === nombre)?.cost) || 0;
        // SQL crudo: en una base sin contraer FinProducto aun tiene la columna heredada `cat` (NOT NULL) que el cliente nuevo no conoce.
        const cols = ['id', 'code', 'name', q('categoriaId'), 'price', 'tax', 'stock', 'icon', ...((await tieneCol('FinProducto', 'cat')) ? ['cat'] : [])];
        await ejecutar(`INSERT INTO ${tbl('FinProducto')} (${cols.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?${cols.length > 8 ? ', ?' : ''})`, `prd-srv-${pad(n, 3)}`, `SRV-${pad(n, 4)}`, nombre, cat.id, costo, 0, null, 'ph ph-certificate', ...(cols.length > 8 ? ['Servicios'] : []));
        n++;
      }
    });
    const prodsAhora = opc.aplicar ? await prisma.finProducto.findMany({ select: { id: true, name: true } }) : prods;
    const filasS = res.filter(v => !v.x.mal).map(({ r, x }) => {
      const fk: Fk = x.fk ?? { rutaId: null, aliPlanId: null, extraId: null, productoId: prodsAhora.find(p => p.name === x.crear)?.id ?? null };
      return { id: String(r.id), alumnoId: String(r.alumnoId), kind: String(r.kind), ...fk, name: String(r.name), icon: String(r.icon ?? ''), spec: String(r.spec ?? ''), cost: Number(r.cost), corte: String(r.corte ?? ''), est: String(r.est ?? 'Activo'), alert: String(r.alert ?? ''), fecha: String(r.fecha ?? ''), st: String(r.st ?? ''), mes: String(r.mes ?? ''), reciboId: (r.reciboId as string | null) ?? null };
    });
    await paso('ServicioAlumno <- PersServicio (catKey -> FK; claves heredadas por nombre del catalogo)', async () => filasS.length, async () => { for (const c of trozos(filasS, 200)) await prisma.servicioAlumno.createMany({ data: c }); });
    if (malos.length) info(`PersServicio con catKey hacia un elemento inexistente (${malos.slice(0, 3).map(v => v.x.mal).join('; ')}) -> BLOQUEA`, malos.length, 'BLOQUEANTE');
    const sinFk = filasS.filter(f => !f.rutaId && !f.aliPlanId && !f.extraId && !f.productoId).length;
    if (opc.aplicar && sinFk) info('ServicioAlumno sin ninguna FK de catalogo (CHECK de una sola no nula) -> BLOQUEA', sinFk, 'BLOQUEANTE');
  }

  // ---- Monedero unico desde MobWallet + ComCarnet ----
  if (await tablaExiste('MobWallet')) {
    const hayM = new Set((await filas<{ id: string }>(`SELECT ${q('alumnoId')} AS id FROM ${tbl('Monedero')}`)).map(r => r.id));
    const wallets = (await filas<{ alumnoId: string; saldo: unknown; limite: unknown }>(`SELECT ${q('alumnoId')}, saldo, limite FROM ${tbl('MobWallet')}`)).filter(w => !hayM.has(w.alumnoId));
    await paso('Monedero <- MobWallet (saldo y limite del tutor)', async () => wallets.length, async () => { await prisma.monedero.createMany({ data: wallets.map(w => ({ alumnoId: w.alumnoId, saldo: Number(w.saldo), limite: Number(w.limite) })) }); wallets.forEach(w => hayM.add(w.alumnoId)); });
  }
  if (await tieneCol('ComCarnet', 'wallet')) {
    const hayM = new Set((await filas<{ id: string }>(`SELECT ${q('alumnoId')} AS id FROM ${tbl('Monedero')}`)).map(r => r.id));
    const cs = await filas<{ alumnoId: string; wallet: unknown; limit: unknown; spent: unknown }>(`SELECT ${q('alumnoId')}, wallet, ${q('limit')} AS ${q('limit')}, spent FROM ${tbl('ComCarnet')} WHERE ${q('alumnoId')} IS NOT NULL`);
    const sinM = cs.filter(c => !hayM.has(c.alumnoId));
    await paso('Monedero <- ComCarnet (alumnos con carnet y sin monedero del tutor: saldo y limite del carnet)', async () => sinM.length, async () => { await prisma.monedero.createMany({ data: sinM.map(c => ({ alumnoId: c.alumnoId, saldo: Number(c.wallet), limite: Number(c.limit) })) }); });
    const divergen = cs.filter(c => hayM.has(c.alumnoId)).length;
    if (divergen) info('Alumnos con carnet Y monedero del tutor: se conserva el saldo/limite del MONEDERO DEL TUTOR (el del carnet era una segunda fuente)', divergen);
    const conGasto = cs.filter(c => Number(c.spent) > 0);
    const hayGasto = new Set((await filas<{ id: string }>(`SELECT DISTINCT ${q('alumnoId')} AS id FROM ${tbl('MonederoMovimiento')} WHERE tipo = 'Consumo'`)).map(r => r.id));
    const nuevosG = conGasto.filter(c => !hayGasto.has(c.alumnoId));
    await paso('MonederoMovimiento <- ComCarnet.spent (consumo del dia como movimiento Consumo)', async () => nuevosG.length, async () => {
      const m = new Map((await prisma.monedero.findMany()).map(x => [x.alumnoId, x.saldo]));
      await prisma.monederoMovimiento.createMany({ data: nuevosG.map(c => ({ alumnoId: c.alumnoId, tipo: 'Consumo', monto: -Number(c.spent), saldoDespues: m.get(c.alumnoId) ?? 0, concepto: 'Consumo del dia (migrado del carnet)' })) });
    });
  }

  // ---- MobPagoIntencion: detalle (JSON) -> MobPagoIntencionCargo; resueltoPor -> resueltoPorId ----
  if (await tieneCol('MobPagoIntencion', 'detalle')) {
    const cobros = new Set((await filas<{ id: string }>(`SELECT id FROM ${tbl('FinCobroItem')}`)).map(r => r.id));
    const hay = new Set((await filas<{ i: string }>(`SELECT DISTINCT ${q('intencionId')} AS i FROM ${tbl('MobPagoIntencionCargo')}`)).map(r => r.i));
    const ints = (await filas<{ id: string; detalle: string }>(`SELECT id, detalle FROM ${tbl('MobPagoIntencion')}`)).filter(i => !hay.has(i.id));
    const pares = ints.flatMap(i => [...new Set(json<string[]>(i.detalle, []))].filter(c => cobros.has(c)).map(cobroItemId => ({ intencionId: i.id, cobroItemId })));
    await paso('MobPagoIntencionCargo <- MobPagoIntencion.detalle (JSON de ids de cargo)', async () => pares.length, async () => { await prisma.mobPagoIntencionCargo.createMany({ data: pares }); });
  }
  if (await tieneCol('MobPagoIntencion', 'resueltoPor')) {
    await paso('MobPagoIntencion.resueltoPorId <- User por resueltoPor (usuario)', () => cuenta(`SELECT COUNT(*) AS n FROM ${tbl('MobPagoIntencion')} WHERE ${q('resueltoPorId')} IS NULL AND ${q('resueltoPor')} IN (SELECT usuario FROM ${tbl('User')})`), async () => {
      await ejecutar(`UPDATE ${tbl('MobPagoIntencion')} SET ${q('resueltoPorId')} = (SELECT MIN(u.id) FROM ${tbl('User')} u WHERE u.usuario = ${tbl('MobPagoIntencion')}.${q('resueltoPor')}) WHERE ${q('resueltoPorId')} IS NULL AND ${q('resueltoPor')} IN (SELECT usuario FROM ${tbl('User')})`);
    });
  }

  // ---- bloqueantes del contraer ----
  for (const [t, c] of [['FinCobroItem', 'cicloId'], ['FinRecibo', 'cicloId'], ['FinBeca', 'cicloId'], ['Contrato', 'cicloId'], ['PersInscripcion', 'cicloId'], ['AcadAsignacion', 'cicloId'], ['AcadHorario', 'cicloId'], ['AcadNota', 'periodoId'], ['PersDocumento', 'tipoId']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} WHERE ${q(c)} IS NULL`);
    if (n) info(`${t}.${c} NULL: no se pudo resolver -> BLOQUEA db push (NOT NULL)`, n, 'BLOQUEANTE');
  }
  for (const [t, c, p] of [['FinCobroItem', 'cicloId', 'Ciclo'], ['FinRecibo', 'cicloId', 'Ciclo'], ['FinBeca', 'cicloId', 'Ciclo'], ['Contrato', 'cicloId', 'Ciclo'], ['PersInscripcion', 'cicloId', 'Ciclo'], ['AcadAsignacion', 'cicloId', 'Ciclo'], ['AcadHorario', 'cicloId', 'Ciclo'], ['AcadNota', 'periodoId', 'PeriodoAcademico'], ['PersDocumento', 'tipoId', 'TipoDocumento']] as const) {
    if (!(await tieneCol(t, c))) continue;
    const n = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)} c WHERE c.${q(c)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${tbl(p)} p WHERE p.id = c.${q(c)})`);
    if (n) info(`${t}.${c} apunta a ${p} inexistente (huerfano) -> BLOQUEA db push (FK)`, n, 'BLOQUEANTE');
  }
  const dupInsc = await cuenta(`SELECT COUNT(*) AS n FROM (SELECT ${q('alumnoId')} FROM ${tbl('PersInscripcion')} GROUP BY ${q('alumnoId')}, ${q('cicloId')} HAVING COUNT(*) > 1) d`);
  if (dupInsc) info('PersInscripcion repetida (alumno, ciclo) -> BLOQUEA el UNIQUE(alumnoId, cicloId)', dupInsc, 'BLOQUEANTE');
  if (await tablaExiste('Catalogo')) {
    // Los tipos de 2A/2B los retiran sus propias fases tras el push; aqui solo cuentan los tipos que NINGUNA fase migra (se perderian).
    const migrados = ['grados', 'tandas', 'aulas', 'secciones', 'materias', 'rubricas', 'docentes', 'staff', 'cajas', 'rutas', 'becas', 'conceptosBeca', 'metodosPago', 'comidas', 'dietas', 'alergias'];
    const restan = await cuenta(`SELECT COUNT(*) AS n FROM ${tbl('Catalogo')} WHERE tipo NOT IN (${migrados.map(t => "'" + t + "'").join(',')})`);
    if (restan) info('La tabla Catalogo tiene filas de un tipo que ninguna fase migra (el db push la elimina y perderia esos datos)', restan, 'BLOQUEANTE');
  }
}

// ---------------------------------------------------------------- tras db push
/** Tras `prisma db push`: verifica que las tablas heredadas (Catalogo, PersServicio, MobWallet) ya no existen. Los indices filtrados y CHECK los crea asegurarIndices. */
export async function verificar2c(paso: Paso, informe: Informe) {
  void paso;
  for (const t of ['Catalogo', 'PersServicio', 'MobWallet']) if (await tablaExiste(t)) informe.push({ paso: `Tabla heredada ${t} sigue existiendo tras el db push (no esta en el schema)`, filas: await cuenta(`SELECT COUNT(*) AS n FROM ${tbl(t)}`), estado: 'BLOQUEANTE' });
}
