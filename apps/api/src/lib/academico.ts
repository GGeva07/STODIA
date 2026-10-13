/**
 * Núcleo del grupo académico dirigido por datos: asignaciones docente x sección x materia (sobre las tablas tipadas del cliente),
 * nómina por sección (Alumno.seccionId), rúbricas -> competencias, bloques por tanda y fecha/hora en la zona horaria del colegio.
 */
import type { FastifyRequest } from 'fastify';
import type { AcadAsigOpt, AcadPeriodo } from '@stodia/shared';
import { prisma } from '../db';
import { cfgGet } from './sisconfig';
import { leerTipo } from './catalogos-tipados';
import { cicloIdActivo, esCicloActivo, periodoId, type CicloRow } from './ciclo';
import { ESTADOS_SIN_CUPO, sinLiberarEn } from './reinscripcion';

type Row = { id: string; estado: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Rúbrica ACTIVA de una materia (Materia.rubricaId) con sus criterios clasificados en competencias C1-C4 / examen EX. */
export interface RubInfo { nombre: string; minimo: number; criterios: { nombre: string; peso: number; clave: string | null }[] }
export interface Cat { grados: Map<string, Row>; secciones: Map<string, Row>; tandas: Map<string, Row>; aulas: Map<string, Row>; materias: Map<string, Row>; docentes: Map<string, Row>; rubricaDeMateria: Map<string, RubInfo> }

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const OFF = [0, 50, 100, 170, 220, 270]; // minutos desde la entrada de la tanda (6 bloques de 50 min con receso)
const ORD = ['1er', '2do', '3er', '4to', '5to', '6to'];
export const PERIODOS: AcadPeriodo[] = [
  { k: '1', label: 'Período 1 (Ago–Oct)' }, { k: '2', label: 'Período 2 (Nov–Ene)' }, { k: '3', label: 'Período 3 (Feb–Abr)' }, { k: '4', label: 'Período 4 (May–Jul)' },
];
export const periodoDe = (fecha: string) => { const m = Number(fecha.slice(5, 7)); return m >= 8 && m <= 10 ? '1' : m === 11 || m <= 1 ? '2' : m <= 4 ? '3' : '4'; };
export const periodoLabel = (k: string) => PERIODOS.find(p => p.k === k)?.label ?? `Período ${k}`;
/** PeriodoAcademico ('1'..'4' de la API) del ciclo ACTIVO (o del indicado). */
export async function periodoIdActivo(k: string, cicloId?: string): Promise<string | null> { return periodoId(cicloId ?? await cicloIdActivo(), k); }
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Fecha y hora del colegio ----------
export async function ahora() {
  const tz = (await cfgGet('perfil')).zonaHoraria || 'America/Santo_Domingo';
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  } catch {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  }
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { fecha: `${parts.year}-${parts.month}-${parts.day}`, dow, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

// ---------- Catálogos ----------
/** Catálogos académicos desde las tablas TIPADAS (Fase 2A), con la forma histórica de fila que consumen los módulos. */
export async function loadCat(): Promise<Cat> {
  const [grados, secciones, tandas, aulas, materias, docentes, rubs] = await Promise.all([
    leerTipo('grados'), leerTipo('secciones'), leerTipo('tandas'), leerTipo('aulas'), leerTipo('materias'), leerTipo('docentes', { interno: true }),
    prisma.rubrica.findMany({ where: { estado: 'Activo' }, include: { criterios: { orderBy: { orden: 'asc' } }, materias: { select: { id: true } } } }),
  ]);
  const map = (l: Row[]) => new Map(l.map(r => [r.id, r] as const));
  const rubricaDeMateria = new Map<string, RubInfo>();
  for (const r of rubs) for (const m of r.materias) rubricaDeMateria.set(m.id, { nombre: r.nombre, minimo: r.minimo, criterios: r.criterios.map(c => ({ nombre: c.nombre, peso: c.peso, clave: c.clave })) });
  return { grados: map(grados), secciones: map(secciones), tandas: map(tandas), aulas: map(aulas), materias: map(materias), docentes: map(docentes), rubricaDeMateria };
}
export const seccionLabel = (c: Cat, s: Row) => `${c.grados.get(s.grado)?.grado ?? ''} ${s.seccion}`.trim();
const activo = (r?: Row) => !!r && r.estado === 'Activo';

// ---------- Asignaciones ----------
export interface Asig {
  /** explicita = false cuando la materializó el perfil del docente (AcadAsignacion.heredada). aulaElegida = aula elegida entre `aulas`. */
  id: string; explicita: boolean; docenteId: string; seccionId: string; materiaId: string; aulas: string[]; aulaElegida: string | null;
  docente: string; seccion: string; materia: string; tanda: string; nivel: string;
}
const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p[1]}` : n; };
export const nombreCorto = shortName;

/** Asignaciones (AcadAsignacion; las del perfil del docente ya están materializadas con heredada = true) de docentes, secciones y materias ACTIVOS. */
export async function todasAsig(c: Cat, cicloId?: string): Promise<Asig[]> {
  const rows = await prisma.acadAsignacion.findMany({ where: { cicloId: cicloId ?? await cicloIdActivo() }, include: { aulas: { orderBy: { orden: 'asc' } } } });
  const out: Asig[] = [];
  for (const r of rows) {
    const d = c.docentes.get(r.docenteId), s = c.secciones.get(r.seccionId), m = c.materias.get(r.materiaId);
    if (!activo(d) || !activo(s) || !activo(m)) continue;
    const g = c.grados.get(s!.grado);
    out.push({ id: r.id, explicita: !r.heredada, docenteId: r.docenteId, seccionId: r.seccionId, materiaId: r.materiaId, aulas: r.aulas.map(a => a.aulaId), aulaElegida: r.aulaElegidaId, docente: d!.nombre, seccion: seccionLabel(c, s!), materia: m!.nombre, tanda: c.tandas.get(s!.tanda)?.nombre ?? '', nivel: g?.nivel ?? '' });
  }
  const ord = (a: Asig) => { const s = c.secciones.get(a.seccionId)!; return [Number(c.grados.get(s.grado)?.orden ?? 0), String(s.seccion), String(s.tanda), a.materia] as const; };
  return out.sort((x, y) => { const p = ord(x), q = ord(y); return p[0] - q[0] || p[1].localeCompare(q[1]) || p[2].localeCompare(q[2]) || p[3].localeCompare(q[3], 'es'); });
}

const esDireccion = (rol: string) => rol === 'Super Admin' || rol === 'Director Académico';
/** Docente del usuario: por la cuenta enlazada (Docente.userId), si no por el usuario propuesto y, como último recurso, por el nombre. */
export function docenteDe(c: Cat, u: { sub?: string; usuario: string; nombre: string }): Row | undefined {
  const ds = [...c.docentes.values()];
  return (u.sub ? ds.find(d => d.userId === u.sub) : undefined) ?? ds.find(d => norm(d.usuario) === norm(u.usuario)) ?? ds.find(d => norm(d.nombre) === norm(u.nombre));
}
export const optDe = (a: Asig): AcadAsigOpt => ({ id: a.id, label: `${a.materia} · ${a.seccion}`, seccion: a.seccion, materia: a.materia, tanda: a.tanda, docente: a.docente });

/** Asignaciones visibles para el usuario (Super Admin / Director: todas; Docente: las suyas) y la elegida (`asig`, por defecto la primera). */
export async function elegirAsig(c: Cat, user: { sub?: string; usuario: string; nombre: string; rol: string }, asig?: string, ciclo?: CicloRow) {
  const all = await todasAsig(c, ciclo?.id);
  const doc = esDireccion(user.rol) ? null : docenteDe(c, user);
  const lista = esDireccion(user.rol) ? all : all.filter(a => doc && a.docenteId === doc.id);
  // Ciclo no activo sin asignacion pedida: la primera cuyo seccion tuvo alumnos matriculados en ese ciclo (no abrir en una seccion vacia).
  const conAlumnos = !asig && ciclo && !esCicloActivo(ciclo) ? await seccionesConMatricula(ciclo) : null;
  const sel = asig ? lista.find(a => a.id === asig) : (conAlumnos && lista.find(a => conAlumnos.has(a.seccionId))) || lista[0];
  return { lista, sel: sel ?? null, prohibida: !!asig && !sel, all };
}

// ---------- Nómina ----------
/** Ids de seccion con al menos una Matricula en el ciclo (Fase 2D: para elegir la seccion por defecto de un ciclo no activo). */
export async function seccionesConMatricula(ciclo: CicloRow): Promise<Set<string>> {
  return new Set((await prisma.matricula.groupBy({ by: ['seccionId'], where: { cicloId: ciclo.id } })).map(m => m.seccionId));
}
export interface NomItem { key: string; nombre: string; alumnoId: string | null; rosterId: string | null }
/** Alumnos activos de la sección (Alumno.seccionId) más la nómina heredada sin Alumno enlazado. `key` = rosterId si existe, si no `a:<alumnoId>`. */
export async function nomina(c: Cat, seccionId: string, ciclo?: CicloRow): Promise<NomItem[]> {
  if (!c.secciones.has(seccionId)) return [];
  if (ciclo && !esCicloActivo(ciclo)) {
    // Ciclo cerrado / planificado (Fase 2D): la nomina es la de las MATRICULAS de ese ciclo en la seccion (la seccion de entonces, no la actual).
    const mats = await prisma.matricula.findMany({ where: { cicloId: ciclo.id, seccionId }, include: { alumno: { select: { id: true, nombres: true, apellidos: true, rosters: { select: { id: true }, take: 1 } } } } });
    return mats.map(m => ({ key: m.alumno.rosters[0]?.id ?? `a:${m.alumno.id}`, nombre: `${m.alumno.apellidos}, ${m.alumno.nombres}`, alumnoId: m.alumno.id, rosterId: m.alumno.rosters[0]?.id ?? null })).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  }
  const [alumnos, legado] = await Promise.all([
    prisma.alumno.findMany({ where: { seccionId, estado: 'Activo' }, include: { rosters: { select: { id: true }, take: 1 } } }),
    prisma.acadRoster.findMany({ where: { seccionId, alumnoId: null } }),
  ]);
  const items: NomItem[] = [
    ...alumnos.map(a => ({ key: a.rosters[0]?.id ?? `a:${a.id}`, nombre: `${a.apellidos}, ${a.nombres}`, alumnoId: a.id, rosterId: a.rosters[0]?.id ?? null })),
    ...legado.map(r => ({ key: r.id, nombre: r.nombre, alumnoId: null, rosterId: r.id })),
  ];
  return items.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
}
/** Alumnos inscritos en la sección (no Retirados): se CALCULA desde Alumno (no hay contador guardado). */
export async function inscritosSeccion(c: Cat, seccionId: string, ciclo?: CicloRow): Promise<number> {
  if (!c.secciones.has(seccionId)) return 0;
  if (ciclo && !esCicloActivo(ciclo)) return prisma.matricula.count({ where: { cicloId: ciclo.id, seccionId, estado: { notIn: ESTADOS_SIN_CUPO } } });
  const activoId = ciclo?.id ?? (await prisma.ciclo.findFirst({ where: { estado: 'Activo' }, select: { id: true } }))?.id;
  return prisma.alumno.count({ where: { seccionId, estado: { notIn: ['Retirado', 'Preinscrito'] }, ...(activoId ? sinLiberarEn(activoId) : {}) } });
}
/** Devuelve el id de AcadRoster del item, creándolo (enlazado al Alumno) si aún no existe. */
export async function materializar(item: NomItem, seccionId: string): Promise<string> {
  if (item.rosterId) return item.rosterId;
  const id = `ra-${item.alumnoId}`;
  const r = await prisma.acadRoster.upsert({ where: { id }, update: {}, create: { id, seccionId, orden: (await prisma.acadRoster.count()) + 1, nombre: item.nombre, alumnoId: item.alumnoId } });
  return r.id;
}

/** Upsert del pase de lista del día para una sección. Todas las claves deben pertenecer a su nómina. */
export async function guardarAsistencia(c: Cat, seccionId: string, fecha: string, items: { rosterId: string; estado: string; notificar: boolean }[]) {
  const nom = new Map((await nomina(c, seccionId)).map(n => [n.key, n]));
  if (items.some(i => !nom.has(i.rosterId))) return null;
  const ids: string[] = [];
  for (const i of items) ids.push(await materializar(nom.get(i.rosterId)!, seccionId));
  await prisma.$transaction(items.map((i, k) => prisma.acadAsistencia.upsert({
    where: { rosterId_fecha: { rosterId: ids[k], fecha } },
    update: { estado: i.estado, notificar: !!i.notificar },
    create: { rosterId: ids[k], fecha, estado: i.estado, notificar: !!i.notificar },
  })));
  return { guardados: items.length, notificados: items.filter(i => i.estado === 'AI' && i.notificar).length };
}
/** Marcas existentes de una fecha, por clave de nómina. */
export async function marcasDelDia(nom: NomItem[], fecha: string) {
  const ids = nom.flatMap(n => (n.rosterId ? [n.rosterId] : []));
  const rows = await prisma.acadAsistencia.findMany({ where: { rosterId: { in: ids }, fecha } });
  return new Map(rows.map(r => [r.rosterId, r]));
}

// ---------- Rúbricas / competencias ----------
export interface Comp { k: string; n: string; w: number; field: 'c1' | 'c2' | 'c3' | 'c4' | 'ex' }
const DEF_COMPS: Comp[] = [
  { k: 'C1', n: 'Razonamiento', w: 17.5, field: 'c1' }, { k: 'C2', n: 'Comunicación', w: 17.5, field: 'c2' }, { k: 'C3', n: 'Modelación', w: 17.5, field: 'c3' },
  { k: 'C4', n: 'Resolución', w: 17.5, field: 'c4' }, { k: 'EX', n: 'Examen', w: 30, field: 'ex' },
];
/** Rúbrica activa de la materia (Materia.rubricaId); criterios -> hasta 4 competencias C1–C4 y el examen (EX), según las claves de RubricaCriterio. */
export function rubricaDe(c: Pick<Cat, 'rubricaDeMateria'>, materiaId: string): { nombre: string; comps: Comp[]; minimo: number } {
  const r = c.rubricaDeMateria.get(materiaId);
  if (!r) return { nombre: 'Predeterminada', comps: DEF_COMPS, minimo: 70 };
  const fields = ['c1', 'c2', 'c3', 'c4'] as const;
  const comps: Comp[] = [];
  for (const x of r.criterios) if (x.clave && x.clave !== 'EX') comps.push({ k: x.clave, n: x.nombre, w: x.peso, field: fields[Number(x.clave.slice(1)) - 1] });
  const ex = r.criterios.find(x => x.clave === 'EX');
  if (ex) comps.push({ k: 'EX', n: 'Examen', w: ex.peso, field: 'ex' });
  if (!comps.length) return { nombre: r.nombre, comps: DEF_COMPS, minimo: r.minimo || 70 };
  return { nombre: r.nombre, comps, minimo: r.minimo || 70 };
}

// ---------- Horario / bloques ----------
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = (t || '07:30').split(':').map(Number); return h * 60 + (m || 0); };
/** Seis bloques de 50 min con receso, a partir de la hora de entrada de la tanda. */
export function bloquesDe(c: Cat, tandaId: string): string[] { const ini = toMin(c.tandas.get(tandaId)?.ini ?? '07:30'); return OFF.map(o => hhmm(ini + o)); }
export const bloqueTexto = (bloques: string[], b: number) => `${ORD[b]} bloque ${bloques[b]}`;

/** Bloque a mostrar en el pase de lista: el de la materia hoy según el horario (en curso, próximo o primero); si no hay horario, el que corresponde a la hora. */
export function bloqueActual(bloques: string[], ahoraMin: number, dow: number, slotsMateria: string[]): number {
  const ini = bloques.map(toMin);
  const enCurso = (b: number) => ahoraMin >= ini[b] && ahoraMin < ini[b] + 50;
  const hoy = slotsMateria.map(s => s.split('-').map(Number)).filter(([d]) => d === dow).map(([, b]) => b).sort((a, b) => a - b);
  if (hoy.length) return hoy.find(enCurso) ?? hoy.find(b => ini[b] > ahoraMin) ?? hoy[0];
  if (dow <= 4) { const b = ini.findIndex((_, i) => enCurso(i)); if (b >= 0) return b; }
  return 0;
}

export type Req = FastifyRequest;
