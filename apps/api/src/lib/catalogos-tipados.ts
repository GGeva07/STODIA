/**
 * Capa de compatibilidad de los catalogos TIPADOS (Fase 2A: Grado, Tanda, Aula, Seccion, Materia, Rubrica, Docente, Empleado y sus puentes;
 * Fase 2B: Caja, RutaTransporte, TipoBeca, ConceptoBeca, MetodoPago, Comida, Dieta, Alergia) con EXACTAMENTE la forma de fila que antes guardaba
 * Catalogo.data (`{ id, estado, ...campos }`), de modo que la API /catalogos y la web no cambian. La tabla Catalogo ya no guarda ningun tipo.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { cicloIdActivo } from './ciclo';

export type Row = { id: string; estado: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const TIPOS_2A = ['grados', 'tandas', 'aulas', 'secciones', 'materias', 'rubricas', 'docentes', 'staff'] as const;
export const TIPOS_2B = ['cajas', 'rutas', 'becas', 'conceptosBeca', 'metodosPago', 'comidas', 'dietas', 'alergias'] as const;
export const TIPOS_TIPADOS = [...TIPOS_2A, ...TIPOS_2B] as const;
export type TipoTipado = (typeof TIPOS_TIPADOS)[number];
export const esTipado = (t: string): t is TipoTipado => (TIPOS_TIPADOS as readonly string[]).includes(t);

type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;
export const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Niveles (tabla de referencia fija) ----------
export const NIVELES: readonly string[] = ['Inicial', 'Primaria', 'Secundaria'];
const nivelId = (nombre: string) => `niv-${norm(nombre)}`;
/** Siembra los 3 niveles (idempotente). Se invoca desde el arranque/seed: Grado.nivelId es FK obligatoria. */
export async function asegurarNiveles(db: Db = prisma): Promise<void> {
  for (const [i, nombre] of NIVELES.entries()) await db.nivel.upsert({ where: { id: nivelId(nombre) }, update: {}, create: { id: nivelId(nombre), nombre, orden: i + 1 } });
}

/** Valores base de los catalogos de Alimentacion (se siembran SOLO si la tabla esta vacia; despues el cliente es dueño de ellos). */
/** Documentos que se piden en el expediente (TipoDocumento): se siembran SOLO si la tabla esta vacia; despues el cliente es dueño de ellos. */
export const DOCS_BASE = ['Acta de nacimiento', 'Registro de vacunación', 'Fotos 2×2', 'Récord de conducta anterior'] as const;
export const ALI_BASE = {
  comidas: ['Desayuno', 'Merienda AM', 'Almuerzo', 'Merienda PM'],
  dietas: ['Sin gluten', 'Sin lácteos', 'Sin maní / frutos secos', 'Vegetariano'],
  alergias: ['Maní', 'Frutos secos', 'Lactosa', 'Gluten', 'Huevo', 'Mariscos'],
} as const;
/**
 * Datos de referencia minimos (idempotente; se invoca en cada arranque): el medio de pago «Efectivo» (sin el no se puede cobrar) y los catalogos base de
 * Alimentacion cuando estan vacios. No toca nada que el cliente ya haya editado.
 */
export async function asegurarCatalogosBase(db: Db = prisma): Promise<void> {
  if (!(await db.metodoPago.count())) await db.metodoPago.create({ data: { id: 'm1', nombre: 'Efectivo', ref: null } });
  const pad = (i: number) => String(i + 1).padStart(2, '0');
  if (!(await db.comida.count())) await db.comida.createMany({ data: ALI_BASE.comidas.map((nombre, i) => ({ id: pad(i), nombre })) });
  if (!(await db.dieta.count())) await db.dieta.createMany({ data: ALI_BASE.dietas.map((nombre, i) => ({ id: pad(i), nombre })) });
  if (!(await db.alergia.count())) await db.alergia.createMany({ data: ALI_BASE.alergias.map((nombre, i) => ({ id: pad(i), nombre })) });
  if (!(await db.tipoDocumento.count())) await db.tipoDocumento.createMany({ data: DOCS_BASE.map((nombre, i) => ({ id: `doc-${pad(i)}`, nombre, requerido: true, orden: i })) });
}

