import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AcadExtra, AcadExtraInput } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { supervisorOk } from '../../lib/supervisor';
import { etiquetaGrados, gradosDeRango, resolverRefs } from '../../lib/extras';

const CATS = ['Deportes', 'Danza', 'Arte', 'Música', 'Académico'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const INC = { grados: { include: { grado: { include: { nivel: true } } } }, aula: { select: { nombre: true } } } as const;
type Row = NonNullable<Awaited<ReturnType<typeof leer>>>;
const leer = (id: string) => prisma.acadExtra.findUnique({ where: { id }, include: INC });
/** Forma historica de la actividad: `grados` se reconstruye de AcadExtraGrado y `lugar` es el nombre del aula cuando esta enlazada. */
const out = (r: Row): AcadExtra => {
  const { grados, aula, docenteId: _d, aulaId: _a, ...base } = r;
  return { ...base, lugar: aula?.nombre ?? r.lugar, grados: etiquetaGrados(grados.map(g => ({ nombre: g.grado.nombre, orden: g.grado.orden, nivel: g.grado.nivel.nombre }))), kind: r.kind as AcadExtra['kind'], estado: r.estado as AcadExtra['estado'] };
};

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico', 'Docente', 'Cajero')] };
  const autorizado = async (req: FastifyRequest, pin: string | undefined, accion: string) =>
    req.user.rol === 'Director Académico' || (await supervisorOk(req, pin, accion));
  const NOAUTH = { error: 'Clave de supervisor inválida' };

  app.get('/', guard, async () => (await prisma.acadExtra.findMany({ orderBy: { id: 'asc' }, include: INC })).map(out));

  /** Valida el formulario (mismas reglas del prototipo) y devuelve el mensaje de error o los datos limpios. */
  const clean = async (b: AcadExtraInput, id: string | null, inscritos: number) => {
    const name = (b.name ?? '').trim(), instructor = (b.instructor ?? '').trim(), cupo = Math.trunc(Number(b.cupo)), costo = Number(b.costo || 0);
    const dup = (await prisma.acadExtra.findMany()).some(a => a.id !== id && norm(a.name) === norm(name));
    const err = !name ? 'El nombre es obligatorio.' : dup ? 'Ya existe una actividad con ese nombre.' : !instructor ? 'Asigna un instructor.'
      : !(cupo > 0) ? 'El cupo debe ser mayor que cero.' : cupo < inscritos ? `El cupo no puede ser menor que los ${inscritos} inscritos.`
      : !Number.isFinite(costo) || costo < 0 ? 'Costo inválido.' : !CATS.includes(b.cat) || !['act', 'curso'].includes(b.kind) ? 'Categoría o tipo inválido.' : null;
    if (err) return { err, data: undefined };
    const gradoIds = await gradosDeRango(prisma, b.grados ?? '');
    if (!gradoIds) return { err: 'Grados inválidos: elige un grado o un rango de grados del mismo nivel (por ejemplo «4to – 6to» o «1ro – 3ro Sec.»).', data: undefined };
    const refs = await resolverRefs(prisma, instructor, b.lugar ?? '');
    const curso = b.kind === 'curso';
    return {
      err: undefined,
      gradoIds,
      data: {
        name, instructor, cupo, costo, cat: b.cat, kind: b.kind, lugar: b.lugar ?? '', dias: b.dias ?? '', hora: b.hora ?? '', docenteId: refs.docenteId, aulaId: refs.aulaId,
        ini: curso ? b.ini ?? '' : '', sem: curso ? Math.trunc(Number(b.sem)) || 0 : 0,
        estado: b.estado === 'Cerrada' ? 'Cerrada' : inscritos >= cupo ? 'Cupo lleno' : 'Abierta',
      },
    };
  };

  app.post<{ Body: AcadExtraInput }>('/', guard, async (req, reply) => {
    if (!await autorizado(req, req.body.pin, 'extra.crear')) return reply.code(403).send(NOAUTH);
    const c = await clean(req.body, null, 0);
    if (!c.data) return reply.code(422).send({ error: c.err });
    const last = (await prisma.acadExtra.findMany({ select: { id: true } })).map(r => Number(r.id.replace('EXT-', '')) || 0);
    const id = 'EXT-' + String(Math.max(0, ...last) + 1).padStart(3, '0');
    await prisma.acadExtra.create({ data: { id, inscritos: 0, ...c.data, grados: { create: c.gradoIds.map(gradoId => ({ gradoId })) } } });
    const cr = (await leer(id))!;
    await audit(req.user, 'Insert', { tabla: 'Extracurriculares', id, next: cr.name, ip: req.ip });
    return out(cr);
  });

  app.put<{ Params: { id: string }; Body: AcadExtraInput }>('/:id', guard, async (req, reply) => {
    if (!(await autorizado(req, req.body.pin, 'extra.modificar'))) return reply.code(403).send(NOAUTH);
    const cur = await prisma.acadExtra.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: 'Actividad no encontrada' });
    const c = await clean(req.body, cur.id, cur.inscritos);
    if (!c.data) return reply.code(422).send({ error: c.err });
    await prisma.$transaction([
      prisma.acadExtraGrado.deleteMany({ where: { extraId: cur.id } }),
      prisma.acadExtra.update({ where: { id: cur.id }, data: { ...c.data, grados: { create: c.gradoIds.map(gradoId => ({ gradoId })) } } }),
    ]);
    const up = (await leer(cur.id))!;
    await audit(req.user, 'Update', { tabla: 'Extracurriculares', id: cur.id, prev: cur.name, next: up.name, ip: req.ip });
    return out(up);
  });

  /** POST (no DELETE) para poder enviar la clave de supervisor en el cuerpo y no en la URL. */
  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/eliminar', guard, async (req, reply) => {
    if (!(await autorizado(req, req.body?.pin, 'extra.eliminar'))) return reply.code(403).send(NOAUTH);
    const cur = await prisma.acadExtra.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: 'Actividad no encontrada' });
    await prisma.acadExtraGrado.deleteMany({ where: { extraId: cur.id } });
    await prisma.acadExtra.delete({ where: { id: cur.id } });
    await audit(req.user, 'Delete', { tabla: 'Extracurriculares', id: cur.id, prev: cur.name, ip: req.ip });
    return { ok: true, notificados: cur.inscritos };
  });
};
export default plugin;
