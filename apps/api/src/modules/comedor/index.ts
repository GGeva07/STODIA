import type { FastifyPluginAsync } from 'fastify';
import type { ComCarnetDto, ComEscaneoRes, ComLecturaDto, ComedorEstado } from '@stodia/shared';
import { prisma } from '../../db';
import { comedorGet, comedorSet } from '../../lib/canales';
import { SEC_INC, algDe, gst } from '../../lib/personas';
import { SaldoInsuficiente, consumoHoy, movimientoMonedero } from '../../lib/monedero';

type Carnet = Awaited<ReturnType<typeof prisma.comCarnet.findMany>>[number];
const nowT = () => new Date().toLocaleTimeString('es-DO', { hour12: false });
const lastLog = async (): Promise<ComLecturaDto[]> =>
  (await prisma.comLectura.findMany({ orderBy: [{ creado: 'desc' }, { id: 'desc' }], take: 6 })).map(l => ({ t: l.t, n: l.n, s: l.s as ComLecturaDto['s'] }));
const fmt = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * Convención ÚNICA: ComCarnet.code = Alumno.code (p. ej. EST-2026-0412) y ComCarnet.alumnoId es una FK real a Alumno.id.
 * El lector también acepta la forma corta heredada EST-<Alumno.id> (se resuelve a su alumno por id). Si el alumno tiene monedero del portal
 * (Monedero, una sola cuenta de saldo por alumno), saldo y límite salen de ahí; el consumo de hoy se calcula con sus movimientos (MonederoMovimiento).
 */
async function alumnoDeCodigo(code: string) {
  const c = code.trim().toUpperCase();
  return prisma.alumno.findFirst({ where: { OR: [{ code: c }, { id: c.replace(/^EST-/, '') }] }, include: SEC_INC });
}
/** Carnet de un código leído: por código exacto o, si no, por el alumno que ese código identifica. */
const carnetDe = async (code: string): Promise<{ carnet: Carnet | null; alumno: Awaited<ReturnType<typeof alumnoDeCodigo>> }> => {
  const c = code.trim().toUpperCase();
  const directo = await prisma.comCarnet.findUnique({ where: { code: c } });
  if (directo) return { carnet: directo, alumno: null };
  const alumno = await alumnoDeCodigo(c);
  return { carnet: alumno ? await prisma.comCarnet.findUnique({ where: { alumnoId: alumno.id } }) : null, alumno };
};

async function dtos(cs: Carnet[]): Promise<ComCarnetDto[]> {
  const ids = cs.map(c => c.alumnoId);
  const ws = new Map((await prisma.monedero.findMany({ where: { alumnoId: { in: ids } } })).map(w => [w.alumnoId, w]));
  const gastado = await consumoHoy(ids);
  // Las alergias del carnet son las del alumno (AlumnoAlergia); la pantalla del lector las muestra en mayúsculas.
  const al = new Map<string, string[]>();
  for (const x of await prisma.alumnoAlergia.findMany({ where: { alumnoId: { in: ids } }, include: { alergia: true }, orderBy: { alergiaId: 'asc' } })) al.set(x.alumnoId, [...(al.get(x.alumnoId) ?? []), x.alergia.nombre.toUpperCase()]);
  return cs.map(c => {
    const w = ws.get(c.alumnoId);
    return { code: c.code, name: c.name, grado: c.grado, plan: c.plan, ok: c.ok, allergies: al.get(c.alumnoId) ?? [], restr: c.restr, limit: w?.limite ?? 0, motivo: c.motivo, wallet: w?.saldo ?? 0, spent: gastado.get(c.alumnoId) ?? 0 } satisfies ComCarnetDto;
  });
}
const uno = async (c: Carnet) => (await dtos([c]))[0];

