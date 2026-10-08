import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AcadExtra, AcadExtraInput } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { supervisorOk } from '../../lib/supervisor';

const CATS = ['Deportes', 'Danza', 'Arte', 'Música', 'Académico'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Row = NonNullable<Awaited<ReturnType<typeof prisma.acadExtra.findUnique>>>;
const out = (r: Row): AcadExtra => ({ ...r, kind: r.kind as AcadExtra['kind'], estado: r.estado as AcadExtra['estado'] });

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole('Super Admin', 'Director Académico', 'Docente', 'Cajero')] };
  const autorizado = async (req: FastifyRequest, pin: string | undefined, accion: string) =>
    req.user.rol === 'Director Académico' || (await supervisorOk(req, pin, accion));
  const NOAUTH = { error: 'Clave de supervisor inválida' };

  app.get('/', guard, async () => (await prisma.acadExtra.findMany({ orderBy: { id: 'asc' } })).map(out));

  /** Valida el formulario (mismas reglas del prototipo) y devuelve el mensaje de error o los datos limpios. */
  const clean = async (b: AcadExtraInput, id: string | null, inscritos: number) => {
    const name = (b.name ?? '').trim(), instructor = (b.instructor ?? '').trim(), cupo = Math.trunc(Number(b.cupo)), costo = Number(b.costo || 0);
    const dup = (await prisma.acadExtra.findMany()).some(a => a.id !== id && norm(a.name) === norm(name));
    const err = !name ? 'El nombre es obligatorio.' : dup ? 'Ya existe una actividad con ese nombre.' : !instructor ? 'Asigna un instructor.'
      : !(cupo > 0) ? 'El cupo debe ser mayor que cero.' : cupo < inscritos ? `El cupo no puede ser menor que los ${inscritos} inscritos.`
      : !Number.isFinite(costo) || costo < 0 ? 'Costo inválido.' : !CATS.includes(b.cat) || !['act', 'curso'].includes(b.kind) ? 'Categoría o tipo inválido.' : null;
    if (err) return { err, data: undefined };
    const curso = b.kind === 'curso';
    return {
      err: undefined,
      data: {
        name, instructor, cupo, costo, cat: b.cat, kind: b.kind, lugar: b.lugar ?? '', dias: b.dias ?? '', hora: b.hora ?? '', grados: b.grados ?? '',
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
    const cr = await prisma.acadExtra.create({ data: { id, inscritos: 0, ...c.data } });
    await audit(req.user, 'Insert', { tabla: 'Extracurriculares', id, next: cr.name, ip: req.ip });
    return out(cr);
  });

  app.put<{ Params: { id: string }; Body: AcadExtraInput }>('/:id', guard, async (req, reply) => {
    if (!(await autorizado(req, req.body.pin, 'extra.modificar'))) return reply.code(403).send(NOAUTH);
    const cur = await prisma.acadExtra.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: 'Actividad no encontrada' });
    const c = await clean(req.body, cur.id, cur.inscritos);
    if (!c.data) return reply.code(422).send({ error: c.err });
    const up = await prisma.acadExtra.update({ where: { id: cur.id }, data: c.data });
    await audit(req.user, 'Update', { tabla: 'Extracurriculares', id: cur.id, prev: cur.name, next: up.name, ip: req.ip });
    return out(up);
  });

  /** POST (no DELETE) para poder enviar la clave de supervisor en el cuerpo y no en la URL. */
  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/eliminar', guard, async (req, reply) => {
    if (!(await autorizado(req, req.body?.pin, 'extra.eliminar'))) return reply.code(403).send(NOAUTH);
    const cur = await prisma.acadExtra.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: 'Actividad no encontrada' });
    await prisma.acadExtra.delete({ where: { id: cur.id } });
    await audit(req.user, 'Delete', { tabla: 'Extracurriculares', id: cur.id, prev: cur.name, ip: req.ip });
    return { ok: true, notificados: cur.inscritos };
  });
};
export default plugin;
