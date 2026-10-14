/**
 * PROMOCION / AVANCE DE CURSO basado en la MATRIZ DE NOTAS (proceso SEPARADO del cierre contable del año: lib/ciclo-cierre.ts).
 * Decision de negocio: «pasaran de curso los estudiantes que se encuentren dentro del RANGO SEGURO, configurable por el director (70 por ejemplo)».
 * Documentacion completa: docs/cierre-y-promocion.md.
 * Al APLICAR tambien congela el resultado de cada alumno en MatriculaResultado (fuente 'promocion': promedio, reprobadas, resultado, origen y destino; Informe «Movimientos del alumnado»).
 *
 * CALCULO (con los datos reales de la Matriz de Notas: AcadNota = roster × materia × PeriodoAcademico, columnas c1..c4 + ex, pesos de la rubrica):
 *  1) Nota FINAL de una materia en un PERIODO = la misma formula que la columna «Final» de la Matriz (apps/web/src/screens/notas → calc):
 *       prom = promedio PONDERADO de las competencias C1..C4 de la rubrica (pesos RubricaCriterio.peso; sin rubrica: 17.5 c/u + examen 30)
 *       final = prom × (1 − pesoEx) + ex × pesoEx, con pesoEx = peso del examen / suma de pesos. Si la rubrica no tiene examen, final = prom.
 *     Solo cuenta como final si TODAS las competencias (y el examen, si existe) tienen nota. Si falta alguna, el periodo esta INCOMPLETO.
 *  2) Nota final de la MATERIA en el ciclo = promedio simple de sus finales de periodo (redondeado a 1 decimal, como se muestra en el Expediente).
 *     Materia COMPLETA = tiene final en todos los periodos del ciclo (PeriodoAcademico del ciclo, 4 por defecto).
 *  3) PROMEDIO GENERAL del alumno = promedio simple de las notas finales de sus materias (1 decimal). Materia REPROBADA = final < notaMinima.
 *  4) Materias del alumno = las que su seccion tiene ASIGNADAS en el ciclo (AcadAsignacion: es lo que aparece en la Matriz de Notas de cada docente)
 *     ∪ las materias en las que el alumno tiene notas.
 *  5) RESULTADO (CfgPromocion, SisConfig 'promocion'):
 *       - 'Pendiente de notas': requiereTodosLosPeriodos = true y alguna materia esta incompleta; o (false) ninguna materia tiene nota final.
 *       - criterio 'promedio_general'   : Aprobado si promedio ≥ notaMinima.
 *       - criterio 'todas_las_materias' : Aprobado si ninguna materia esta por debajo de notaMinima.
 *       - criterio 'max_reprobadas'     : Aprobado si promedio ≥ notaMinima y materias reprobadas ≤ maxReprobadas.
 *       - en otro caso 'Reprobado'.
 *
 * APLICAR (transaccion por lotes, idempotente, auditada; registro en PromocionCiclo / PromocionDetalle):
 *  - Ciclo DESTINO = el ciclo siguiente al de origen por fecha (Planificado si la promocion va antes del cierre; Activo si va despues). Si ese
 *    ciclo esta Cerrado o no existe, no se puede aplicar.
 *  - Aprobado → grado siguiente por `orden` del catalogo (el ULTIMO grado por orden = egresa: matricula 'Graduado', Alumno 'Egresado' cuando el
 *    ciclo de origen ya no es el activo; si lo es, el cierre lo hace efectivo). Reprobado → mismo grado (repitente).
 *  - Seccion destino: misma letra y tanda; si no existe o no tiene cupo, la de esa tanda con menos carga; si no, cualquiera del grado con cupo.
 *    NUNCA sobrepasa Seccion.cap (carga = matriculas 'Activo' del ciclo destino). Sin cupo → 'SinCupo' (sin seccion asignada; lo resuelve la
 *    reinscripcion / reservas de la ETAPA B).
 *  - Matriculas ya existentes en el ciclo destino:
 *       · RESPETADA (no se toca) si esta en un grado distinto al de origen y no la puso una promocion anterior (pre-inscripcion, reserva, pase manual).
 *       · AJUSTABLE si esta en el mismo grado que el origen (copia automatica de lib/matricula.sincronizarMatricula tras el cierre) o la creo una
 *         promocion anterior: se reubica si hace falta (o se deja igual si ya esta en el grado correcto → SinCambios).
 *  - Matricula del ORIGEN: Promovido (Aprobado) / Repitente (Reprobado) / Graduado (ultimo grado aprobado) / vuelve a 'Activo' si queda Pendiente.
 *  - Si el destino es el ciclo ACTIVO: Alumno.seccionId ← seccion destino (invariante de lib/matricula.ts).
 *  - Pendiente de notas: no se mueve; queda listado para resolver.
 */