/** Primer escaneo de un alumno sin carnet: se crea desde la ficha del alumno SIN plan activo (estado vacío honesto; el encargado lo habilita). */
async function provisionar(a: NonNullable<Awaited<ReturnType<typeof alumnoDeCodigo>>>): Promise<Carnet> {
  const alg = algDe(a);
  await prisma.monedero.upsert({ where: { alumnoId: a.id }, update: {}, create: { alumnoId: a.id, saldo: 0, limite: 0 } }); // todo carnet tiene su monedero
  return prisma.comCarnet.create({
    data: {
      code: a.code, alumnoId: a.id, name: `${a.nombres} ${a.apellidos}`, grado: `${gst(a).grado} ${gst(a).sec} · ${gst(a).tanda}`, plan: 'Sin plan activo', ok: false,
      restr: alg ? `Alergias registradas: ${alg}` : 'Ninguna registrada.',
      motivo: 'Sin plan de comedor asignado · Referir a caja',
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
    const { carnet, alumno } = await carnetDe(code);
    // Un carnet solo se crea para un alumno que EXISTE (nunca desde un código arbitrario).
    const c = carnet ?? (alumno ? await provisionar(alumno) : null);
    if (!c) return reply.code(404).send({ error: `Carnet ${code} no reconocido` });
    const d = await uno(c);
    const s = !c.ok ? 'no' : d.allergies.length ? 'alert' : 'ok';
    await prisma.comLectura.create({ data: { t: nowT(), n: c.name, alumnoId: c.alumnoId, s } });
    return { carnet: d, log: await lastLog() };
  });

  app.post<{ Body: { code: string; precio: number } }>('/consumo', guard, async (req, reply) => {
    const { code, precio } = req.body;
    const c = (await carnetDe(String(code ?? ''))).carnet;
    if (!c || !(precio > 0)) return reply.code(400).send({ error: 'Solicitud inválida' });
    const d = await uno(c);
    if (d.spent + precio > d.limit) return reply.code(409).send({ error: `Límite diario excedido: ${fmt(d.spent)} de ${fmt(d.limit)}` });
    if (d.wallet < precio) return reply.code(409).send({ error: 'Saldo insuficiente en monedero' });
    // Débito atómico sobre el monedero único del alumno (misma cuenta que ve el portal del tutor) + movimiento de consumo.
    try { await movimientoMonedero(prisma, c.alumnoId, 'Consumo', precio, 'Consumo en comedor'); } catch (e) { if (e instanceof SaldoInsuficiente) return reply.code(409).send({ error: e.message }); throw e; }
    return { carnet: await uno(c) };
  });

  /** Habilita / ajusta el plan de un carnet: { plan?, ok?, motivo?, restr?, limit? }. */
  app.put<{ Params: { code: string }; Body: { plan?: string; aliPlanId?: string | null; ok?: boolean; motivo?: string; restr?: string; limit?: number } }>('/carnets/:code', admin, async (req, reply) => {
    const c = (await carnetDe(req.params.code)).carnet;
    if (!c) return reply.code(404).send({ error: 'Carnet no encontrado' });
    const b = req.body ?? {};
    if (b.aliPlanId && !(await prisma.aliPlan.findUnique({ where: { id: b.aliPlanId } }))) return reply.code(400).send({ error: 'Plan de alimentación inexistente' });
    const u = await prisma.comCarnet.update({
      where: { code: c.code },
      data: {
        ...(b.plan !== undefined ? { plan: String(b.plan).slice(0, 80) } : {}), ...(b.aliPlanId !== undefined ? { aliPlanId: b.aliPlanId || null } : {}), ...(b.ok !== undefined ? { ok: !!b.ok } : {}),
        ...(b.motivo !== undefined ? { motivo: String(b.motivo).slice(0, 160) } : {}), ...(b.restr !== undefined ? { restr: String(b.restr).slice(0, 300) } : {}),
      },
    });
    if (b.limit !== undefined && Number(b.limit) >= 0) await prisma.monedero.upsert({ where: { alumnoId: c.alumnoId }, update: { limite: Number(b.limit) }, create: { alumnoId: c.alumnoId, saldo: 0, limite: Number(b.limit) } });
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