/** Id de la CategoriaProducto con ese nombre (la crea si no existe). Id estable: 'cat-<nombre sin acentos>'. */
export async function categoriaProductoId(nombre: string, db: Db = prisma): Promise<string> {
  const n = nombre.trim();
  const ex = await db.categoriaProducto.findUnique({ where: { nombre: n } });
  if (ex) return ex.id;
  const id = `cat-${norm(n).replace(/[^a-z0-9]+/g, '-')}`;
  await db.categoriaProducto.upsert({ where: { id }, update: {}, create: { id, nombre: n } });
  return id;
}
/** Regla de beca en texto («50%», «RD$ 2,000.00») -> modo y valor. null si no se interpreta. */
export function parseRegla(txt: string): { modo: 'pct' | 'monto'; valor: number } | null {
  const t = String(txt ?? '').trim();
  let m = /^([\d.,]+)\s*%$/.exec(t);
  if (m) { const v = Number(m[1].replace(/,/g, '')); return Number.isFinite(v) ? { modo: 'pct', valor: v } : null; }
  m = /^(?:RD\$\s*)?([\d.,]+)$/i.exec(t);
  if (m) { const v = Number(m[1].replace(/,/g, '')); return Number.isFinite(v) ? { modo: 'monto', valor: v } : null; }
  return null;
}

// ---------- Criterios de rubrica ----------
export interface Crit { n: string; w: number }
/** "Tareas 20%, Examen 70%" -> criterios. Devuelve null si algun segmento no tiene la forma "Nombre peso%". */
export function parseCrit(txt: string): Crit[] | null {
  const partes = String(txt ?? '').split(',').map(p => p.trim()).filter(Boolean);
  const out: Crit[] = [];
  for (const p of partes) { const m = /^(.+?)\s+([\d.]+)\s*%?$/.exec(p); if (!m || !Number.isFinite(Number(m[2]))) return null; out.push({ n: m[1].trim(), w: Number(m[2]) }); }
  return out.length ? out : null;
}
const esExamen = (n: string) => /^examen/i.test(norm(n));
/** Asigna las claves de captura: primer criterio de examen = EX; los cuatro primeros demas = C1..C4; el resto no se captura (null). */
export function conClaves(crit: Crit[]): { orden: number; nombre: string; peso: number; clave: string | null }[] {
  const ex = crit.find(x => esExamen(x.n));
  let c = 0;
  return crit.map((x, i) => ({ orden: i + 1, nombre: x.n, peso: x.w, clave: x === ex ? 'EX' : ++c <= 4 ? `C${c}` : null }));
}
export const critTexto = (cs: { orden: number; nombre: string; peso: number }[]) => [...cs].sort((a, b) => a.orden - b.orden).map(c => `${c.nombre} ${c.peso}%`).join(', ');

// ---------- Lectura (forma historica de Catalogo.data) ----------
const ordIds = (l: string[]) => [...l].sort(natural);