import type { AccionPromocion, CfgPromocion, CriterioPromocion, PromocionConteos, PromocionFila, PromocionMateria, PromocionPreview, ResultadoPromocion } from '@stodia/shared';
import { prisma } from '../db';
import { rubricaDe, type RubInfo } from './academico';
import { CicloError, type CicloRow } from './ciclo';
import { idMatricula } from './matricula';
import { guardarResultados, type FilaResultado } from './matricula-resultado';
import { liberarReservaTx } from './reinscripcion';
import { CFG_DEFAULTS, cfgGet } from './sisconfig';

const r1 = (n: number) => Math.round(n * 10) / 10;
const trozos = <T>(l: T[], n = 500) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));
export const CRITERIOS: CriterioPromocion[] = ['promedio_general', 'todas_las_materias', 'max_reprobadas'];

// ---------------------------------------------------------------- Parametros
export async function cfgPromocion(): Promise<CfgPromocion> {
  return { ...CFG_DEFAULTS.promocion, ...((await cfgGet('promocion')) ?? {}) };
}
/** Valida y normaliza los parametros recibidos (parciales sobre los actuales). Devuelve el texto del error si no son validos. */
export function normalizarCfg(cur: CfgPromocion, b: Partial<CfgPromocion>): CfgPromocion | string {
  const next = { ...cur };
  if (b.notaMinima !== undefined) {
    const v = Number(b.notaMinima);
    if (!Number.isFinite(v) || v < 0 || v > 100) return 'La nota mínima debe estar entre 0 y 100';
    next.notaMinima = r1(v);
  }
  if (b.criterio !== undefined) {
    if (!CRITERIOS.includes(b.criterio)) return 'Criterio inválido: promedio_general, todas_las_materias o max_reprobadas';
    next.criterio = b.criterio;
  }
  if (b.maxReprobadas !== undefined) {
    const v = Number(b.maxReprobadas);
    if (!Number.isInteger(v) || v < 0 || v > 30) return 'El máximo de materias reprobadas debe ser un entero entre 0 y 30';
    next.maxReprobadas = v;
  }
  if (b.requiereTodosLosPeriodos !== undefined) {
    if (typeof b.requiereTodosLosPeriodos !== 'boolean') return 'requiereTodosLosPeriodos debe ser true o false';
    next.requiereTodosLosPeriodos = b.requiereTodosLosPeriodos;
  }
  return next;
}

// ---------------------------------------------------------------- Ciclos origen / destino
type CicloLite = CicloRow;
async function ciclosOrdenados(): Promise<CicloLite[]> {
  return (await prisma.ciclo.findMany({ orderBy: [{ fechaInicio: 'asc' }, { nombre: 'asc' }] })) as CicloLite[];
}
/** Ciclo siguiente por fecha (destino de la promocion); null si no hay o si esta Cerrado (no admite matriculas nuevas). */
function destinoDe(origen: CicloLite, ciclos: CicloLite[]): CicloLite | null {
  const d = ciclos.find(c => c.fechaInicio > origen.fechaInicio) ?? null;
  return d && d.estado !== 'Cerrado' ? d : null;
}
/**
 * Origen por defecto: el ultimo ciclo CERRADO si su siguiente es el ACTIVO y aun tiene alumnos sin resolver (promocion despues del cierre o pendientes);
 * si no, el ciclo ACTIVO (promocion antes del cierre, hacia el Planificado siguiente).
 */
async function origenPorDefecto(ciclos: CicloLite[]): Promise<CicloLite> {
  const act = ciclos.find(c => c.estado === 'Activo');
  const cerrados = ciclos.filter(c => c.estado === 'Cerrado');
  const ult = cerrados[cerrados.length - 1];
  // con matriculas aun 'Activo' = sin resolver (sin promocion aplicada o con pendientes de notas); los ciclos promovidos por el cierre anterior no tienen ninguna
  if (ult && destinoDe(ult, ciclos)?.estado === 'Activo' && (await prisma.matricula.count({ where: { cicloId: ult.id, estado: 'Activo' } }))) return ult;
  if (act) return act;
  if (ult) return ult;
  throw new CicloError('No hay ciclos lectivos para evaluar', 409);
}
async function resolverCiclos(origenPedido?: string) {
  const ciclos = await ciclosOrdenados();
  const p = String(origenPedido ?? '').trim().replace('-', '–');
  const origen = p ? ciclos.find(c => c.nombre === p || c.id === p) : await origenPorDefecto(ciclos);
  if (!origen) throw new CicloError(`El ciclo lectivo «${origenPedido}» no existe`, 404);
  if (origen.estado === 'Planificado') throw new CicloError('Un ciclo planificado aún no tiene notas: elige el ciclo activo o uno cerrado', 400);
  const conMat = new Set((await prisma.matricula.groupBy({ by: ['cicloId'], _count: { _all: true } })).map(m => m.cicloId));
  const origenes = ciclos.filter(c => c.estado !== 'Planificado' && conMat.has(c.id)).map(c => c.nombre).reverse();
  return { origen, destino: destinoDe(origen, ciclos), origenes };
}

