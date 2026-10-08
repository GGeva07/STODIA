import type { FastifyPluginAsync } from 'fastify';
import type { AliData, AliMenuDto, AliPlanDto, AliPlanInput } from '@stodia/shared';
import { prisma } from '../../db';
import { norm } from '../../seed-data';
import { DIAS_SEMANA, catalogosAli, ensureMenuSemanal, semanaDe } from '../../lib/ali-catalogos';
import { partesEnZona, zonaHoraria } from '../../lib/cxc';

type Row = Awaited<ReturnType<typeof prisma.aliPlan.findMany>>[number];
const toDto = (p: Row): AliPlanDto => ({
  id: p.id, name: p.name, modelo: p.modelo as 'sub' | 'wal', meals: JSON.parse(p.meals), precio: p.precio == null ? '' : String(p.precio),
  freq: p.freq, dias: p.dias, mora: p.mora ? 'si' : 'no', recarga: p.recarga == null ? '' : String(p.recarga), limite: p.limite == null ? '' : String(p.limite),
  canal: p.canal, saldo: p.saldo, diets: JSON.parse(p.diets), estado: p.estado as 'Activo' | 'Inactivo', inscritos: p.inscritos,
});
const num = (v: string) => (v === '' || v == null ? null : Number(v));

function validate(f: AliPlanInput, others: Row[]): string | null {
  const sub = f.modelo === 'sub';
  if (!f.name?.trim()) return 'El nombre es obligatorio.';
  if (others.some(p => norm(p.name) === norm(f.name.trim()))) return 'Ya existe un plan con ese nombre.';
  if (sub && !f.meals.some(Boolean)) return 'Selecciona al menos una comida incluida.';
  if (sub && !(Number(f.precio) > 0)) return 'El precio debe ser mayor que cero.';
  if (!sub && !(Number(f.recarga) > 0)) return 'La recarga mínima debe ser mayor que cero.';
  if (!sub && f.limite && !(Number(f.limite) > 0)) return 'El límite diario debe ser mayor que cero.';
  return null;
}
const data = (f: AliPlanInput) => ({
  name: f.name.trim(), modelo: f.modelo, meals: JSON.stringify(f.meals), precio: num(f.precio), freq: f.freq, dias: f.dias, mora: f.mora === 'si',
  recarga: num(f.recarga), limite: num(f.limite), canal: f.canal, saldo: f.saldo, diets: JSON.stringify(f.diets), estado: f.estado,
});

const plugin: FastifyPluginAsync = async app => {
  const read = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero', 'Encargado Comedor')] };
  const write = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Encargado Comedor')] };

  app.get('/', read, async (): Promise<AliData> => {
    await ensureMenuSemanal();
    const [planes, menu, alumnos, catalogos, tz] = await Promise.all([
      prisma.aliPlan.findMany({ orderBy: { id: 'asc' } }), prisma.aliMenu.findMany({ orderBy: { orden: 'asc' } }), prisma.alumno.findMany({ select: { alg: true } }),
      catalogosAli(), zonaHoraria(),
    ]);
    // La semana se calcula de la fecha real (zona del colegio): lunes a viernes; el menú es la plantilla semanal vigente.
    const sem = semanaDe(partesEnZona(tz));
    const conAlergia = alumnos.filter(a => a.alg);
    const m: AliMenuDto[] = menu.map(d => {
      const algs: string[] = JSON.parse(d.algs);
      const afectados: Record<string, number> = {};
      for (const a of algs) { const n = conAlergia.filter(x => norm(x.alg).includes(norm(a))).length; if (n) afectados[a] = n; }
      const nombre = d.dia.replace(/\s*\d+\s*$/, '') || DIAS_SEMANA[d.orden] || d.dia;
      return { dia: sem.diaMes[d.orden] ? `${nombre} ${sem.diaMes[d.orden]}` : nombre, plato: d.plato, algs, afectados };
    });
    return { planes: planes.map(toDto), menu: m, alumnosConAlergia: conAlergia.length, semana: { desde: sem.desde, hasta: sem.hasta, label: sem.label }, catalogos };
  });

  app.post<{ Body: AliPlanInput }>('/planes', write, async (req, reply) => {
    const err = validate(req.body, await prisma.aliPlan.findMany());
    if (err) return reply.code(400).send({ error: err });
    const last = (await prisma.aliPlan.findMany({ select: { id: true } })).map(p => Number(p.id.replace('ALI-', '')) || 0);
    const id = 'ALI-' + String(Math.max(0, ...last) + 1).padStart(3, '0');
    return toDto(await prisma.aliPlan.create({ data: { id, ...data(req.body) } }));
  });

  app.put<{ Params: { id: string }; Body: AliPlanInput }>('/planes/:id', write, async (req, reply) => {
    const { id } = req.params;
    if (!(await prisma.aliPlan.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Plan no encontrado' });
    const err = validate(req.body, await prisma.aliPlan.findMany({ where: { id: { not: id } } }));
    if (err) return reply.code(400).send({ error: err });
    return toDto(await prisma.aliPlan.update({ where: { id }, data: data(req.body) }));
  });

  app.delete<{ Params: { id: string } }>('/planes/:id', write, async (req, reply) => {
    const p = await prisma.aliPlan.findUnique({ where: { id: req.params.id } });
    if (!p) return reply.code(404).send({ error: 'Plan no encontrado' });
    if (p.inscritos > 0) return reply.code(409).send({ error: `No se puede eliminar: ${p.inscritos} alumnos inscritos. Márcalo Inactivo para cerrar nuevas inscripciones.` });
    await prisma.aliPlan.delete({ where: { id: p.id } });
    return { ok: true };
  });

  app.put<{ Params: { orden: string }; Body: { plato: string; algs: string[] } }>('/menu/:orden', write, async (req, reply) => {
    const orden = Number(req.params.orden);
    const plato = String(req.body.plato ?? '').trim();
    if (!plato) return reply.code(400).send({ error: 'El plato no puede quedar vacío' });
    // El portal del tutor lee AliMenu directamente: el cambio se publica de inmediato.
    await ensureMenuSemanal();
    if (!(orden >= 0 && orden < DIAS_SEMANA.length)) return reply.code(404).send({ error: 'Día no encontrado' });
    await prisma.aliMenu.update({ where: { orden }, data: { plato, algs: JSON.stringify(req.body.algs ?? []) } });
    return { ok: true };
  });
};
export default plugin;
