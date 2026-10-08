import type { FastifyPluginAsync } from 'fastify';
import type { AuditoriaList, AuditoriaRow } from '@stodia/shared';
import { prisma } from '../../db';
import { today } from '../../lib/license';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const plugin: FastifyPluginAsync = async app => {
  /** Registro append-only (no hay PUT/DELETE). Filtros: q (tabla/registro/valores), user, act, day=today|prev. */
  app.get<{ Querystring: { q?: string; user?: string; act?: string; day?: string } }>(
    '/', { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico')] },
    async (req): Promise<AuditoriaList> => {
      const { q = '', user = '', act = '', day = '' } = req.query;
      const all = await prisma.sisAudit.findMany({ orderBy: { t: 'desc' }, take: 2000 });
      const nq = norm(q.trim()), td = today();
      const rows = all.filter(l =>
        (!user || l.usr === user) && (!act || l.accion === act) && (!day || (day === 'today') === l.t.startsWith(td)) &&
        (!nq || norm(`${l.tabla} ${l.registro} ${l.prev} ${l.next}`).includes(nq)));
      return {
        total: all.length, count: rows.length, users: [...new Set(all.map(l => l.usr))].sort(),
        rows: rows.slice(0, 120).map((l): AuditoriaRow => ({ id: l.id, t: l.t, usr: l.usr, a: l.accion as AuditoriaRow['a'], tabla: l.tabla, registro: l.registro, prev: l.prev, next: l.next, ip: l.ip })),
      };
    },
  );
};
export default plugin;
