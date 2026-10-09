import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AcadHorarios } from '@stodia/shared';
import { prisma } from '../../db';
import { DIAS, bloquesDe, inscritosSeccion, loadCat, nombreCorto, nomina, seccionLabel, todasAsig, docenteDe, type Asig, type Cat } from '../../lib/academico';

const ROLES = ['Super Admin', 'Director Académico', 'Docente'] as const;
const AULA = '_aula:';

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole(...ROLES)] };
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  const aulaNombre = (c: Cat, id?: string) => (id ? (c.aulas.get(id)?.nombre as string | undefined) ?? '' : '');

  /** Aula efectiva de una asignación en su sección: la elegida (fila `_aula:`) o la primera posible; sin lista, el aula base de la sección. */
  const aulaDe = (c: Cat, a: Asig, elegidas: Map<string, string>): string => {
    if (a.aulas.length) { const e = elegidas.get(`${a.seccionId}|${a.materiaId}`); return aulaNombre(c, a.aulas.includes(e ?? '') ? e : a.aulas[0]); }
    return aulaNombre(c, c.secciones.get(a.seccionId)?.aula);
  };

  /** Secciones que el usuario puede ver: Super Admin / Director todas las activas; Docente las de sus asignaciones. */
  const seccionesPermitidas = async (c: Cat, req: FastifyRequest, all: Asig[]) => {
    const ids = req.user.rol === 'Docente'
      ? new Set(all.filter(a => a.docenteId === docenteDe(c, req.user)?.id).map(a => a.seccionId))
      : new Set([...c.secciones.values()].filter(s => s.estado === 'Activo').map(s => s.id));
    return [...c.secciones.values()].filter(s => ids.has(s.id)).sort((x, y) => Number(c.grados.get(x.grado)?.orden ?? 0) - Number(c.grados.get(y.grado)?.orden ?? 0) || String(x.seccion).localeCompare(String(y.seccion)) || String(x.tanda).localeCompare(String(y.tanda)));
  };

  const contexto = async (req: FastifyRequest, seccionId?: string) => {
    const c = await loadCat(), all = await todasAsig(c);
    const secs = await seccionesPermitidas(c, req, all);
    const sec = secs.find(s => s.id === seccionId) ?? (seccionId ? null : secs[0] ?? null);
    return { c, all, secs, sec };
  };

  const cargar = async (c: Cat, all: Asig[], secs: Awaited<ReturnType<typeof seccionesPermitidas>>, sec: (typeof secs)[number] | null): Promise<AcadHorarios> => {
    const vacio: AcadHorarios = {
      seccionId: '', secciones: secs.map(s => ({ id: s.id, label: seccionLabel(c, s), grupo: `${c.grados.get(s.grado)?.nivel ?? ''} · ${c.grados.get(s.grado)?.grado ?? ''}`, tanda: c.tandas.get(s.tanda)?.nombre ?? '' })), seccion: '', tanda: '', alumnos: 0, aulaBase: '', pupitres: 0,
      dias: DIAS, bloques: [], materias: [], sched: {}, tbusy: {}, abusy: {}, cap: {},
    };
    if (!sec) return vacio;
    const filas = await prisma.acadHorario.findMany();
    const elegidas = new Map(filas.filter(f => f.slot.startsWith(AULA)).map(f => [`${f.seccion}|${f.slot.slice(AULA.length)}`, f.materia]));
    const cap: Record<string, number> = {};
    for (const a of c.aulas.values()) cap[a.nombre] = Number(a.pupitres) || 0;

    const propias = all.filter(a => a.seccionId === sec.id);
    const materias = propias
      .sort((x, y) => (Number(c.materias.get(y.materiaId)?.horas) || 0) - (Number(c.materias.get(x.materiaId)?.horas) || 0) || x.materiaId.localeCompare(y.materiaId, undefined, { numeric: true }))
      .map(a => ({
        k: a.materiaId, name: a.materia, t: nombreCorto(a.docente), td: a.docenteId, aula: aulaDe(c, a, elegidas), h: Number(c.materias.get(a.materiaId)?.horas) || 0,
        ...(a.aulas.length > 1 ? { aulas: a.aulas.map(id => ({ nombre: aulaNombre(c, id), pupitres: Number(c.aulas.get(id)?.pupitres) || 0 })) } : {}),
      }));

    // Choques: docente y aula ocupados por el horario guardado de TODAS las demás secciones.
    const porSeccionMateria = new Map(all.map(a => [`${a.seccionId}|${a.materiaId}`, a]));
    const tbusy: AcadHorarios['tbusy'] = {}, abusy: AcadHorarios['abusy'] = {};
    for (const f of filas) {
      if (f.seccion === sec.id || f.slot.startsWith('_')) continue;
      const a = porSeccionMateria.get(`${f.seccion}|${f.materia}`);
      if (!a) continue;
      (tbusy[a.docenteId] ??= {})[f.slot] ??= a.seccion;
      const aula = aulaDe(c, a, elegidas);
      if (aula) (abusy[aula] ??= {})[f.slot] ??= a.seccion;
    }
    const sched: Record<string, string> = {};
    for (const f of filas) if (f.seccion === sec.id && !f.slot.startsWith('_') && materias.some(m => m.k === f.materia)) sched[f.slot] = f.materia;

    const nom = await nomina(c, sec.id);
    const aulaBase = aulaNombre(c, sec.aula);
    return {
      ...vacio, seccionId: sec.id, seccion: seccionLabel(c, sec), tanda: c.tandas.get(sec.tanda)?.nombre ?? '',
      alumnos: Math.max(await inscritosSeccion(c, sec.id), nom.length), aulaBase, pupitres: cap[aulaBase] ?? 0, bloques: bloquesDe(c, sec.tanda), materias, sched, tbusy, abusy, cap,
    };
  };

  /** Misma regla que la validación en vivo de la UI: docente ocupado, aula ocupada, capacidad. */
  const conflicto = (h: AcadHorarios, k: string, slot: string): string | null => {
    const S = h.materias.find(m => m.k === k)!, [d, b] = slot.split('-').map(Number);
    const tb = h.tbusy[S.td]?.[slot];
    if (tb) return `Docente ocupado: Prof. ${S.t} imparte en ${tb} el ${h.dias[d]} ${h.bloques[b]}.`;
    const ab = h.abusy[S.aula]?.[slot];
    if (ab) return `Aula ocupada: ${S.aula} asignada a ${ab} en ese bloque.`;
    if ((h.cap[S.aula] ?? Infinity) < h.alumnos) return `Capacidad excedida: ${S.aula} tiene ${h.cap[S.aula]} pupitres; ${h.seccion} tiene ${h.alumnos} alumnos.`;
    return null;
  };

  app.get<{ Querystring: { seccion?: string } }>('/', guard, async (req, reply) => {
    const { c, all, secs, sec } = await contexto(req, req.query.seccion);
    if (req.query.seccion && !sec) return reply.code(403).send({ error: 'Sin permiso sobre esa sección' });
    return cargar(c, all, secs, sec);
  });

  /** Asigna (`materia`) o libera (`materia: null`) un bloque; `desde` = bloque de origen si se arrastró desde la grilla. */
  app.put<{ Body: { seccion?: string; slot: string; materia: string | null; desde?: string | null } }>('/slot', guard, async (req, reply) => {
    const { slot, materia, desde } = req.body;
    if (!/^[0-4]-[0-5]$/.test(slot ?? '')) return reply.code(400).send({ error: 'Bloque inválido' });
    const { c, all, secs, sec } = await contexto(req, req.body.seccion);
    if (!sec) return reply.code(403).send({ error: 'Sin permiso sobre esa sección' });
    if (materia) {
      const h = await cargar(c, all, secs, sec);
      if (!h.materias.some(m => m.k === materia)) return reply.code(400).send({ error: 'Materia inválida' });
      const msg = conflicto(h, materia, slot);
      if (msg) return reply.code(409).send({ error: msg });
      await prisma.acadHorario.upsert({ where: { seccion_slot: { seccion: sec.id, slot } }, update: { materia }, create: { seccion: sec.id, slot, materia } });
    } else {
      await prisma.acadHorario.deleteMany({ where: { seccion: sec.id, slot } });
    }
    if (materia && desde && desde !== slot && /^[0-4]-[0-5]$/.test(desde)) await prisma.acadHorario.deleteMany({ where: { seccion: sec.id, slot: desde } });
    return cargar(c, all, secs, sec);
  });

  /** Elige el aula de una materia que admite varias (p. ej. Ed. Artística). */
  app.put<{ Body: { seccion?: string; materia: string; aula: string } }>('/aula', guard, async (req, reply) => {
    const { c, all, secs, sec } = await contexto(req, req.body.seccion);
    if (!sec) return reply.code(403).send({ error: 'Sin permiso sobre esa sección' });
    const a = all.find(x => x.seccionId === sec.id && x.materiaId === req.body.materia);
    const id = a?.aulas.find(x => aulaNombre(c, x) === req.body.aula);
    if (!a || !id) return reply.code(400).send({ error: 'Aula inválida' });
    const slot = AULA + a.materiaId;
    await prisma.acadHorario.upsert({ where: { seccion_slot: { seccion: sec.id, slot } }, update: { materia: id }, create: { seccion: sec.id, slot, materia: id } });
    return cargar(c, all, secs, sec);
  });

  // ---- Administración de asignaciones (Super Admin). Las del catálogo Docentes (materias x secciones) se heredan solas. ----
  app.get('/asignaciones', sa, async () => {
    const c = await loadCat();
    return (await todasAsig(c)).map(a => ({ id: a.id, explicita: a.explicita, docenteId: a.docenteId, docente: a.docente, seccionId: a.seccionId, seccion: a.seccion, materiaId: a.materiaId, materia: a.materia, tanda: a.tanda, aulas: a.aulas.map(i => aulaNombre(c, i)) }));
  });
  app.put<{ Body: { docenteId: string; seccionId: string; materiaId: string; aulas?: string[] } }>('/asignaciones', sa, async (req, reply) => {
    const { docenteId, seccionId, materiaId } = req.body;
    const c = await loadCat();
    const aulas = (req.body.aulas ?? []).filter(i => c.aulas.has(i));
    if (!c.docentes.has(docenteId) || !c.secciones.has(seccionId) || !c.materias.has(materiaId)) return reply.code(400).send({ error: 'Docente, sección o materia inexistente en el catálogo' });
    const r = await prisma.acadAsignacion.upsert({ where: { seccionId_materiaId: { seccionId, materiaId } }, update: { docenteId, aulas: JSON.stringify(aulas) }, create: { docenteId, seccionId, materiaId, aulas: JSON.stringify(aulas) } });
    return { id: r.id };
  });
  app.delete<{ Params: { id: string } }>('/asignaciones/:id', sa, async (req, reply) => {
    const r = await prisma.acadAsignacion.deleteMany({ where: { id: req.params.id } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'Asignación explícita no encontrada' });
  });
};
export default plugin;
