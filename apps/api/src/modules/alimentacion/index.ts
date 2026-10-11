import type { FastifyPluginAsync } from 'fastify';
import type { AliData, AliMenuDto, AliPlanDto, AliPlanInput } from '@stodia/shared';
import { prisma } from '../../db';
import { norm } from '../../seed-data';
import { DIAS_SEMANA, banderas, catalogosAliFilas, ensureMenuSemanal, guardarBanderasPlan, semanaDe } from '../../lib/ali-catalogos';
import { partesEnZona, zonaHoraria } from '../../lib/cxc';

type Row = Awaited<ReturnType<typeof prisma.aliPlan.findMany>>[number];
type Cat = Awaited<ReturnType<typeof catalogosAliFilas>>;
const INC = { comidas: { select: { comidaId: true } }, dietas: { select: { dietaId: true } } } as const;
type PlanFull = Row & { comidas: { comidaId: string }[]; dietas: { dietaId: string }[] };
/** `inscritos` = carnets de comedor con este plan (ComCarnet.aliPlanId): se calcula, no se guarda. meals / diets = banderas por posición del catálogo ACTIVO (filas puente). */
const toDto = (p: PlanFull, inscritos: number, cat: Cat): AliPlanDto => ({
  id: p.id, name: p.name, modelo: p.modelo as 'sub' | 'wal', meals: banderas(p.comidas.map(c => c.comidaId), cat.comidas), precio: p.precio == null ? '' : String(p.precio),
  freq: p.freq, dias: p.dias, mora: p.mora ? 'si' : 'no', recarga: p.recarga == null ? '' : String(p.recarga), limite: p.limite == null ? '' : String(p.limite),
  canal: p.canal, saldo: p.saldo, diets: banderas(p.dietas.map(d => d.dietaId), cat.dietas), estado: p.estado as 'Activo' | 'Inactivo', inscritos,
});
const inscritosPorPlan = async () => new Map((await prisma.comCarnet.groupBy({ by: ['aliPlanId'], where: { aliPlanId: { not: null } }, _count: { _all: true } })).map(g => [g.aliPlanId!, g._count._all]));
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
  name: f.name.trim(), modelo: f.modelo, precio: num(f.precio), freq: f.freq, dias: f.dias, mora: f.mora === 'si',
  recarga: num(f.recarga), limite: num(f.limite), canal: f.canal, saldo: f.saldo, estado: f.estado,
});
const uno = async (id: string, insc: number): Promise<AliPlanDto> => toDto((await prisma.aliPlan.findUniqueOrThrow({ where: { id }, include: INC })), insc, await catalogosAliFilas());