export async function leerTipo(tipo: TipoTipado, opts: { insc?: boolean; interno?: boolean; db?: Db } = {}): Promise<Row[]> {
  const db = opts.db ?? prisma;
  const asc = { orderBy: { id: 'asc' as const } };
  switch (tipo) {
    case 'grados': return (await db.grado.findMany({ ...asc, include: { nivel: true } })).map(r => ({ id: r.id, nivel: r.nivel.nombre, grado: r.nombre, orden: r.orden, estado: r.estado }));
    case 'tandas': return (await db.tanda.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, ini: r.ini, fin: r.fin, estado: r.estado }));
    case 'aulas': return (await db.aula.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, edif: r.edificio, pupitres: r.pupitres, estado: r.estado }));
    case 'secciones': {
      const [rows, cuenta] = await Promise.all([
        db.seccion.findMany(asc),
        opts.insc ? db.alumno.groupBy({ by: ['seccionId'], where: { estado: { not: 'Retirado' } }, _count: { _all: true } }) : Promise.resolve([]),
      ]);
      const n = new Map(cuenta.map(c => [c.seccionId, c._count._all]));
      return rows.map(r => ({ id: r.id, grado: r.gradoId, seccion: r.letra, tanda: r.tandaId, aula: r.aulaBaseId ?? '', cap: r.cap, estado: r.estado, ...(opts.insc ? { insc: n.get(r.id) ?? 0 } : {}) }));
    }
    case 'materias': return (await db.materia.findMany({ ...asc, include: { grados: { include: { grado: { select: { orden: true } } } } } })).map(r => ({
      id: r.id, codigo: r.codigo, nombre: r.nombre, grados: [...r.grados].sort((a, b) => a.grado.orden - b.grado.orden).map(g => g.gradoId), horas: r.horas, estado: r.estado,
    }));
    case 'rubricas': return (await db.rubrica.findMany({ ...asc, include: { criterios: true, materias: { select: { id: true } } } })).map(r => ({
      id: r.id, nombre: r.nombre, materias: ordIds(r.materias.map(m => m.id)), escala: r.escala, crit: critTexto(r.criterios), minimo: r.minimo, estado: r.estado,
    }));
    case 'docentes': return (await db.docente.findMany({ ...asc, include: { materias: true, secciones: true, user: true } })).map(r => ({
      id: r.id, nombre: r.nombre, cedula: r.cedula, esp: r.esp, email: r.email, tel: r.tel, usuario: r.user?.usuario ?? r.usuario ?? '', rol: r.user?.rol ?? r.rol,
      materias: ordIds(r.materias.map(m => m.materiaId)), secciones: ordIds(r.secciones.map(s => s.seccionId)), estado: r.estado, password: r.user ? 'set' : '',
      ...(opts.interno ? { userId: r.userId } : {}),
    }));
    case 'cajas': return (await db.caja.findMany(asc)).map(r => ({ id: r.id, codigo: r.codigo, ubic: r.ubic, ncf: r.ncf, estado: r.estado }));
    case 'rutas': return (await db.rutaTransporte.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, sectores: r.sectores, chofer: r.chofer, ficha: r.ficha, asientos: r.asientos, tarifa: r.tarifa, estado: r.estado }));
    case 'becas': return (await db.tipoBeca.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, pct: r.pct, aprobacion: r.requiereAprobacion, estado: r.estado }));
    case 'conceptosBeca': return (await db.conceptoBeca.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
    case 'metodosPago': return (await db.metodoPago.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, ref: r.ref, estado: r.estado }));
    case 'comidas': return (await db.comida.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
    case 'dietas': return (await db.dieta.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
    case 'alergias': return (await db.alergia.findMany(asc)).map(r => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
    case 'staff': return (await db.empleado.findMany({ ...asc, include: { user: true } })).map(r => ({
      id: r.id, nombre: r.nombre, cargo: r.cargo, usuario: r.user?.usuario ?? r.usuario ?? '', rol: r.user?.rol ?? r.rol, caja: r.cajaId ?? '', tel: r.tel, email: r.email, estado: r.estado,
      password: r.user ? 'set' : '', ...(opts.interno ? { userId: r.userId } : {}),
    }));
  }
}
export async function leerUno(tipo: TipoTipado, id: string, opts: { insc?: boolean; interno?: boolean; db?: Db } = {}): Promise<Row | undefined> {
  return (await leerTipo(tipo, opts)).find(r => r.id === id);
}

// ---------- Plan de estudios y asignaciones derivadas ----------
/**
 * Reconstruye SeccionMateria (plan de estudios) = materias de cada seccion segun los grados de la materia, con las horas de la materia.
 * Solo agrega lo que falta y quita lo que ya no corresponde SI no tiene asignacion ni horario. `seccionId`/`materiaId` limitan el alcance.
 */
export async function sincronizarPlan(db: Db, f: { seccionId?: string; materiaId?: string } = {}): Promise<{ altas: number; bajas: number }> {
  const [secs, mats, plan, asig, hor] = await Promise.all([
    db.seccion.findMany({ where: f.seccionId ? { id: f.seccionId } : {}, select: { id: true, gradoId: true } }),
    db.materia.findMany({ where: f.materiaId ? { id: f.materiaId } : {}, select: { id: true, horas: true, grados: { select: { gradoId: true } } } }),
    db.seccionMateria.findMany({ where: { ...(f.seccionId ? { seccionId: f.seccionId } : {}), ...(f.materiaId ? { materiaId: f.materiaId } : {}) } }),
    db.acadAsignacion.findMany({ where: { ...(f.seccionId ? { seccionId: f.seccionId } : {}), ...(f.materiaId ? { materiaId: f.materiaId } : {}) }, select: { seccionId: true, materiaId: true } }),
    db.acadHorario.findMany({ where: { ...(f.seccionId ? { seccionId: f.seccionId } : {}), ...(f.materiaId ? { materiaId: f.materiaId } : {}) }, select: { seccionId: true, materiaId: true } }),
  ]);
  const tiene = new Set(plan.map(p => `${p.seccionId}|${p.materiaId}`)), usado = new Set([...asig, ...hor].map(x => `${x.seccionId}|${x.materiaId}`));
  const deseado = new Set<string>(), nuevos: { seccionId: string; materiaId: string; horas: number }[] = [];
  for (const s of secs) for (const m of mats) {
    if (!m.grados.some(g => g.gradoId === s.gradoId)) continue;
    const k = `${s.id}|${m.id}`; deseado.add(k);
    if (!tiene.has(k)) nuevos.push({ seccionId: s.id, materiaId: m.id, horas: m.horas });
  }
  const bajas = plan.filter(p => !deseado.has(`${p.seccionId}|${p.materiaId}`) && !usado.has(`${p.seccionId}|${p.materiaId}`));
  for (let i = 0; i < nuevos.length; i += 200) await db.seccionMateria.createMany({ data: nuevos.slice(i, i + 200) });
  for (const b of bajas) await db.seccionMateria.delete({ where: { seccionId_materiaId: { seccionId: b.seccionId, materiaId: b.materiaId } } });
  return { altas: nuevos.length, bajas: bajas.length };
}

/**
 * Materializa las asignaciones que implica el PERFIL de un docente (DocenteMateria x DocenteSeccion, solo grados donde se imparte la materia) como
 * filas AcadAsignacion `heredada = true`. No pisa una asignacion existente de la misma (seccion, materia). Quita las heredadas del docente que el
 * perfil ya no implica. Devuelve cuantas creo/quito.
 */
export async function sincronizarAsignaciones(db: Db, docenteId: string): Promise<{ altas: number; bajas: number }> {
  const cicloId = await cicloIdActivo(db); // las asignaciones son del ciclo ACTIVO
  const [d, existentes] = await Promise.all([
    db.docente.findUnique({ where: { id: docenteId }, include: { materias: true, secciones: true } }),
    db.acadAsignacion.findMany({ where: { cicloId }, select: { id: true, docenteId: true, seccionId: true, materiaId: true, heredada: true } }),
  ]);
  if (!d) return { altas: 0, bajas: 0 };
  const [secs, mats] = await Promise.all([
    db.seccion.findMany({ where: { id: { in: d.secciones.map(s => s.seccionId) } }, select: { id: true, gradoId: true } }),
    db.materia.findMany({ where: { id: { in: d.materias.map(m => m.materiaId) } }, select: { id: true, grados: { select: { gradoId: true } } } }),
  ]);
  const deseado = new Set<string>();
  for (const s of secs) for (const m of mats) if (!m.grados.length || m.grados.some(g => g.gradoId === s.gradoId)) deseado.add(`${s.id}|${m.id}`);
  const cubiertas = new Set(existentes.map(e => `${e.seccionId}|${e.materiaId}`));
  const nuevos = [...deseado].filter(k => !cubiertas.has(k)).map(k => { const [seccionId, materiaId] = k.split('|'); return { cicloId, docenteId, seccionId, materiaId, heredada: true }; });
  const sobran = existentes.filter(e => e.docenteId === docenteId && e.heredada && !deseado.has(`${e.seccionId}|${e.materiaId}`));
  for (let i = 0; i < nuevos.length; i += 200) await db.acadAsignacion.createMany({ data: nuevos.slice(i, i + 200) });
  if (sobran.length) await db.acadAsignacion.deleteMany({ where: { id: { in: sobran.map(s => s.id) } } }); // AsignacionAula cae en cascada
  return { altas: nuevos.length, bajas: sobran.length };
}

// ---------- Escritura ----------
/** Reemplaza el conjunto de filas de un puente (idempotente). */
async function reemplazar<T extends string>(actual: T[], deseado: T[], alta: (ids: T[]) => Promise<unknown>, baja: (ids: T[]) => Promise<unknown>) {
  const a = new Set(actual), d = new Set(deseado);
  const nuevos = [...d].filter(x => !a.has(x)), fuera = [...a].filter(x => !d.has(x));
  if (fuera.length) await baja(fuera);
  if (nuevos.length) await alta(nuevos);
}
const lista = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String))] : []);

