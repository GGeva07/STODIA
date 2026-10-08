import type { FastifyPluginAsync } from 'fastify';
import type { ComCarnetDto, ComEscaneoRes, ComLecturaDto, ComedorEstado } from '@stodia/shared';
import { prisma } from '../../db';

const toDto = (c: { allergies: string } & Record<string, unknown>) => ({ ...c, allergies: JSON.parse(c.allergies) }) as unknown as ComCarnetDto;
const nowT = () => new Date().toLocaleTimeString('es-DO', { hour12: false });
const lastLog = async (): Promise<ComLecturaDto[]> =>
  (await prisma.comLectura.findMany({ orderBy: [{ creado: 'desc' }, { id: 'desc' }], take: 6 })).map(l => ({ t: l.t, n: l.n, s: l.s as ComLecturaDto['s'] }));
const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero', 'Encargado Comedor')] };

  app.get('/', guard, async (): Promise<ComedorEstado> => ({
    carnets: (await prisma.comCarnet.findMany({ orderBy: { code: 'asc' } })).map(toDto),
    log: await lastLog(),
  }));

  app.post<{ Body: { code: string } }>('/escanear', guard, async (req, reply): Promise<ComEscaneoRes | void> => {
    const code = String(req.body.code ?? '').trim().toUpperCase();
    const c = await prisma.comCarnet.findUnique({ where: { code } });
    if (!c) return reply.code(404).send({ error: `Carnet ${code} no reconocido` });
    const s = !c.ok ? 'no' : JSON.parse(c.allergies).length ? 'alert' : 'ok';
    await prisma.comLectura.create({ data: { t: nowT(), n: c.name, s } });
    return { carnet: toDto(c), log: await lastLog() };
  });

  app.post<{ Body: { code: string; precio: number } }>('/consumo', guard, async (req, reply) => {
    const { code, precio } = req.body;
    const c = await prisma.comCarnet.findUnique({ where: { code } });
    if (!c || !(precio > 0)) return reply.code(400).send({ error: 'Solicitud inválida' });
    if (c.spent + precio > c.limit) return reply.code(409).send({ error: `Límite diario excedido: ${fmt(c.spent)} de ${fmt(c.limit)}` });
    if (c.wallet < precio) return reply.code(409).send({ error: 'Saldo insuficiente en monedero' });
    const u = await prisma.comCarnet.update({ where: { code }, data: { spent: c.spent + precio, wallet: c.wallet - precio } });
    return { carnet: toDto(u) };
  });
};
export default plugin;
