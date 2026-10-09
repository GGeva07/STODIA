import type { FastifyPluginAsync } from 'fastify';
import type { BecaFin, BecaNueva } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { supervisorOk } from '../../fin-utils';

const fmt = (n: number) => 'RD$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const toBeca = (r: any): BecaFin => ({ id: r.id, periodo: r.periodo, est: r.est, grado: r.grado, tipo: r.tipo, regla: r.regla, conceptos: r.conceptos, exp: r.exp, estado: r.estado, aprob: r.aprob });
const canApprove = (rol: string) => rol === 'Super Admin' || rol === 'Director Académico';

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { periodo?: string } }>('/', auth, async req =>
    (await prisma.finBeca.findMany({ where: req.query.periodo ? { periodo: req.query.periodo } : {}, orderBy: { createdAt: 'asc' } })).map(toBeca));


  const catNombres = async (tipo: string) => (await prisma.catalogo.findMany({ where: { tipo, estado: 'Activo' } })).map(r => String((JSON.parse(r.data) as { nombre?: string }).nombre ?? '').trim());

  /** Catálogos del formulario de becas: tipos (Catalogo 'becas', compartido con expediente) y conceptos afectables. */
  app.get('/catalogos', auth, async () => {
    const nombres = async (tipo: string) => {
      const rows = await prisma.catalogo.findMany({ where: { tipo, estado: 'Activo' }, orderBy: { id: 'asc' } });
      return rows.map(r => String((JSON.parse(r.data) as { nombre?: string }).nombre ?? '').trim()).filter(Boolean);
    };
    return { tipos: await nombres('becas'), conceptos: await nombres('conceptosBeca') };
  });

  /** Estudiantes activos para el formulario de becas (búsqueda por nombre, carnet o id). Máx. 50. */
  app.get<{ Querystring: { q?: string } }>('/estudiantes', auth, async req => {
    const q = (req.query.q ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const all = await prisma.alumno.findMany({ where: { estado: 'Activo' }, orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }], select: { id: true, code: true, nombres: true, apellidos: true, grado: true, sec: true } });
    return all
      .filter(a => !q || `${a.nombres} ${a.apellidos} ${a.code} ${a.id}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .slice(0, 50)
      .map(a => ({ id: a.id, label: `${a.nombres} ${a.apellidos} · ${a.grado} ${a.sec}` }));
  });

  app.post<{ Body: BecaNueva }>('/', auth, async (req, reply) => {
    const b = req.body;
    if (!b.exp?.trim()) return reply.code(400).send({ error: 'El expediente de soporte es obligatorio' });
    if (!b.conceptos?.length) return reply.code(400).send({ error: 'Selecciona al menos un concepto' });
    const [est, grado = ''] = b.est.split(' · ');
    // El beneficiario es una FK real: por id, o por la etiqueta «Nombre Apellidos · 5to A» si identifica a UN solo alumno.
    let alumno = b.alumnoId ? await prisma.alumno.findUnique({ where: { id: b.alumnoId } }) : null;
    if (!alumno && !b.alumnoId) {
      const cand = (await prisma.alumno.findMany({ where: { estado: 'Activo' } })).filter(a => `${a.nombres} ${a.apellidos}` === est && (!grado || `${a.grado} ${a.sec}` === grado));
      if (cand.length > 1) return reply.code(400).send({ error: 'Hay varios estudiantes con ese nombre y curso: selecciona el estudiante de la lista.' });
      alumno = cand[0] ?? null;
    }
    if (!alumno) return reply.code(400).send({ error: 'Estudiante no encontrado' });
    const [tipos, conceptos] = await Promise.all([catNombres('becas'), catNombres('conceptosBeca')]);
    if (!tipos.includes(b.tipo)) return reply.code(400).send({ error: 'Tipo de beca inexistente en el catálogo' });
    if (b.conceptos.some(c => !conceptos.includes(c))) return reply.code(400).send({ error: 'Algún concepto no existe en el catálogo de conceptos de beca' });
    const row = await prisma.finBeca.create({
      data: {
        id: String(Date.now()), periodo: b.periodo, alumnoId: alumno.id, est: `${alumno.nombres} ${alumno.apellidos}`, grado: `${alumno.grado} ${alumno.sec}`, tipo: b.tipo, regla: b.modo === 'pct' ? b.valor + '%' : fmt(Number(b.valor)),
        conceptos: b.conceptos.join(' · '), exp: b.exp.trim(), estado: 'Pendiente', aprob: 'Esperando Director Financiero',
      },
    });
    await audit(req.user, 'Insert', { tabla: 'Becas', id: row.id, next: `${row.tipo} · ${row.regla} · ${row.est}`, ip: req.ip });
    return toBeca(row);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/aprobar', auth, async (req, reply) => {
    if (!canApprove(req.user.rol) && !(await supervisorOk(req, req.body?.pin, 'beca.aprobar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const b = await prisma.finBeca.findUnique({ where: { id: req.params.id } });
    if (!b) return reply.code(404).send({ error: 'Beca no encontrada' });
    const quien = canApprove(req.user.rol) ? req.user.nombre : 'Supervisor';
    const ap = await prisma.finBeca.update({ where: { id: b.id }, data: { estado: 'Aprobada', aprob: `${quien} · ${hoy()}` } });
    await audit(req.user, 'Update', { tabla: 'Becas', id: b.id, prev: b.estado, next: 'Aprobada', ip: req.ip });
    return toBeca(ap);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/revocar', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body?.pin, 'beca.revocar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const b = await prisma.finBeca.findUnique({ where: { id: req.params.id } });
    if (!b) return reply.code(404).send({ error: 'Beca no encontrada' });
    const rv = await prisma.finBeca.update({ where: { id: b.id }, data: { estado: 'Revocada', aprob: `Revocada · ${hoy()}` } });
    await audit(req.user, 'Update', { tabla: 'Becas', id: b.id, prev: b.estado, next: 'Revocada', ip: req.ip });
    return toBeca(rv);
  });
};
export default plugin;