/**
 * Crea o actualiza el registro (fila ya VALIDADA con la forma historica). `prev` = fila anterior (null si es nueva).
 * Mantiene los puentes y las derivadas (plan de estudios, asignaciones heredadas) dentro de una transaccion.
 */
export async function guardarTipo(tipo: TipoTipado, row: Row, prev: Row | null): Promise<void> {
  await prisma.$transaction(async tx => {
    const id = row.id;
    switch (tipo) {
      case 'grados': {
        const nivel = await tx.nivel.findUniqueOrThrow({ where: { nombre: String(row.nivel) } });
        const data = { nivelId: nivel.id, nombre: String(row.grado), orden: Number(row.orden), estado: row.estado };
        await tx.grado.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'tandas': {
        const data = { nombre: String(row.nombre), ini: String(row.ini), fin: String(row.fin), estado: row.estado };
        await tx.tanda.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'aulas': {
        const data = { nombre: String(row.nombre), tipo: String(row.tipo), edificio: String(row.edif ?? ''), pupitres: Number(row.pupitres), estado: row.estado };
        await tx.aula.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'secciones': {
        const data = { gradoId: String(row.grado), letra: String(row.seccion), tandaId: String(row.tanda), aulaBaseId: row.aula ? String(row.aula) : null, cap: Number(row.cap), estado: row.estado };
        await tx.seccion.upsert({ where: { id }, update: data, create: { id, ...data } });
        if (!prev || prev.grado !== row.grado) await sincronizarPlan(tx, { seccionId: id });
        break;
      }
      case 'materias': {
        const data = { codigo: String(row.codigo), nombre: String(row.nombre), horas: Number(row.horas), estado: row.estado };
        await tx.materia.upsert({ where: { id }, update: data, create: { id, ...data } });
        const act = (await tx.materiaGrado.findMany({ where: { materiaId: id } })).map(g => g.gradoId);
        await reemplazar(act, lista(row.grados), ids => tx.materiaGrado.createMany({ data: ids.map(gradoId => ({ materiaId: id, gradoId })) }), ids => tx.materiaGrado.deleteMany({ where: { materiaId: id, gradoId: { in: ids } } }));
        await sincronizarPlan(tx, { materiaId: id });
        break;
      }
      case 'rubricas': {
        const data = { nombre: String(row.nombre), escala: String(row.escala), minimo: Number(row.minimo), estado: row.estado };
        await tx.rubrica.upsert({ where: { id }, update: data, create: { id, ...data } });
        await tx.rubricaCriterio.deleteMany({ where: { rubricaId: id } });
        const cs = conClaves(parseCrit(String(row.crit)) ?? []);
        if (cs.length) await tx.rubricaCriterio.createMany({ data: cs.map(c => ({ rubricaId: id, ...c })) });
        const deseadas = lista(row.materias);
        await tx.materia.updateMany({ where: { rubricaId: id, id: { notIn: deseadas } }, data: { rubricaId: null } });
        if (deseadas.length) await tx.materia.updateMany({ where: { id: { in: deseadas } }, data: { rubricaId: id } });
        break;
      }
      case 'docentes': {
        const data = { nombre: String(row.nombre), cedula: String(row.cedula), esp: String(row.esp ?? ''), email: String(row.email ?? ''), tel: String(row.tel ?? ''), rol: String(row.rol ?? 'Docente'), estado: row.estado };
        // `usuario` solo se guarda mientras no hay cuenta enlazada (con cuenta, el usuario sale de User). row.userId undefined = no tocar el enlace.
        const conCuenta = row.userId != null || prev?.password === 'set';
        const usu = conCuenta ? null : String(row.usuario ?? '').trim() || null;
        await tx.docente.upsert({ where: { id }, update: { ...data, usuario: usu, ...(row.userId !== undefined ? { userId: row.userId } : {}) }, create: { id, ...data, usuario: usu, userId: row.userId ?? null } });
        const mats = (await tx.docenteMateria.findMany({ where: { docenteId: id } })).map(m => m.materiaId);
        await reemplazar(mats, lista(row.materias), ids => tx.docenteMateria.createMany({ data: ids.map(materiaId => ({ docenteId: id, materiaId })) }), ids => tx.docenteMateria.deleteMany({ where: { docenteId: id, materiaId: { in: ids } } }));
        const secs = (await tx.docenteSeccion.findMany({ where: { docenteId: id } })).map(s => s.seccionId);
        await reemplazar(secs, lista(row.secciones), ids => tx.docenteSeccion.createMany({ data: ids.map(seccionId => ({ docenteId: id, seccionId })) }), ids => tx.docenteSeccion.deleteMany({ where: { docenteId: id, seccionId: { in: ids } } }));
        await sincronizarAsignaciones(tx, id);
        break;
      }
      case 'staff': {
        const conCuenta = row.userId != null || prev?.password === 'set';
        const usu = conCuenta ? null : String(row.usuario ?? '').trim() || null;
        const data = { nombre: String(row.nombre), cargo: String(row.cargo ?? ''), rol: String(row.rol ?? 'Cajero'), cajaId: row.caja ? String(row.caja) : null, tel: String(row.tel ?? ''), email: String(row.email ?? ''), estado: row.estado, usuario: usu };
        await tx.empleado.upsert({ where: { id }, update: { ...data, ...(row.userId !== undefined ? { userId: row.userId } : {}) }, create: { id, ...data, userId: row.userId ?? null } });
        break;
      }
      case 'cajas': {
        const data = { codigo: String(row.codigo), ubic: String(row.ubic ?? ''), ncf: String(row.ncf), estado: row.estado };
        await tx.caja.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'rutas': {
        const data = { nombre: String(row.nombre), sectores: String(row.sectores ?? ''), chofer: String(row.chofer ?? ''), ficha: String(row.ficha), asientos: Number(row.asientos), tarifa: Number(row.tarifa), estado: row.estado };
        await tx.rutaTransporte.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'becas': {
        const raw = Number(row.pct ?? row.porcentaje ?? 0) || 0;
        const data = { nombre: String(row.nombre), pct: raw > 0 && raw <= 1 ? raw * 100 : raw, requiereAprobacion: row.aprobacion === true || row.requiereAprobacion === true, estado: row.estado };
        await tx.tipoBeca.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'conceptosBeca': await tx.conceptoBeca.upsert({ where: { id }, update: { nombre: String(row.nombre), estado: row.estado }, create: { id, nombre: String(row.nombre), estado: row.estado } }); break;
      case 'metodosPago': {
        const data = { nombre: String(row.nombre), ref: row.ref ? String(row.ref) : null, estado: row.estado };
        await tx.metodoPago.upsert({ where: { id }, update: data, create: { id, ...data } });
        break;
      }
      case 'comidas': await tx.comida.upsert({ where: { id }, update: { nombre: String(row.nombre), estado: row.estado }, create: { id, nombre: String(row.nombre), estado: row.estado } }); break;
      case 'dietas': await tx.dieta.upsert({ where: { id }, update: { nombre: String(row.nombre), estado: row.estado }, create: { id, nombre: String(row.nombre), estado: row.estado } }); break;
      case 'alergias': await tx.alergia.upsert({ where: { id }, update: { nombre: String(row.nombre), estado: row.estado }, create: { id, nombre: String(row.nombre), estado: row.estado } }); break;
    }
  }, { timeout: 60_000 });
}

/** Elimina fisicamente un registro SIN dependientes (la API ya lo comprobo): borra primero sus propios puentes. */
export async function borrarTipo(tipo: TipoTipado, id: string): Promise<void> {
  await prisma.$transaction(async tx => {
    switch (tipo) {
      case 'grados': await tx.grado.delete({ where: { id } }); break;
      case 'tandas': await tx.tanda.delete({ where: { id } }); break;
      case 'aulas': await tx.aula.delete({ where: { id } }); break;
      case 'secciones':
        await tx.seccionMateria.deleteMany({ where: { seccionId: id } });
        await tx.seccion.delete({ where: { id } });
        break;
      case 'materias':
        await tx.seccionMateria.deleteMany({ where: { materiaId: id } });
        await tx.materiaGrado.deleteMany({ where: { materiaId: id } });
        await tx.materia.delete({ where: { id } });
        break;
      case 'rubricas': await tx.rubrica.delete({ where: { id } }); break; // criterios en cascada
      case 'docentes': await tx.docente.delete({ where: { id } }); break; // DocenteMateria / DocenteSeccion en cascada
      case 'staff': await tx.empleado.delete({ where: { id } }); break;
      case 'cajas': await tx.caja.delete({ where: { id } }); break;
      case 'rutas': await tx.rutaTransporte.delete({ where: { id } }); break;
      case 'becas': await tx.tipoBeca.delete({ where: { id } }); break;
      case 'conceptosBeca': await tx.conceptoBeca.delete({ where: { id } }); break;
      case 'metodosPago': await tx.metodoPago.delete({ where: { id } }); break;
      case 'comidas': await tx.comida.delete({ where: { id } }); break;
      case 'dietas': await tx.dieta.delete({ where: { id } }); break;
      case 'alergias': await tx.alergia.delete({ where: { id } }); break;
    }
  });
}

/** Cambia solo el estado (borrado logico). */
export async function cambiarEstado(tipo: TipoTipado, id: string, estado: string): Promise<void> {
  const where = { id }, data = { estado };
  switch (tipo) {
    case 'grados': await prisma.grado.update({ where, data }); break;
    case 'tandas': await prisma.tanda.update({ where, data }); break;
    case 'aulas': await prisma.aula.update({ where, data }); break;
    case 'secciones': await prisma.seccion.update({ where, data }); break;
    case 'materias': await prisma.materia.update({ where, data }); break;
    case 'rubricas': await prisma.rubrica.update({ where, data }); break;
    case 'docentes': await prisma.docente.update({ where, data }); break;
    case 'staff': await prisma.empleado.update({ where, data }); break;
    case 'cajas': await prisma.caja.update({ where, data }); break;
    case 'rutas': await prisma.rutaTransporte.update({ where, data }); break;
    case 'becas': await prisma.tipoBeca.update({ where, data }); break;
    case 'conceptosBeca': await prisma.conceptoBeca.update({ where, data }); break;
    case 'metodosPago': await prisma.metodoPago.update({ where, data }); break;
    case 'comidas': await prisma.comida.update({ where, data }); break;
    case 'dietas': await prisma.dieta.update({ where, data }); break;
    case 'alergias': await prisma.alergia.update({ where, data }); break;
  }
}

/** Dependientes (textos legibles) que impiden eliminar el registro: con historial se DESACTIVA. Vacio = se puede eliminar. */
export async function dependencias(tipo: TipoTipado, id: string): Promise<string[]> {
  const out: string[] = [];
  const add = (n: number, txt: string) => { if (n) out.push(`${n} ${txt}`); };
  switch (tipo) {
    case 'grados':
      add(await prisma.seccion.count({ where: { gradoId: id } }), 'en secciones (grado)');
      add(await prisma.materiaGrado.count({ where: { gradoId: id } }), 'en materias (grados)');
      add(await prisma.acadExtraGrado.count({ where: { gradoId: id } }), 'en actividades extracurriculares');
      break;
    case 'tandas':
      add(await prisma.seccion.count({ where: { tandaId: id } }), 'en secciones (tanda)');
      add(await prisma.finPlanTanda.count({ where: { tandaId: id } }), 'en planes de pago (importe por tanda)');
      break;
    case 'aulas':
      add(await prisma.seccion.count({ where: { aulaBaseId: id } }), 'en secciones (aula base)');
      add(await prisma.asignacionAula.count({ where: { aulaId: id } }), 'asignación(es) con esta aula');
      add(await prisma.acadAsignacion.count({ where: { aulaElegidaId: id } }), 'asignación(es) con esta aula elegida');
      add(await prisma.acadExtra.count({ where: { aulaId: id } }), 'actividad(es) extracurricular(es)');
      break;
    case 'secciones':
      add(await prisma.alumno.count({ where: { seccionId: id } }), 'alumno(s) en la sección');
      add(await prisma.acadRoster.count({ where: { seccionId: id } }), 'registro(s) de nómina');
      add(await prisma.acadAsignacion.count({ where: { seccionId: id } }), 'asignación(es) docente');
      add(await prisma.acadHorario.count({ where: { seccionId: id } }), 'bloque(s) de horario');
      add(await prisma.matricula.count({ where: { seccionId: id } }), 'matrícula(s) (historial por ciclo)');
      add(await prisma.docenteSeccion.count({ where: { seccionId: id } }), 'en docentes (secciones)');
      break;
    case 'materias':
      add(await prisma.acadNota.count({ where: { materiaId: id } }), 'nota(s)');
      add(await prisma.mobNota.count({ where: { materiaId: id } }), 'nota(s) del portal');
      add(await prisma.acadAsignacion.count({ where: { materiaId: id } }), 'asignación(es) docente');
      add(await prisma.acadHorario.count({ where: { materiaId: id } }), 'bloque(s) de horario');
      add(await prisma.docenteMateria.count({ where: { materiaId: id } }), 'en docentes (materias)');
      break;
    case 'rubricas': add(await prisma.materia.count({ where: { rubricaId: id } }), 'materia(s) que la usan'); break;
    case 'docentes':
      add(await prisma.acadAsignacion.count({ where: { docenteId: id } }), 'asignación(es) docente');
      add(await prisma.acadExtra.count({ where: { docenteId: id } }), 'actividad(es) extracurricular(es)');
      break;
    case 'staff': break;
    case 'cajas':
      add(await prisma.empleado.count({ where: { cajaId: id } }), 'en staff (caja)');
      add(await prisma.finRecibo.count({ where: { cajaId: id } }), 'recibo(s) cobrados en esta caja');
      break;
    case 'rutas': add(await prisma.servicioAlumno.count({ where: { rutaId: id } }), 'servicio(s) de transporte'); break;
    case 'becas':
      add(await prisma.finBeca.count({ where: { tipoBecaId: id } }), 'beca(s) de este tipo');
      add(await prisma.contrato.count({ where: { tipoBecaId: id } }), 'contrato(s) con este tipo de beca');
      break;
    case 'conceptosBeca': add(await prisma.finBecaConcepto.count({ where: { conceptoId: id } }), 'beca(s) con este concepto'); break;
    case 'metodosPago': {
      const m = await prisma.metodoPago.findUnique({ where: { id }, select: { nombre: true } });
      add(await prisma.finRecibo.count({ where: { metodoPagoId: id } }), 'recibo(s) cobrados con este medio');
      // pagos mixtos: el medio vive en FinReciboPago (un recibo mixto no tiene FinRecibo.metodoPagoId)
      if (m) add(await prisma.finReciboPago.count({ where: { metodoPagoId: id, recibo: { metodoPagoId: null } } }), 'recibo(s) con pago mixto que lo incluyen');
      add(await prisma.finVenta.count({ where: { metodoPagoId: id } }), 'venta(s) del kiosko');
      break;
    }
    case 'comidas': add(await prisma.aliPlanComida.count({ where: { comidaId: id } }), 'plan(es) de alimentación'); break;
    case 'dietas': add(await prisma.aliPlanDieta.count({ where: { dietaId: id } }), 'plan(es) de alimentación'); break;
    case 'alergias':
      add(await prisma.alumnoAlergia.count({ where: { alergiaId: id } }), 'alumno(s) con esta alergia');
      add(await prisma.aliMenuAlergia.count({ where: { alergiaId: id } }), 'plato(s) del menú');
      break;
  }
  return out;
}

// ---------- Resolucion de textos legados -> FK ----------
/** Seccion por (grado, letra, tanda) con los NOMBRES de siempre. '1ro' existe en Primaria y Secundaria: si hay mas de una, prefiere el nivel `nivelPrefId` (Nivel.id). */
export async function resolverSeccion(grado: string, letra: string, tanda: string, nivelPrefId?: string, db: Db = prisma): Promise<{ id: string } | { error: string }> {
  const c = await db.seccion.findMany({
    where: { letra, grado: { nombre: grado }, tanda: { nombre: tanda } },
    include: { grado: true },
  });
  const c2 = c.filter(s => norm(s.letra) === norm(letra));
  if (c2.length === 1) return { id: c2[0].id };
  if (c2.length > 1) {
    const pref = nivelPrefId ? c2.filter(s => s.grado.nivelId === nivelPrefId) : [];
    if (pref.length === 1) return { id: pref[0].id };
    return { error: `La sección ${grado} ${letra} · ${tanda} es ambigua (existe en varios niveles)` };
  }
  return { error: `No existe la sección ${grado} ${letra} · ${tanda}` };
}
