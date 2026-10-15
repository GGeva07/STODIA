/**
 * Actividades extracurriculares (AcadExtra): resuelve el texto visible a sus FK reales.
 *  - `instructor` ("Prof. José Cruz") -> Docente.id cuando coincide con UN docente (si es una persona externa queda NULL y se conserva el texto).
 *  - `lugar` -> Aula.id cuando coincide con un aula (la piscina o la cancha externa quedan solo como texto).
 *  - `grados` ("4to – 6to", "1ro – 3ro Sec.") <-> filas de AcadExtraGrado (un rango contiguo dentro de UN nivel; «Sec.» = Secundaria, si no Primaria).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Db = typeof prisma | Prisma.TransactionClient;
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const TITULO = /^(prof(?:esora?)?\.?|mtro\.?|mtra\.?|lic\.?|licda\.?|ing\.?|dr\.?|dra\.?|sensei|coach|maestr[oa])\s+/i;

export async function resolverRefs(db: Db, instructor: string, lugar: string): Promise<{ docenteId: string | null; aulaId: string | null }> {
  const nom = norm(String(instructor).replace(TITULO, ''));
  let docenteId: string | null = null;
  if (nom) {
    const ds = (await db.docente.findMany({ select: { id: true, nombre: true } })).filter(d => { const n = norm(d.nombre); return n === nom || n.startsWith(nom + ' '); });
    if (ds.length === 1) docenteId = ds[0].id;
  }
  const l = norm(lugar);
  const aula = l ? (await db.aula.findMany({ select: { id: true, nombre: true } })).find(a => norm(a.nombre) === l) : undefined;
  return { docenteId, aulaId: aula?.id ?? null };
}

/** "4to – 6to" / "1ro - 3ro Sec." -> ids de Grado, o null si el texto no es un rango reconocible. */
export async function gradosDeRango(db: Db, txt: string): Promise<string[] | null> {
  const t = String(txt ?? '').trim();
  if (!t) return null;
  // Un solo grado («Pre-primario», «1ro Sec.»): se busca primero por nombre exacto, porque un nombre con guion («Pre-primario») se confundiría con un rango.
  const todos = await db.grado.findMany({ include: { nivel: true }, orderBy: { orden: 'asc' } });
  const q = norm(t.replace(/\s+(sec|ini)\.?$/i, '')), sec = /\s+sec\.?$/i.test(t), ini = /\s+ini\.?$/i.test(t);
  const hit = todos.filter(g => norm(g.nombre) === q);
  if (hit.length) {
    const pref = hit.find(g => g.nivel.nombre === (sec ? 'Secundaria' : ini ? 'Inicial' : 'Primaria')) ?? (hit.length === 1 ? hit[0] : undefined);
    return pref ? [pref.id] : null;
  }
  const m = /^\s*([^\s–-]+)\s*[–-]\s*([^\s–-]+)(\s+(?:sec|ini)\.?)?\s*$/i.exec(t);
  if (!m) return null;
  const nivel = m[3] ? (/ini/i.test(m[3]) ? 'Inicial' : 'Secundaria') : 'Primaria';
  const gs = (await db.grado.findMany({ where: { nivel: { nombre: nivel } }, orderBy: { orden: 'asc' } }));
  const a = gs.findIndex(g => norm(g.nombre) === norm(m[1])), b = gs.findIndex(g => norm(g.nombre) === norm(m[2]));
  if (a < 0 || b < 0 || b < a) return null;
  return gs.slice(a, b + 1).map(g => g.id);
}

/** Etiqueta de los grados de una actividad ("4to – 6to", "1ro – 3ro Sec."): se reconstruye de AcadExtraGrado. */
export function etiquetaGrados(gs: { nombre: string; orden: number; nivel: string }[]): string {
  if (!gs.length) return '';
  const o = [...gs].sort((x, y) => x.orden - y.orden);
  const sec = o.every(g => g.nivel === 'Secundaria') ? ' Sec.' : o.every(g => g.nivel === 'Inicial') && o.length > 1 ? ' Ini.' : '';
  return o.length === 1 ? o[0].nombre + sec : `${o[0].nombre} – ${o[o.length - 1].nombre}${sec}`;
}