// ---------------------------------------------------------------- Notas
export async function rubricas(): Promise<{ rubricaDeMateria: Map<string, RubInfo> }> {
  const rubs = await prisma.rubrica.findMany({ where: { estado: 'Activo' }, include: { criterios: { orderBy: { orden: 'asc' } }, materias: { select: { id: true } } } });
  const rubricaDeMateria = new Map<string, RubInfo>();
  for (const r of rubs) for (const m of r.materias) rubricaDeMateria.set(m.id, { nombre: r.nombre, minimo: r.minimo, criterios: r.criterios.map(c => ({ nombre: c.nombre, peso: c.peso, clave: c.clave })) });
  return { rubricaDeMateria };
}
type NotaRow = { c1: number | null; c2: number | null; c3: number | null; c4: number | null; ex: number | null };
/** Final de un periodo (formula de la columna «Final» de la Matriz). null = periodo incompleto. */
export function finalPeriodo(n: NotaRow | undefined, comps: ReturnType<typeof rubricaDe>['comps']): number | null {
  if (!n) return null;
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v >= 0 && v <= 100;
  const cs = comps.filter(c => c.k !== 'EX'), ex = comps.find(c => c.k === 'EX');
  if (!cs.length || !cs.every(c => ok(n[c.field]))) return null;
  const wsum = cs.reduce((a, c) => a + c.w, 0);
  const prom = wsum ? cs.reduce((a, c) => a + (n[c.field] as number) * c.w, 0) / wsum : cs.reduce((a, c) => a + (n[c.field] as number), 0) / cs.length;
  if (!ex) return prom;
  if (!ok(n.ex)) return null;
  const exW = ex.w / (comps.reduce((a, c) => a + c.w, 0) || 100);
  return prom * (1 - exW) + n.ex * exW;
}

// ---------------------------------------------------------------- Evaluacion + plan
interface Plan {
  fila: PromocionFila;
  origenMatId: string; origenEstado: string; alumnoEstado: string;
  destMat: { id: string; seccionId: string; reserva: boolean; estado: string } | null;
  /** Que hacer con la matricula destino al aplicar ('liberar' = reserva de reinscripcion de quien egresa: matricula Liberada + cargo anulado). */
  op: 'crear' | 'mover' | 'nada' | 'borrar' | 'liberar';
}
interface Evaluacion { preview: PromocionPreview; planes: Plan[]; origen: CicloLite; destino: CicloLite | null }

const ordenSec = (s: { letra: string; tanda: string }) => `${s.letra}|${s.tanda}`;