const plugin: FastifyPluginAsync = async app => {
  const read = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Cajero', 'Encargado Comedor')] };
  const write = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Encargado Comedor')] };

  app.get('/', read, async (): Promise<AliData> => {
    await ensureMenuSemanal();
    const [planes, insc, menu, porAlergia, cat, tz] = await Promise.all([
      prisma.aliPlan.findMany({ orderBy: { id: 'asc' }, include: INC }), inscritosPorPlan(), prisma.aliMenu.findMany({ orderBy: { orden: 'asc' }, include: { alergias: { include: { alergia: true }, orderBy: { alergiaId: 'asc' } } } }),
      prisma.alumnoAlergia.groupBy({ by: ['alergiaId'], _count: { _all: true } }), catalogosAliFilas(), zonaHoraria(),
    ]);
    const catalogos = { comidas: cat.comidas.map(c => c.nombre), dietas: cat.dietas.map(c => c.nombre), alergias: cat.alergias.map(c => c.nombre) };
    const nAlumnos = new Map(porAlergia.map(g => [g.alergiaId, g._count._all]));
    // La semana se calcula de la fecha real (zona del colegio): lunes a viernes; el menú es la plantilla semanal vigente.
    const sem = semanaDe(partesEnZona(tz));
    const conAlergia = (await prisma.alumnoAlergia.findMany({ distinct: ['alumnoId'], select: { alumnoId: true } })).length;
    const m: AliMenuDto[] = menu.map(d => {
      const algs = d.alergias.map(x => x.alergia.nombre);
      const afectados: Record<string, number> = {};
      for (const x of d.alergias) { const n = nAlumnos.get(x.alergiaId) ?? 0; if (n) afectados[x.alergia.nombre] = n; }
      const nombre = d.dia.replace(/\s*\d+\s*$/, '') || DIAS_SEMANA[d.orden] || d.dia;
      return { dia: sem.diaMes[d.orden] ? `${nombre} ${sem.diaMes[d.orden]}` : nombre, plato: d.plato, algs, afectados };
    });
    return { planes: planes.map(p => toDto(p, insc.get(p.id) ?? 0, cat)), menu: m, alumnosConAlergia: conAlergia, semana: { desde: sem.desde, hasta: sem.hasta, label: sem.label }, catalogos };
  });

  app.post<{ Body: AliPlanInput }>('/planes', write, async (req, reply) => {
    const err = validate(req.body, await prisma.aliPlan.findMany());
    if (err) return reply.code(400).send({ error: err });
    const last = (await prisma.aliPlan.findMany({ select: { id: true } })).map(p => Number(p.id.replace('ALI-', '')) || 0);
    const id = 'ALI-' + String(Math.max(0, ...last) + 1).padStart(3, '0');
    await prisma.aliPlan.create({ data: { id, ...data(req.body) } });
    await guardarBanderasPlan(id, req.body.meals, req.body.diets);
    return uno(id, 0);
  });

  app.put<{ Params: { id: string }; Body: AliPlanInput }>('/planes/:id', write, async (req, reply) => {
    const { id } = req.params;
    if (!(await prisma.aliPlan.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Plan no encontrado' });
    const err = validate(req.body, await prisma.aliPlan.findMany({ where: { id: { not: id } } }));
    if (err) return reply.code(400).send({ error: err });
    await prisma.aliPlan.update({ where: { id }, data: data(req.body) });
    await guardarBanderasPlan(id, req.body.meals, req.body.diets);
    return uno(id, (await inscritosPorPlan()).get(id) ?? 0);
  });

  app.delete<{ Params: { id: string } }>('/planes/:id', write, async (req, reply) => {
    const p = await prisma.aliPlan.findUnique({ where: { id: req.params.id } });
    if (!p) return reply.code(404).send({ error: 'Plan no encontrado' });
    const insc = await prisma.comCarnet.count({ where: { aliPlanId: p.id } });
    if (insc > 0) return reply.code(409).send({ error: `No se puede eliminar: ${insc} alumnos inscritos. Márcalo Inactivo para cerrar nuevas inscripciones.` });
    await prisma.aliPlan.delete({ where: { id: p.id } }); // comidas y dietas del plan (tablas puente) caen en cascada
    return { ok: true };
  });

  app.put<{ Params: { orden: string }; Body: { plato: string; algs: string[] } }>('/menu/:orden', write, async (req, reply) => {
    const orden = Number(req.params.orden);
    const plato = String(req.body.plato ?? '').trim();
    if (!plato) return reply.code(400).send({ error: 'El plato no puede quedar vacío' });
    // El portal del tutor lee AliMenu directamente: el cambio se publica de inmediato.
    await ensureMenuSemanal();
    if (!(orden >= 0 && orden < DIAS_SEMANA.length)) return reply.code(404).send({ error: 'Día no encontrado' });
    // Los alérgenos son nombres del catálogo de alergias (FK real): uno inexistente se rechaza.
    const nombres = [...new Set((req.body.algs ?? []).map(a => String(a).trim()).filter(Boolean))];
    const cat = await prisma.alergia.findMany({ select: { id: true, nombre: true } });
    const ids = nombres.map(n => cat.find(c => norm(c.nombre) === norm(n))?.id);
    if (ids.some(i => !i)) return reply.code(400).send({ error: 'Alguna alergia no existe en el catálogo de alergias' });
    await prisma.$transaction([
      prisma.aliMenu.update({ where: { orden }, data: { plato } }),
      prisma.aliMenuAlergia.deleteMany({ where: { menuOrden: orden } }),
      prisma.aliMenuAlergia.createMany({ data: [...new Set(ids as string[])].map(alergiaId => ({ menuOrden: orden, alergiaId })) }),
    ]);
    return { ok: true };
  });
};
export default plugin;
