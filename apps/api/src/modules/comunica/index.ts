import type { FastifyPluginAsync } from 'fastify';
import type { CmnDestinatarios, CmnEnviarReq, CmnEnviarRes, CmnFiltro, CmnMensajeDto } from '@stodia/shared';
import { prisma } from '../../db';
import { saldoVencidoPorAlumno } from '../../lib/cxc';

const CANALES = ['Correo', 'Push', 'SMS', 'WhatsApp'];

async function destinatarios(f: CmnFiltro): Promise<CmnDestinatarios> {
  const alumnos = await prisma.alumno.findMany({
    where: { estado: 'Activo', ...(f.grado ? { grado: f.grado } : {}), ...(f.tanda ? { tanda: f.tanda } : {}), ...(f.cuenta ? { cuenta: f.cuenta } : {}) },
    include: { tutor: true }, orderBy: { id: 'asc' },
  });
  const nombre = (a: (typeof alumnos)[number]) => a.tutor?.nombre ?? '';
  const tutores = [...new Set(alumnos.map(nombre).filter(Boolean))];
  const a = alumnos[0];
  return { tutores, muestra: a ? { tutor: nombre(a), alumno: a.nombres, saldo: (await saldoVencidoPorAlumno([a.id]))[a.id] ?? 0 } : null };
}

const toDto = (m: { id: number; batch: string; t: string; to: string; canal: string; asunto: string; estado: string; by: string }) => m as CmnMensajeDto;

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico')] };

  app.get<{ Querystring: Partial<CmnFiltro> }>('/destinatarios', guard, async req =>
    destinatarios({ grado: req.query.grado ?? '', tanda: req.query.tanda ?? '', cuenta: req.query.cuenta ?? '' }));

  app.post<{ Body: CmnEnviarReq }>('/enviar', guard, async (req, reply): Promise<CmnEnviarRes | void> => {
    const { canales, asunto, mensaje } = req.body;
    if (!asunto?.trim() || !mensaje?.trim()) return reply.code(400).send({ error: 'Completa asunto y mensaje' });
    const cs = CANALES.filter(c => canales?.includes(c as never));
    if (!cs.length) return reply.code(400).send({ error: 'Elige al menos un canal' });
    const { tutores } = await destinatarios(req.body);
    if (!tutores.length) return reply.code(400).send({ error: 'El filtro no tiene destinatarios' });
    const batch = 'B' + Date.now().toString(36);
    const t = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Se encola; el envío real a proveedores (SMTP/SMS/WhatsApp/Push) está simulado en /procesar. TODO: integrar proveedores.
    const data = tutores.flatMap(to => cs.map(canal => ({ batch, t, to, canal, asunto: asunto.trim(), estado: 'En cola', by: req.user.usuario })));
    await prisma.cmnMensaje.createMany({ data });
    return { batch, total: data.length };
  });

  app.get<{ Querystring: { estado?: string } }>('/bandeja', guard, async req => {
    const [all, rows] = await Promise.all([
      prisma.cmnMensaje.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.cmnMensaje.findMany({ where: req.query.estado ? { estado: req.query.estado } : {}, orderBy: [{ t: 'desc' }, { id: 'desc' }], take: 60 }),
    ]);
    const n = (e: string) => all.find(x => x.estado === e)?._count._all ?? 0;
    return { rows: rows.map(toDto), conteos: { todos: all.reduce((a, x) => a + x._count._all, 0), 'En cola': n('En cola'), Entregado: n('Entregado'), Fallido: n('Fallido') } };
  });

  /** Simula el worker de envío: procesa hasta 4 mensajes en cola (id % 9 === 4 falla salvo que sea un reintento). */
  app.post<{ Querystring: { batch?: string } }>('/procesar', guard, async req => {
    const cola = await prisma.cmnMensaje.findMany({ where: { estado: 'En cola' }, orderBy: { id: 'asc' }, take: 4 });
    for (const m of cola) await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: m.id % 9 === 4 && !m.batch.endsWith('~r') ? 'Fallido' : 'Entregado' } });
    const batch = req.query.batch;
    const lote = batch ? await prisma.cmnMensaje.findMany({ where: { batch: { startsWith: batch } }, select: { estado: true } }) : [];
    return {
      restantes: await prisma.cmnMensaje.count({ where: { estado: 'En cola' } }),
      lote: { total: lote.length, hechos: lote.filter(x => x.estado !== 'En cola').length, fallidos: lote.filter(x => x.estado === 'Fallido').length },
    };
  });

  app.post('/reintentar', guard, async () => {
    const fallidos = await prisma.cmnMensaje.findMany({ where: { estado: 'Fallido' } });
    for (const m of fallidos) await prisma.cmnMensaje.update({ where: { id: m.id }, data: { estado: 'En cola', batch: m.batch + '~r' } });
    return { reintentados: fallidos.length };
  });
};
export default plugin;