export async function evaluarPromocion(origenPedido?: string, cfgOverride?: CfgPromocion): Promise<Evaluacion> {
  const { origen, destino, origenes } = await resolverCiclos(origenPedido);
  const cfg = cfgOverride ?? await cfgPromocion();
  const [mats, periodos, grados, secciones, rub, asigs, ultimaProm] = await Promise.all([
    prisma.matricula.findMany({
      where: { cicloId: origen.id, estado: { not: 'Retirado' }, alumno: { estado: { notIn: ['Retirado'] } } },
      select: { id: true, estado: true, seccionId: true, alumno: { select: { id: true, code: true, nombres: true, apellidos: true, estado: true, rosters: { select: { id: true } } } } },
    }),
    prisma.periodoAcademico.findMany({ where: { cicloId: origen.id }, orderBy: { orden: 'asc' }, select: { id: true } }),
    prisma.grado.findMany({ orderBy: { orden: 'asc' }, include: { nivel: { select: { nombre: true } } } }),
    prisma.seccion.findMany({ include: { tanda: { select: { nombre: true } } } }),
    rubricas(),
    prisma.acadAsignacion.findMany({ where: { cicloId: origen.id }, select: { seccionId: true, materiaId: true } }),
    prisma.promocionCiclo.findFirst({ where: { cicloOrigenId: origen.id }, orderBy: { id: 'desc' } }),
  ]);
  const gradoMap = new Map(grados.map(g => [g.id, g])), secMap = new Map(secciones.map(s => [s.id, s]));
  const gradosAct = grados.filter(g => g.estado === 'Activo');
  const ultimo = gradosAct[gradosAct.length - 1] ?? null;
  const siguienteGrado = (orden: number) => gradosAct.find(g => g.orden > orden) ?? null;
  const materiasSec = new Map<string, Set<string>>();
  for (const a of asigs) { const s = materiasSec.get(a.seccionId) ?? new Set<string>(); s.add(a.materiaId); materiasSec.set(a.seccionId, s); }
  const rosterDe = new Map<string, string>();
  for (const m of mats) for (const r of m.alumno.rosters) rosterDe.set(r.id, m.alumno.id);
  const perIdx = new Map(periodos.map((p, i) => [p.id, i]));
  const notas = rosterDe.size && periodos.length
    ? (await Promise.all(trozos([...rosterDe.keys()], 1000).map(ids => prisma.acadNota.findMany({ where: { rosterId: { in: ids }, periodoId: { in: periodos.map(p => p.id) } }, select: { rosterId: true, materiaId: true, periodoId: true, c1: true, c2: true, c3: true, c4: true, ex: true } })))).flat()
    : [];
  // alumno -> materia -> [nota por periodo]
  const porAlumno = new Map<string, Map<string, (NotaRow | undefined)[]>>();
  for (const n of notas) {
    const al = rosterDe.get(n.rosterId)!;
    const mm = porAlumno.get(al) ?? new Map<string, (NotaRow | undefined)[]>();
    const arr = mm.get(n.materiaId) ?? new Array(periodos.length).fill(undefined);
    arr[perIdx.get(n.periodoId)!] = n;
    mm.set(n.materiaId, arr); porAlumno.set(al, mm);
  }
  const materiaIds = new Set<string>([...asigs.map(a => a.materiaId), ...notas.map(n => n.materiaId)]);
  const materias = new Map((await prisma.materia.findMany({ where: { id: { in: [...materiaIds] } }, select: { id: true, nombre: true } })).map(m => [m.id, m.nombre]));
  const compsDe = new Map<string, ReturnType<typeof rubricaDe>['comps']>();
  const comps = (id: string) => { let c = compsDe.get(id); if (!c) { c = rubricaDe(rub, id).comps; compsDe.set(id, c); } return c; };

  // ---- 1) Evaluacion academica
  type Eval = { m: (typeof mats)[number]; fila: PromocionFila };
  const evals: Eval[] = mats.map(m => {
    const a = m.alumno, sec = secMap.get(m.seccionId)!, g = gradoMap.get(sec.gradoId)!;
    const mm = porAlumno.get(a.id) ?? new Map<string, (NotaRow | undefined)[]>();
    const ids = new Set<string>([...(materiasSec.get(m.seccionId) ?? []), ...mm.keys()]);
    const detalle: PromocionMateria[] = [...ids].map(id => {
      const cs = comps(id), per = (mm.get(id) ?? new Array(periodos.length).fill(undefined)).map(n => { const f = finalPeriodo(n, cs); return f == null ? null : r1(f); });
      const vals = per.filter((v): v is number => v != null);
      const final = vals.length ? r1(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
      return { materiaId: id, materia: materias.get(id) ?? id, final, periodos: per, completa: periodos.length > 0 && vals.length === periodos.length, reprobada: final != null && final < cfg.notaMinima };
    }).sort((x, y) => x.materia.localeCompare(y.materia, 'es'));
    const finales = detalle.filter(d => d.final != null).map(d => d.final as number);
    const promedio = finales.length ? r1(finales.reduce((x, y) => x + y, 0) / finales.length) : null;
    const incompletas = detalle.filter(d => !d.completa).length, reprobadas = detalle.filter(d => d.reprobada).length;
    let resultado: ResultadoPromocion;
    if (promedio == null || !detalle.length || (cfg.requiereTodosLosPeriodos && incompletas > 0)) resultado = 'Pendiente de notas';
    else if (cfg.criterio === 'todas_las_materias') resultado = reprobadas === 0 ? 'Aprobado' : 'Reprobado';
    else if (cfg.criterio === 'max_reprobadas') resultado = promedio >= cfg.notaMinima && reprobadas <= cfg.maxReprobadas ? 'Aprobado' : 'Reprobado';
    else resultado = promedio >= cfg.notaMinima ? 'Aprobado' : 'Reprobado';
    const fila: PromocionFila = {
      alumnoId: a.id, code: a.code, nombre: `${a.apellidos}, ${a.nombres}`.trim(), gradoId: g.id, grado: g.nombre, gradoOrden: g.orden, nivel: g.nivel.nombre, seccionId: sec.id,
      seccion: `${g.nombre} ${sec.letra}`, tanda: sec.tanda.nombre, promedio, materias: detalle.length, reprobadas, incompletas, resultado,
      accion: 'Pendiente', destino: null, destinoId: null, nota: '', detalle,
    };
    return { m, fila };
  });

  // ---- 2) Plan de matriculas en el ciclo destino
  const destMats = destino ? await prisma.matricula.findMany({ where: { cicloId: destino.id }, select: { id: true, alumnoId: true, seccionId: true, estado: true, reinscripcion: { select: { matriculaId: true } } } }) : [];
  const destDe = new Map(destMats.map(d => [d.alumnoId, d]));
  // Secciones que puso una promocion anterior (solo Promovido / Repitente: una matricula «Respetada» sigue siendo ajena aunque quede registrada).
  const previas = destino ? await prisma.promocionDetalle.findMany({ where: { promocion: { cicloOrigenId: origen.id, cicloDestinoId: destino.id }, accion: { in: ['Promovido', 'Repitente'] } }, orderBy: { id: 'asc' }, select: { alumnoId: true, seccionDestinoId: true } }) : [];
  const puestaPorPromocion = new Map(previas.map(p => [p.alumnoId, p.seccionDestinoId]));
  const evaluados = new Set(evals.map(e => e.fila.alumnoId));
  const label = (sid: string) => { const s = secMap.get(sid); return s ? `${gradoMap.get(s.gradoId)?.nombre ?? ''} ${s.letra}`.trim() : sid; };
  const planes: Plan[] = [];
  const carga = new Map<string, number>();
  const suma = (sid: string, d: number) => carga.set(sid, (carga.get(sid) ?? 0) + d);
  // carga fija: matriculas activas del destino de alumnos NO evaluados (pre-inscritos nuevos, etc.)
  for (const d of destMats) if ((d.estado === 'Activo' || d.estado === 'Reservado') && !evaluados.has(d.alumnoId)) suma(d.seccionId, 1);
  const movers: { plan: Plan; gradoDestino: string; sec: (typeof secciones)[number] }[] = [];
  for (const { m, fila } of evals) {
    const dm = destDe.get(fila.alumnoId);
    // 'Reservado' = reserva de reinscripcion (Etapa B): se concilia como una matricula ajustable (nunca se trata como copia automatica ni se duplica).
    const destMat = dm && (dm.estado === 'Activo' || dm.estado === 'Reservado') ? { id: dm.id, seccionId: dm.seccionId, reserva: !!dm.reinscripcion, estado: dm.estado } : null;
    const plan: Plan = { fila, origenMatId: m.id, origenEstado: m.estado, alumnoEstado: m.alumno.estado, destMat, op: 'nada' };
    planes.push(plan);
    const secO = secMap.get(fila.seccionId)!;
    const gradoDestMat = destMat ? secMap.get(destMat.seccionId)?.gradoId : undefined;
    const ajustable = !!destMat && (gradoDestMat === secO.gradoId || puestaPorPromocion.get(fila.alumnoId) === destMat.seccionId || destMat.reserva);
    if (destino && dm && !destMat) { // matricula destino Retirado / Liberada (u otro estado final): no se toca ni se duplica
      fila.accion = 'Respetada'; fila.destino = label(dm.seccionId); fila.destinoId = dm.seccionId; fila.nota = `Tiene matrícula ${dm.estado} en ${destino.nombre}: se respeta`;
      continue;
    }
    if (!destino) { fila.accion = fila.resultado === 'Pendiente de notas' ? 'Pendiente' : fila.resultado === 'Aprobado' ? (siguienteGrado(fila.gradoOrden) ? 'Promovido' : 'Graduado') : 'Repitente'; fila.nota = 'No hay ciclo destino: crea el ciclo siguiente para aplicar'; if (destMat) suma(destMat.seccionId, 1); continue; }
    if (fila.resultado === 'Pendiente de notas') {
      fila.accion = 'Pendiente'; fila.nota = fila.incompletas ? `${fila.incompletas} materia(s) sin nota final en todos los períodos` : 'Sin notas registradas';
      if (destMat) { suma(destMat.seccionId, 1); fila.destino = label(destMat.seccionId); fila.destinoId = destMat.seccionId; }
      continue;
    }
    const sig = fila.resultado === 'Aprobado' ? siguienteGrado(fila.gradoOrden) : gradoMap.get(secO.gradoId)!;
    if (destMat && !ajustable) { // pre-inscripcion / reserva / pase manual: se respeta
      fila.accion = 'Respetada'; fila.destino = label(destMat.seccionId); fila.destinoId = destMat.seccionId; fila.nota = `Ya matriculado en ${label(destMat.seccionId)} (${destino.nombre}): se respeta`;
      suma(destMat.seccionId, 1); continue;
    }
    if (!sig) { // ultimo grado aprobado: egresa
      fila.accion = 'Graduado'; fila.nota = 'Último grado aprobado: egresa';
      if (destMat) { // copia automatica en el grado de origen: se retira del ciclo destino; una RESERVA de reinscripcion sin pagar se libera (cupo + cargo)
        if (destMat.reserva) { if (destMat.estado === 'Reservado') plan.op = 'liberar'; else fila.nota += ' · pagó la reinscripción: revisa su matrícula en el ciclo destino'; } else plan.op = 'borrar';
      }
      continue;
    }
    if (destMat && gradoDestMat === sig.id) { // ya esta en el grado que corresponde (promocion anterior o repitente en su grado)
      fila.accion = fila.resultado === 'Aprobado' ? 'Promovido' : 'Repitente'; fila.destino = label(destMat.seccionId); fila.destinoId = destMat.seccionId; fila.nota = 'Sin cambios: ya matriculado en el grado que corresponde';
      suma(destMat.seccionId, 1); continue;
    }
    movers.push({ plan, gradoDestino: sig.id, sec: secO });
  }
  // movers en orden determinista: grado, seccion, apellidos (mismo resultado en vista previa y al aplicar)
  movers.sort((x, y) => x.plan.fila.gradoOrden - y.plan.fila.gradoOrden || x.plan.fila.seccion.localeCompare(y.plan.fila.seccion) || x.plan.fila.nombre.localeCompare(y.plan.fila.nombre, 'es'));
  const activasDe = (gid: string) => secciones.filter(s => s.gradoId === gid && s.estado === 'Activo').sort((p, q) => ordenSec({ letra: p.letra, tanda: p.tandaId }).localeCompare(ordenSec({ letra: q.letra, tanda: q.tandaId })));
  const cupo = (s: (typeof secciones)[number]) => s.cap <= 0 || (carga.get(s.id) ?? 0) < s.cap;
  for (const { plan, gradoDestino, sec } of movers) {
    const f = plan.fila, cand = activasDe(gradoDestino);
    const menor = (l: typeof cand) => [...l].filter(cupo).sort((p, q) => (carga.get(p.id) ?? 0) - (carga.get(q.id) ?? 0))[0];
    const misma = cand.find(s => s.letra === sec.letra && s.tandaId === sec.tandaId);
    const dest = (misma && cupo(misma) ? misma : undefined) ?? menor(cand.filter(s => s.tandaId === sec.tandaId)) ?? menor(cand);
    f.accion = f.resultado === 'Aprobado' ? 'Promovido' : 'Repitente';
    if (!dest) {
      f.accion = 'SinCupo';
      const g = gradoMap.get(gradoDestino)?.nombre ?? '';
      f.nota = cand.length ? `Sin cupo en ${g} (${cand.map(s => `${s.letra} ${carga.get(s.id) ?? 0}/${s.cap}`).join(', ')}): sin sección asignada` : `${g} no tiene secciones activas: sin sección asignada`;
      if (plan.destMat) f.nota += ` · conserva su matrícula actual en ${label(plan.destMat.seccionId)}`;
      continue;
    }
    suma(dest.id, 1);
    f.destino = label(dest.id); f.destinoId = dest.id;
    plan.op = plan.destMat ? 'mover' : 'crear';
    if (misma && dest.id !== misma.id) f.nota = cupo(misma) ? `${label(misma.id)} en otra tanda` : `${label(misma.id)} sin cupo (cap ${misma.cap}): asignado a ${label(dest.id)}`;
    if (!misma) f.nota = `No existe ${gradoMap.get(gradoDestino)?.nombre ?? ''} ${sec.letra} en la misma tanda: asignado a ${label(dest.id)}`;
  }
  const filas = planes.map(p => p.fila).sort((x, y) => x.gradoOrden - y.gradoOrden || x.seccion.localeCompare(y.seccion) || x.nombre.localeCompare(y.nombre, 'es'));
  const conteos: PromocionConteos = {
    evaluados: filas.length, aprobados: filas.filter(f => f.resultado === 'Aprobado').length, reprobados: filas.filter(f => f.resultado === 'Reprobado').length,
    pendientes: filas.filter(f => f.resultado === 'Pendiente de notas').length, graduados: filas.filter(f => f.accion === 'Graduado').length,
    sinSeccion: filas.filter(f => f.accion === 'SinCupo').length, respetadas: filas.filter(f => f.accion === 'Respetada').length,
  };
  // Ciclo ya promovido por el cierre ANTERIOR (que promovia automaticamente): todas sus matriculas estan en estado final y no hay registro de promocion.
  const legado = !ultimaProm && mats.length > 0 && !mats.some(m => m.estado === 'Activo');
  const bloqueo = !destino ? `No hay un ciclo abierto después de ${origen.nombre}: crea el ciclo siguiente en Ciclos lectivos para poder aplicar.`
    : legado ? `${origen.nombre} ya fue promovido por el cierre de año anterior (sus matrículas ya están en Promovido / Repitente / Graduado): solo consulta.` : undefined;
  const preview: PromocionPreview = {
    origen: origen.nombre, origenEstado: origen.estado, destino: destino?.nombre ?? null, destinoEstado: destino?.estado ?? null, origenes, periodos: periodos.length, cfg, ...(bloqueo ? { bloqueo } : {}),
    ultimoGrado: ultimo?.nombre ?? null, conteos, filas,
    ...(ultimaProm ? { ultima: { fecha: ultimaProm.fecha.toISOString(), usuario: ultimaProm.usuario, aprobados: ultimaProm.aprobados, reprobados: ultimaProm.reprobados, pendientes: ultimaProm.pendientes, graduados: ultimaProm.graduados, sinSeccion: ultimaProm.sinSeccion } } : {}),
  };
  return { preview, planes, origen, destino };
}

// ---------------------------------------------------------------- Aplicar
let enCurso = false;
/** Error de negocio con su codigo HTTP (`statusCode`: el manejador global de app.ts responde { error } con ese codigo). */
export class PromocionError extends Error { constructor(message: string, public statusCode = 400) { super(message); } }

export interface ResultadoAplicar { id: number; conteos: PromocionConteos; creadas: number; ajustadas: number; sinCambios: number }

/** Aplica la promocion (ver cabecera). `esperado`: conteos de la vista previa que vio el usuario; si difieren → 409 (los datos cambiaron). */
export async function aplicarPromocion(origenPedido: string | undefined, usuario: string, esperado?: Partial<PromocionConteos>): Promise<ResultadoAplicar> {
  if (enCurso) throw new PromocionError('Ya hay una promoción en curso; espera a que termine', 409);
  enCurso = true;
  try {
    const { preview, planes, origen, destino } = await evaluarPromocion(origenPedido);
    if (!destino || preview.bloqueo) throw new PromocionError(preview.bloqueo ?? 'No hay ciclo destino', 400);
    if (esperado) for (const k of Object.keys(esperado) as (keyof PromocionConteos)[]) {
      if (esperado[k] !== undefined && esperado[k] !== preview.conteos[k]) throw new PromocionError('Los datos cambiaron desde la vista previa (notas o matrículas). Vuelve a evaluar antes de aplicar.', 409);
    }
    const origenActivo = origen.estado === 'Activo', destinoActivo = destino.estado === 'Activo';
    const estadoOrigen = (p: Plan) => p.fila.resultado === 'Pendiente de notas' ? 'Activo' : p.fila.accion === 'Graduado' ? 'Graduado' : p.fila.resultado === 'Aprobado' ? 'Promovido' : 'Repitente';
    const crear = planes.filter(p => p.op === 'crear'), mover = planes.filter(p => p.op === 'mover'), borrar = planes.filter(p => p.op === 'borrar'), liberar = planes.filter(p => p.op === 'liberar');
    // Una matricula destino con asistencias registradas no se borra (FK de AsistenciaResumen): se deja y se informa.
    const conAsis = borrar.length ? new Set((await prisma.asistenciaResumen.findMany({ where: { matriculaId: { in: borrar.map(p => p.destMat!.id) } }, select: { matriculaId: true }, distinct: ['matriculaId'] })).map(a => a.matriculaId)) : new Set<string>();
    for (const p of borrar) if (conAsis.has(p.destMat!.id)) { p.op = 'nada'; p.fila.nota += ` · conserva su matrícula en ${destino.nombre} (tiene asistencias): revísala`; }
    const cambiosOrigen = planes.filter(p => p.origenEstado !== estadoOrigen(p));
    const egresan = planes.filter(p => p.fila.accion === 'Graduado' && !origenActivo && ['Activo', 'Inactivo'].includes(p.alumnoEstado));
    const reactivar = planes.filter(p => p.fila.accion !== 'Graduado' && p.alumnoEstado === 'Egresado'); // corregido tras una promocion anterior
    const seccionActiva = destinoActivo ? planes.filter(p => p.fila.destinoId && p.fila.accion !== 'Pendiente') : [];
    const fechaIngreso = destino.fechaInicio;
    const gradoDe = new Map((await prisma.seccion.findMany({ select: { id: true, gradoId: true } })).map(x => [x.id, x.gradoId]));
    // Resultado congelado por matricula (MatriculaResultado): promedio y destino reales de esta aplicacion.
    const resultados: FilaResultado[] = planes.map(p => {
      const f = p.fila, sinDestino = f.accion === 'Graduado' || f.accion === 'SinCupo' || f.accion === 'Pendiente', ds = sinDestino ? null : f.destinoId;
      return {
        matriculaId: p.origenMatId, alumnoId: f.alumnoId, cicloId: origen.id, promedio: f.promedio, materiasReprobadas: f.reprobadas,
        resultado: f.accion === 'Graduado' ? 'Graduado' : f.resultado === 'Aprobado' ? 'Aprobado' : f.resultado === 'Reprobado' ? 'Reprobado' : 'Pendiente', accion: f.accion,
        gradoOrigenId: gradoDe.get(f.seccionId)!, seccionOrigenId: f.seccionId, gradoDestinoId: ds ? gradoDe.get(ds) ?? null : null, seccionDestinoId: ds, cicloDestinoId: ds ? destino.id : null, fuente: 'promocion' as const,
      };
    });
    const id = await prisma.$transaction(async tx => {
      for (const ch of trozos(crear, 400)) await tx.matricula.createMany({ data: ch.map(p => ({ id: idMatricula(p.fila.alumnoId, destino.id), alumnoId: p.fila.alumnoId, cicloId: destino.id, seccionId: p.fila.destinoId!, estado: 'Activo', fechaIngreso, fechaRetiro: null })) });
      for (const p of mover) await tx.matricula.update({ where: { id: p.destMat!.id }, data: { seccionId: p.fila.destinoId! } }); // una reserva conserva su estado (Reservado / Activo): solo cambia de seccion
      for (const p of liberar) await liberarReservaTx(tx, { id: p.destMat!.id, alumnoId: p.fila.alumnoId, cicloId: destino.id, seccionId: p.destMat!.seccionId }, { motivo: 'Egresa (último grado aprobado): reserva de reinscripción liberada', usuario, inactivar: false });
      for (const ch of trozos(borrar.filter(p => p.op === 'borrar'))) await tx.matricula.deleteMany({ where: { id: { in: ch.map(p => p.destMat!.id) } } });
      const porEstado = new Map<string, string[]>();
      for (const p of cambiosOrigen) porEstado.set(estadoOrigen(p), [...(porEstado.get(estadoOrigen(p)) ?? []), p.origenMatId]);
      for (const [estado, ids] of porEstado) for (const ch of trozos(ids)) await tx.matricula.updateMany({ where: { id: { in: ch } }, data: { estado } });
      for (const ch of trozos(egresan)) await tx.alumno.updateMany({ where: { id: { in: ch.map(p => p.fila.alumnoId) } }, data: { estado: 'Egresado' } });
      for (const ch of trozos(reactivar)) await tx.alumno.updateMany({ where: { id: { in: ch.map(p => p.fila.alumnoId) } }, data: { estado: 'Activo' } });
      const porSec = new Map<string, string[]>();
      for (const p of seccionActiva) porSec.set(p.fila.destinoId!, [...(porSec.get(p.fila.destinoId!) ?? []), p.fila.alumnoId]);
      for (const [seccionId, ids] of porSec) for (const ch of trozos(ids)) await tx.alumno.updateMany({ where: { id: { in: ch } }, data: { seccionId } });
      const c = preview.conteos;
      const reg = await tx.promocionCiclo.create({
        data: {
          cicloOrigenId: origen.id, cicloDestinoId: destino.id, usuario, parametros: JSON.stringify(preview.cfg), evaluados: c.evaluados, aprobados: c.aprobados, reprobados: c.reprobados,
          pendientes: c.pendientes, graduados: c.graduados, sinSeccion: c.sinSeccion, creadas: crear.length, ajustadas: mover.length, sinCambios: planes.length - crear.length - mover.length,
        },
      });
      const accionDe = (p: Plan): AccionPromocion => p.fila.accion;
      for (const ch of trozos(planes, 400)) await tx.promocionDetalle.createMany({
        data: ch.map(p => ({
          promocionId: reg.id, alumnoId: p.fila.alumnoId, resultado: p.fila.resultado, promedio: p.fila.promedio, reprobadas: p.fila.reprobadas, incompletas: p.fila.incompletas,
          seccionOrigenId: p.fila.seccionId, seccionDestinoId: p.fila.accion === 'Graduado' || p.fila.accion === 'SinCupo' || p.fila.accion === 'Pendiente' ? null : p.fila.destinoId,
          accion: accionDe(p), matricula: p.op === 'crear' ? 'Creada' : p.op === 'mover' ? 'Ajustada' : p.op === 'borrar' || p.op === 'liberar' ? 'Retirada' : 'SinCambios', nota: p.fila.nota.slice(0, 400),
        })),
      });
      await guardarResultados(tx, resultados);
      return reg.id;
    }, { timeout: 300_000, maxWait: 60_000 });
    return { id, conteos: preview.conteos, creadas: crear.length, ajustadas: mover.length, sinCambios: planes.length - crear.length - mover.length };
  } finally { enCurso = false; }
}
