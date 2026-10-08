import type { FastifyPluginAsync } from 'fastify';
import type { PlanForm, PlanPagoFin } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { nextSeq, supervisorOk } from '../../fin-utils';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const toPlan = (r: { id: string; alumnos: number; data: string }): PlanPagoFin => ({ ...(JSON.parse(r.data) as PlanForm), id: r.id, alumnos: r.alumnos });

/** Tandas definidas por la institución (Catálogo 'tandas'). */
async function tandasActivas(): Promise<string[]> {
  return (await prisma.catalogo.findMany({ where: { tipo: 'tandas' }, orderBy: { id: 'asc' } })).map(r => String((JSON.parse(r.data) as { nombre?: string }).nombre ?? '')).filter(Boolean);
}

function validate(f: PlanForm, TANDAS: string[]): string | null {
  const n = parseInt(f.n) || 0, anual = parseFloat(f.anual) || 0, dia = parseInt(f.dia);
  if (!f.name?.trim()) return 'El nombre del plan es obligatorio.';
  if (!(n >= 1 && n <= 12)) return 'El número de cuotas debe estar entre 1 y 12.';
  if (f.freq === '0' && n !== 1) return 'Un pago único debe tener 1 cuota.';
  if (f.freq !== '0' && n * Number(f.freq) > 12) return 'La frecuencia y el número de cuotas exceden el ciclo de 12 meses.';
  if (f.porTanda) {
    const bad = TANDAS.find(t => !(parseFloat(f.tm?.[t] ?? '') > 0));
    if (bad) return 'Define un monto mayor que cero para la tanda ' + bad + '.';
  } else if (!(anual > 0)) return 'El monto anual debe ser mayor que cero.';
  if (!(dia >= 1 && dia <= 28)) return 'El día de vencimiento debe estar entre 1 y 28.';
  return null;
}

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };
  const dupName = async (name: string, exceptId?: string) => (await prisma.finPlan.findMany()).some(p => p.id !== exceptId && norm(p.name) === norm(name));
  const newId = async () => 'PLN-' + String(await nextSeq('pln')).padStart(3, '0');

  app.get('/', auth, async () => (await prisma.finPlan.findMany({ orderBy: { id: 'asc' } })).map(toPlan));

  app.post<{ Body: PlanForm }>('/', auth, async (req, reply) => {
    const f = { ...req.body, name: req.body.name?.trim() ?? '' };
    const err = validate(f, await tandasActivas()) ?? ((await dupName(f.name)) ? 'Ya existe un plan con ese nombre.' : null);
    if (err) return reply.code(400).send({ error: err });
    const cr = await prisma.finPlan.create({ data: { id: await newId(), name: f.name, estado: f.estado, alumnos: 0, data: JSON.stringify(f) } });
    await audit(req.user, 'Insert', { tabla: 'PlanesPago', id: cr.id, next: cr.name, ip: req.ip });
    return toPlan(cr);
  });

  // Modificar/eliminar: Super Admin directo; otros roles con clave de supervisor.
  app.put<{ Params: { id: string }; Body: PlanForm & { pin?: string } }>('/:id', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body.pin, 'plan.modificar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const { pin: _pin, ...body } = req.body;
    const { alumnos: _a, id: _i, ...f } = { ...body, name: body.name?.trim() ?? '' } as PlanForm & { alumnos?: number; id?: string };
    const err = validate(f, await tandasActivas()) ?? ((await dupName(f.name, req.params.id)) ? 'Ya existe un plan con ese nombre.' : null);
    if (err) return reply.code(400).send({ error: err });
    const prevP = await prisma.finPlan.findUnique({ where: { id: req.params.id } });
    const up = await prisma.finPlan.update({ where: { id: req.params.id }, data: { name: f.name, estado: f.estado, data: JSON.stringify(f) } });
    await audit(req.user, 'Update', { tabla: 'PlanesPago', id: up.id, prev: prevP?.name, next: up.name, ip: req.ip });
    return toPlan(up);
  });

  app.post<{ Params: { id: string } }>('/:id/duplicar', auth, async (req, reply) => {
    const src = await prisma.finPlan.findUnique({ where: { id: req.params.id } });
    if (!src) return reply.code(404).send({ error: 'Plan no encontrado' });
    const name = src.name + ' (copia)';
    const dup = await prisma.finPlan.create({ data: { id: await newId(), name, estado: 'Inactivo', alumnos: 0, data: JSON.stringify({ ...JSON.parse(src.data), name, estado: 'Inactivo' }) } });
    await audit(req.user, 'Insert', { tabla: 'PlanesPago', id: dup.id, prev: src.id, next: name, ip: req.ip });
    return toPlan(dup);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/eliminar', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body?.pin, 'plan.eliminar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const p = await prisma.finPlan.findUnique({ where: { id: req.params.id } });
    if (!p) return reply.code(404).send({ error: 'Plan no encontrado' });
    if (p.alumnos > 0) return reply.code(409).send({ error: `No se puede eliminar: ${p.alumnos} alumnos tienen este plan asignado. Reasígnalos o márcalo Inactivo.` });
    await prisma.finPlan.delete({ where: { id: p.id } });
    await audit(req.user, 'Delete', { tabla: 'PlanesPago', id: p.id, prev: p.name, ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
