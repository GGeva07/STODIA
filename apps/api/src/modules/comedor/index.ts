import type { FastifyPluginAsync } from 'fastify';
import type { ComCarnetDto, ComEscaneoRes, ComLecturaDto, ComedorEstado } from '@stodia/shared';
import { prisma } from '../../db';
import { comedorGet, comedorSet } from '../../lib/canales';

type Carnet = Awaited<ReturnType<typeof prisma.comCarnet.findMany>>[number];
const nowT = () => new Date().toLocaleTimeString('es-DO', { hour12: false });
const lastLog = async (): Promise<ComLecturaDto[]> =>
  (await prisma.comLectura.findMany({ orderBy: [{ creado: 'desc' }, { id: 'desc' }], take: 6 })).map(l => ({ t: l.t, n: l.n, s: l.s as ComLecturaDto['s'] }));
const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** El carnet EST-<id> corresponde al alumno <id>; si ese alumno tiene monedero del portal (MobWallet), saldo y límite salen de ahí (fuente única con la recarga del tutor). */
const alumnoIdDe = (code: string) => code.replace(/^EST-/, '');

async function dtos(cs: Carnet[]): Promise<ComCarnetDto[]> {
  const ws = new Map((await prisma.mobWallet.findMany({ where: { alumnoId: { in: cs.map(c => alumnoIdDe(c.code)) } } })).map(w => [w.alumnoId, w]));
  return cs.map(c => {
    const w = ws.get(alumnoIdDe(c.code));
    return { ...c, allergies: JSON.parse(c.allergies), ...(w ? { wallet: w.saldo, limit: w.limite } : {}) } as unknown as ComCarnetDto;
  });
}
const uno = async (c: Carnet) => (await dtos([c]))[0];

/** Primer escaneo de un alumno sin carnet: se crea desde la ficha del alumno SIN plan activo (estado vacío honesto; el encargado lo habilita). */
async function provisionar(code: string): Promise<Carnet | null> {
  const a = await prisma.alumno.findFirst({ where: { OR: [{ code }, { id: alumnoIdDe(code) }] } });
  if (!a) return null;
  const w = await prisma.mobWallet.findUnique({ where: { alumnoId: a.id } });
  const alg = a.alg.trim();
  return prisma.comCarnet.create({
    data: {
      code, name: `${a.nombres} ${a.apellidos}`, grado: `${a.grado} ${a.sec} · ${a.tanda}`, plan: 'Sin plan activo', ok: false,
      allergies: JSON.stringify(alg ? alg.split(/[,;/]/).map(s => s.trim().toUpperCase()).filter(Boolean) : []), restr: alg ? `Alergias registradas: ${alg}` : 'Ninguna registrada.',
      limit: w?.limite ?? 0, motivo: 'Sin plan de comedor asignado · Referir a caja', wallet: w?.saldo ?? 0, spent: 0,
    },
  });
}

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero', 'Encargado Comedor')] };
  const admin = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Encargado Comedor')] };

  app.get('/', guard, async (): Promise<ComedorEstado> => {
    const [cs, log, cfg] = await Promise.all([prisma.comCarnet.findMany(), lastLog(), comedorGet()]);
    return { carnets: await dtos(cs), log, encabezado: cfg.encabezado, consumos: cfg.consumos };
  });

  app.post<{ Body: { code: string } }>('/escanear', guard, async (req, reply): Promise<ComEscaneoRes | void> => {
    const code = String(req.body.code ?? '').trim().toUpperCase();
    const c = (await prisma.comCarnet.findUnique({ where: { code } })) ?? (await provisionar(code));
    if (!c) return reply.code(404).send({ error: `Carnet ${code} no reconocido` });
    const d = await uno(c);
    const s = !c.ok ? 'no' : d.allergies.length ? 'alert' : 'ok';
    await prisma.comLectura.create({ data: { t: nowT(), n: c.name, s } });
    return { carnet: d, log: await lastLog() };
  });

  app.post<{ Body: { code: string; precio: number } }>('/consumo', guard, async (req, reply) => {
    const { code, precio } = req.body;
    const c = await prisma.comCarnet.findUnique({ where: { code } });
    if (!c || !(precio > 0)) return reply.code(400).send({ error: 'Solicitud inválida' });
    const d = await uno(c);
    if (c.spent + precio > d.limit) return reply.code(409).send({ error: `Límite diario excedido: ${fmt(c.spent)} de ${fmt(d.limit)}` });
    if (d.wallet < precio) return reply.code(409).send({ error: 'Saldo insuficiente en monedero' });
    const aid = alumnoIdDe(code);
    if (await prisma.mobWallet.findUnique({ where: { alumnoId: aid } })) {
      // Débito atómico sobre el monedero del tutor (misma fuente que ve el portal).
      const r = await prisma.mobWallet.updateMany({ where: { alumnoId: aid, saldo: { gte: precio } }, data: { saldo: { decrement: precio } } });
      if (!r.count) return reply.code(409).send({ error: 'Saldo insuficiente en monedero' });
    }
    const u = await prisma.comCarnet.update({ where: { code }, data: { spent: c.spent + precio, wallet: c.wallet - precio } });
    return { carnet: await uno(u) };
  });

  /** Habilita / ajusta el plan de un carnet: { plan?, ok?, motivo?, restr?, limit? }. */
  app.put<{ Params: { code: string }; Body: { plan?: string; ok?: boolean; motivo?: string; restr?: string; limit?: number } }>('/carnets/:code', admin, async (req, reply) => {
    const c = await prisma.comCarnet.findUnique({ where: { code: req.params.code.toUpperCase() } });
    if (!c) return reply.code(404).send({ error: 'Carnet no encontrado' });
    const b = req.body ?? {};
    const u = await prisma.comCarnet.update({
      where: { code: c.code },
      data: {
        ...(b.plan !== undefined ? { plan: String(b.plan).slice(0, 80) } : {}), ...(b.ok !== undefined ? { ok: !!b.ok } : {}),
        ...(b.motivo !== undefined ? { motivo: String(b.motivo).slice(0, 160) } : {}), ...(b.restr !== undefined ? { restr: String(b.restr).slice(0, 300) } : {}),
        ...(b.limit !== undefined && Number(b.limit) >= 0 ? { limit: Number(b.limit) } : {}),
      },
    });
    return { carnet: await uno(u) };
  });

  /** Encabezado de la pantalla, botones de consumo del monedero y montos de recarga (SisConfig 'comedor'). */
  app.put<{ Body: { encabezado?: string; consumos?: { l: string; p: number }[]; recargas?: number[] } }>('/config', admin, async (req, reply) => {
    const b = req.body ?? {}, cur = await comedorGet();
    const consumos = b.consumos === undefined ? cur.consumos : b.consumos.map(x => ({ l: String(x.l ?? '').trim().slice(0, 40), p: Number(x.p) })).filter(x => x.l && x.p > 0).slice(0, 8);
    const recargas = b.recargas === undefined ? cur.recargas : [...new Set(b.recargas.map(Number))].filter(n => n > 0).sort((x, y) => x - y).slice(0, 6);
    if (!recargas.length) return reply.code(400).send({ error: 'Indica al menos un monto de recarga' });
    await comedorSet({ recargas, consumos, encabezado: b.encabezado === undefined ? cur.encabezado : String(b.encabezado).trim().slice(0, 160) });
    return comedorGet();
  });
};
export default plugin;
