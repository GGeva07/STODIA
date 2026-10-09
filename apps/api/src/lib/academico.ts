/**
 * Núcleo del grupo académico dirigido por datos: asignaciones docente x sección x materia (sobre los catálogos del cliente),
 * nómina por sección (Alumno), rúbricas -> competencias, bloques por tanda y fecha/hora en la zona horaria del colegio.
 */
import type { FastifyRequest } from 'fastify';
import type { AcadAsigOpt, AcadPeriodo } from '@stodia/shared';
import { prisma } from '../db';
import { cfgGet } from './sisconfig';

type Row = { id: string; estado: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Cat { grados: Map<string, Row>; secciones: Map<string, Row>; tandas: Map<string, Row>; aulas: Map<string, Row>; materias: Map<string, Row>; rubricas: Row[]; docentes: Map<string, Row> }

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const OFF = [0, 50, 100, 170, 220, 270]; // minutos desde la entrada de la tanda (6 bloques de 50 min con receso)
const ORD = ['1er', '2do', '3er', '4to', '5to', '6to'];
export const PERIODOS: AcadPeriodo[] = [
  { k: '1', label: 'Período 1 (Ago–Oct)' }, { k: '2', label: 'Período 2 (Nov–Ene)' }, { k: '3', label: 'Período 3 (Feb–Abr)' }, { k: '4', label: 'Período 4 (May–Jul)' },
];
export const periodoDe = (fecha: string) => { const m = Number(fecha.slice(5, 7)); return m >= 8 && m <= 10 ? '1' : m === 11 || m <= 1 ? '2' : m <= 4 ? '3' : '4'; };
export const periodoLabel = (k: string) => PERIODOS.find(p => p.k === k)?.label ?? `Período ${k}`;
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
export async function loadCat(): Promise<Cat> {
  const rows = await prisma.catalogo.findMany({ where: { tipo: { in: ['grados', 'secciones', 'tandas', 'aulas', 'materias', 'rubricas', 'docentes'] } }, orderBy: { id: 'asc' } });
  const map = (t: string) => new Map(rows.filter(r => r.tipo === t).map(r => { const d: Row = { ...JSON.parse(r.data), estado: r.estado }; return [d.id, d] as const; }));
  return { grados: map('grados'), secciones: map('secciones'), tandas: map('tandas'), aulas: map('aulas'), materias: map('materias'), rubricas: [...map('rubricas').values()], docentes: map('docentes') };
}
export const seccionLabel = (c: Cat, s: Row) => `${c.grados.get(s.grado)?.grado ?? ''} ${s.seccion}`.trim();
const activo = (r?: Row) => !!r && r.estado === 'Activo';

// ---------- Asignaciones ----------
export interface Asig {
  id: string; explicita: boolean; docenteId: string; seccionId: string; materiaId: string; aulas: string[];
  docente: string; seccion: string; materia: string; tanda: string; nivel: string;
}
const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p[1]}` : n; };
export const nombreCorto = shortName;

/** Explícitas (AcadAsignacion) + las implícitas del catálogo Docentes (materias x secciones del docente) que no estén cubiertas. */
export async function todasAsig(c: Cat): Promise<Asig[]> {
  const exp = await prisma.acadAsignacion.findMany();
  const out: Asig[] = [];
  const mk = (id: string, explicita: boolean, docenteId: string, seccionId: string, materiaId: string, aulas: string[]): Asig | null => {
    const d = c.docentes.get(docenteId), s = c.secciones.get(seccionId), m = c.materias.get(materiaId);
    if (!activo(d) || !activo(s) || !activo(m)) return null;
    const g = c.grados.get(s!.grado);
    return { id, explicita, docenteId, seccionId, materiaId, aulas, docente: d!.nombre, seccion: seccionLabel(c, s!), materia: m!.nombre, tanda: c.tandas.get(s!.tanda)?.nombre ?? '', nivel: g?.nivel ?? '' };
  };
  const cubiertas = new Set<string>();
  for (const r of exp) { cubiertas.add(`${r.seccionId}|${r.materiaId}`); const a = mk(r.id, true, r.docenteId, r.seccionId, r.materiaId, JSON.parse(r.aulas)); if (a) out.push(a); }
  for (const d of c.docentes.values()) {
    for (const sid of (d.secciones as string[]) ?? []) for (const mid of (d.materias as string[]) ?? []) {
      if (cubiertas.has(`${sid}|${mid}`)) continue;
      const s = c.secciones.get(sid), m = c.materias.get(mid);
      const gs = (m?.grados as string[] | undefined) ?? [];
      if (!s || (gs.length && !gs.includes(s.grado))) continue;
      cubiertas.add(`${sid}|${mid}`);
      const a = mk(`i:${d.id}:${sid}:${mid}`, false, d.id, sid, mid, []); if (a) out.push(a);
    }
  }
  const ord = (a: Asig) => { const s = c.secciones.get(a.seccionId)!; return [Number(c.grados.get(s.grado)?.orden ?? 0), String(s.seccion), String(s.tanda), a.materia] as const; };
  return out.sort((x, y) => { const p = ord(x), q = ord(y); return p[0] - q[0] || p[1].localeCompare(q[1]) || p[2].localeCompare(q[2]) || p[3].localeCompare(q[3], 'es'); });
}

const esDireccion = (rol: string) => rol === 'Super Admin' || rol === 'Director Académico';
export function docenteDe(c: Cat, u: { usuario: string; nombre: string }): Row | undefined {
  return [...c.docentes.values()].find(d => norm(d.usuario) === norm(u.usuario)) ?? [...c.docentes.values()].find(d => norm(d.nombre) === norm(u.nombre));
}
export const optDe = (a: Asig): AcadAsigOpt => ({ id: a.id, label: `${a.materia} · ${a.seccion}`, seccion: a.seccion, materia: a.materia, tanda: a.tanda, docente: a.docente });

/** Asignaciones visibles para el usuario (Super Admin / Director: todas; Docente: las suyas) y la elegida (`asig`, por defecto la primera). */
export async function elegirAsig(c: Cat, user: { usuario: string; nombre: string; rol: string }, asig?: string) {
  const all = await todasAsig(c);
  const doc = esDireccion(user.rol) ? null : docenteDe(c, user);
  const lista = esDireccion(user.rol) ? all : all.filter(a => doc && a.docenteId === doc.id);
  const sel = asig ? lista.find(a => a.id === asig) : lista[0];
  return { lista, sel: sel ?? null, prohibida: !!asig && !sel, all };
}

// ---------- Nómina ----------
export interface NomItem { key: string; nombre: string; alumnoId: string | null; rosterId: string | null }
/** Alumnos activos de la sección (grado + sección + tanda) más la nómina heredada sin Alumno enlazado. `key` = rosterId si existe, si no `a:<alumnoId>`. */
export async function nomina(c: Cat, seccionId: string): Promise<NomItem[]> {
  const s = c.secciones.get(seccionId);
  if (!s) return [];
  const g = c.grados.get(s.grado)?.grado, t = c.tandas.get(s.tanda)?.nombre;
  const [alumnos, legado] = await Promise.all([
    prisma.alumno.findMany({ where: { grado: g ?? '', sec: s.seccion, ...(t ? { tanda: t } : {}), estado: 'Activo' }, include: { rosters: { select: { id: true }, take: 1 } } }),
    prisma.acadRoster.findMany({ where: { seccion: seccionId, alumnoId: null } }),
  ]);
  const items: NomItem[] = [
    ...alumnos.map(a => ({ key: a.rosters[0]?.id ?? `a:${a.id}`, nombre: `${a.apellidos}, ${a.nombres}`, alumnoId: a.id, rosterId: a.rosters[0]?.id ?? null })),
    ...legado.map(r => ({ key: r.id, nombre: r.nombre, alumnoId: null, rosterId: r.id })),
  ];
  return items.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
}
/** Alumnos inscritos en la sección (no Retirados): se CALCULA desde Alumno (ya no hay contador guardado en el catálogo). */
export async function inscritosSeccion(c: Cat, seccionId: string): Promise<number> {
  const s = c.secciones.get(seccionId);
  if (!s) return 0;
  const g = c.grados.get(s.grado)?.grado, t = c.tandas.get(s.tanda)?.nombre;
  return prisma.alumno.count({ where: { grado: g ?? '', sec: s.seccion, ...(t ? { tanda: t } : {}), estado: { not: 'Retirado' } } });
}
/** Devuelve el id de AcadRoster del item, creándolo (enlazado al Alumno) si aún no existe. */
export async function materializar(item: NomItem, seccionId: string): Promise<string> {
  if (item.rosterId) return item.rosterId;
  const id = `ra-${item.alumnoId}`;
  const r = await prisma.acadRoster.upsert({ where: { id }, update: {}, create: { id, seccion: seccionId, orden: (await prisma.acadRoster.count()) + 1, nombre: item.nombre, alumnoId: item.alumnoId } });
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
/** Rúbrica activa del catálogo que cubre la materia; criterios "Nombre 17.5%, ..." -> hasta 4 competencias C1–C4 y el examen (EX). */
export function rubricaDe(c: Cat, materiaId: string): { nombre: string; comps: Comp[]; minimo: number } {
  const r = c.rubricas.find(x => x.estado === 'Activo' && ((x.materias as string[]) ?? []).includes(materiaId));
  if (!r) return { nombre: 'Predeterminada', comps: DEF_COMPS, minimo: 70 };
  const crit = String(r.crit ?? '').split(',').map(p => /^\s*(.+?)\s+([\d.]+)\s*%?\s*$/.exec(p)).filter((m): m is RegExpExecArray => !!m).map(m => ({ n: m[1], w: Number(m[2]) }));
  const ex = crit.find(x => /^ex[aá]men/i.test(norm(x.n)) || /^ex[aá]men/i.test(x.n));
  const resto = crit.filter(x => x !== ex).slice(0, 4);
  if (!resto.length && !ex) return { nombre: String(r.nombre), comps: DEF_COMPS, minimo: Number(r.minimo) || 70 };
  const fields = ['c1', 'c2', 'c3', 'c4'] as const;
  const comps: Comp[] = resto.map((x, i) => ({ k: `C${i + 1}`, n: x.n, w: x.w, field: fields[i] }));
  if (ex) comps.push({ k: 'EX', n: 'Examen', w: ex.w, field: 'ex' });
  return { nombre: String(r.nombre), comps, minimo: Number(r.minimo) || 70 };
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
