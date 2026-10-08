import type { FastifyPluginAsync } from 'fastify';
import type { AcadNotaGuardada, AcadNotasMatriz } from '@stodia/shared';
import { prisma } from '../../db';
import { PERIODOS, ahora, elegirAsig, loadCat, materializar, nomina, optDe, periodoDe, periodoLabel, rubricaDe } from '../../lib/academico';

const ROLES = ['Super Admin', 'Director Académico', 'Docente'] as const;
const str = (v: number | null | undefined) => (v == null ? '' : String(v));

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole(...ROLES)] };

  /** Matriz de la asignación elegida (`asig`, por defecto la primera del usuario) y período (`periodo`, por defecto el vigente). */
  app.get<{ Querystring: { asig?: string; periodo?: string } }>('/', guard, async (req, reply) => {
    const cat = await loadCat();
    const { lista, sel, prohibida } = await elegirAsig(cat, req.user, req.query.asig);
    if (prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const periodo = PERIODOS.some(p => p.k === req.query.periodo) ? req.query.periodo! : periodoDe((await ahora()).fecha);
    const base = { periodos: PERIODOS, asignaciones: lista.map(optDe) };
    if (!sel) {
      const vacio: AcadNotasMatriz = { ...base, seccion: '', materia: '', periodo, periodoLabel: periodoLabel(periodo), docente: '', comps: [], rows: [], nivel: '', minimo: 70, rubrica: '', asigId: '' };
      return vacio;
    }
    const rub = rubricaDe(cat, sel.materiaId);
    const nom = await nomina(cat, sel.seccionId);
    const notas = await prisma.acadNota.findMany({ where: { materia: sel.materiaId, periodo, rosterId: { in: nom.flatMap(n => (n.rosterId ? [n.rosterId] : [])) } } });
    const porRoster = new Map(notas.map(n => [n.rosterId, n]));
    const res: AcadNotasMatriz = {
      ...base, seccion: sel.seccion, materia: sel.materia, periodo, periodoLabel: periodoLabel(periodo), docente: sel.docente,
      nivel: sel.nivel, minimo: rub.minimo, rubrica: rub.nombre, asigId: sel.id,
      comps: rub.comps.map(({ k, n, w }) => ({ k, n, w })),
      rows: nom.map((n, i) => { const nt = n.rosterId ? porRoster.get(n.rosterId) : undefined; return { id: n.key, nombre: n.nombre, orden: i + 1, g: rub.comps.map(c => str(nt?.[c.field])) }; }),
    };
    return res;
  });

  /** Guarda una celda. `valor` '' = vaciar; 0–100 válido. Devuelve el cambio para el registro de auditoría. */
  app.put<{ Body: { rosterId: string; comp: number; valor: string; asig?: string; periodo?: string } }>('/celda', guard, async (req, reply) => {
    const { rosterId, comp, valor, asig, periodo: per } = req.body;
    const cat = await loadCat();
    const { sel, prohibida } = await elegirAsig(cat, req.user, asig);
    if (!sel || prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const field = rubricaDe(cat, sel.materiaId).comps[comp]?.field;
    const n = valor === '' ? null : Number(valor);
    if (!field || !rosterId || (n !== null && (!Number.isFinite(n) || n < 0 || n > 100))) return reply.code(400).send({ error: 'Nota inválida: debe estar entre 0 y 100' });
    const item = (await nomina(cat, sel.seccionId)).find(x => x.key === rosterId);
    if (!item) return reply.code(404).send({ error: 'Estudiante no encontrado en la matriz' });
    const periodo = PERIODOS.some(p => p.k === per) ? per! : periodoDe((await ahora()).fecha);
    const rid = await materializar(item, sel.seccionId);
    const where = { rosterId_materia_periodo: { rosterId: rid, materia: sel.materiaId, periodo } };
    const prev = await prisma.acadNota.findUnique({ where });
    await prisma.acadNota.upsert({ where, update: { [field]: n }, create: { rosterId: rid, materia: sel.materiaId, periodo, [field]: n } });
    const res: AcadNotaGuardada = { t: new Date().toISOString().slice(11, 19) + 'Z', usr: req.user.usuario, ip: req.ip, prev: str(prev?.[field]), next: str(n) };
    return res;
  });
};
export default plugin;
