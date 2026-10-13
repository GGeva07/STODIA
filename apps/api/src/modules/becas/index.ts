import type { FastifyPluginAsync } from 'fastify';
import type { BecaFin, BecaNueva } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { SEC_INC, gst } from '../../lib/personas';
import { supervisorOk } from '../../fin-utils';
import { reglaBeca } from '../../lib/pers-fin';
import { cicloEditable, nombreCiclo } from '../../lib/ciclo';

const hoy = () => new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const INC = { tipoBeca: true, ciclo: { select: { nombre: true, estado: true } }, conceptos: { include: { concepto: true }, orderBy: { orden: 'asc' as const } } };
/** Regla legible: «50%» (modo pct) o «RD$ 2,000.00» (modo monto); los conceptos se unen con « · » en el orden en que se eligieron. */
const toBeca = (r: any): BecaFin => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id, periodo: r.ciclo.nombre, est: r.est, grado: r.grado, tipo: r.tipoBeca.nombre, regla: reglaBeca(r),
  conceptos: r.conceptos.map((c: { concepto: { nombre: string } }) => c.concepto.nombre).join(' · '), exp: r.exp, estado: r.estado, aprob: r.aprob,
});
const canApprove = (rol: string) => rol === 'Super Admin' || rol === 'Director Académico';

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { periodo?: string } }>('/', auth, async req =>
    (await prisma.finBeca.findMany({ where: req.query.periodo ? { ciclo: { nombre: nombreCiclo(req.query.periodo) } } : {}, orderBy: { createdAt: 'asc' }, include: INC })).map(toBeca));

  /** Catálogos del formulario de becas: tipos (TipoBeca, compartido con expediente) y conceptos afectables (ConceptoBeca), solo los activos. */
  app.get('/catalogos', auth, async () => {
    const [tipos, conceptos] = await Promise.all([prisma.tipoBeca.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } }), prisma.conceptoBeca.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' } })]);
    return { tipos: tipos.map(t => t.nombre.trim()).filter(Boolean), conceptos: conceptos.map(c => c.nombre.trim()).filter(Boolean) };
  });

  /** Estudiantes activos para el formulario de becas (búsqueda por nombre, carnet o id). Máx. 50. */
  app.get<{ Querystring: { q?: string } }>('/estudiantes', auth, async req => {
    const q = (req.query.q ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const all = await prisma.alumno.findMany({ where: { estado: 'Activo' }, orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }], select: { id: true, code: true, nombres: true, apellidos: true, seccion: { select: { letra: true, grado: { select: { nombre: true } } } } } });
    return all
      .filter(a => !q || `${a.nombres} ${a.apellidos} ${a.code} ${a.id}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .slice(0, 50)
      .map(a => ({ id: a.id, label: `${a.nombres} ${a.apellidos} · ${a.seccion.grado.nombre} ${a.seccion.letra}` }));
  });

  app.post<{ Body: BecaNueva }>('/', auth, async (req, reply) => {
    const b = req.body;
    if (!b.exp?.trim()) return reply.code(400).send({ error: 'El expediente de soporte es obligatorio' });
    if (!b.conceptos?.length) return reply.code(400).send({ error: 'Selecciona al menos un concepto' });
    const [est, grado = ''] = b.est.split(' · ');
    // El beneficiario es una FK real: por id, o por la etiqueta «Nombre Apellidos · 5to A» si identifica a UN solo alumno.
    let alumno = b.alumnoId ? await prisma.alumno.findUnique({ where: { id: b.alumnoId }, include: SEC_INC }) : null;
    if (!alumno && !b.alumnoId) {
      const cand = (await prisma.alumno.findMany({ where: { estado: 'Activo' }, include: SEC_INC })).filter(a => `${a.nombres} ${a.apellidos}` === est && (!grado || `${gst(a).grado} ${gst(a).sec}` === grado));
      if (cand.length > 1) return reply.code(400).send({ error: 'Hay varios estudiantes con ese nombre y curso: selecciona el estudiante de la lista.' });
      alumno = cand[0] ?? null;
    }
    if (!alumno) return reply.code(400).send({ error: 'Estudiante no encontrado' });
    const [tipos, conceptos] = await Promise.all([prisma.tipoBeca.findMany({ where: { estado: 'Activo' } }), prisma.conceptoBeca.findMany({ where: { estado: 'Activo' } })]);
    const tipo = tipos.find(t => t.nombre.trim() === b.tipo);
    if (!tipo) return reply.code(400).send({ error: 'Tipo de beca inexistente en el catálogo' });
    const cids = [...new Set(b.conceptos)].map(c => conceptos.find(x => x.nombre.trim() === c)?.id);
    if (cids.some(c => !c)) return reply.code(400).send({ error: 'Algún concepto no existe en el catálogo de conceptos de beca' });
    const valor = Number(b.valor);
    if (!Number.isFinite(valor) || valor <= 0) return reply.code(400).send({ error: 'Indica un valor mayor que cero' });
    const ciclo = await prisma.ciclo.findUnique({ where: { nombre: nombreCiclo(b.periodo ?? '') } });
    if (!ciclo) return reply.code(400).send({ error: 'El ciclo lectivo de la beca no existe' });
    if (!cicloEditable(ciclo)) return reply.code(409).send({ error: 'El ciclo lectivo está cerrado (solo lectura)' });
    const row = await prisma.finBeca.create({
      data: {
        id: String(Date.now()), cicloId: ciclo.id, alumnoId: alumno.id, est: `${alumno.nombres} ${alumno.apellidos}`, grado: `${gst(alumno).grado} ${gst(alumno).sec}`, tipoBecaId: tipo.id,
        modo: b.modo === 'pct' ? 'pct' : 'monto', valor, conceptos: { create: (cids as string[]).map((conceptoId, orden) => ({ conceptoId, orden })) },
        exp: b.exp.trim(), estado: 'Pendiente', aprob: 'Esperando Director Financiero',
      },
      include: INC,
    });
    await audit(req.user, 'Insert', { tabla: 'Becas', id: row.id, next: `${row.tipoBeca.nombre} · ${toBeca(row).regla} · ${row.est}`, ip: req.ip });
    return toBeca(row);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string; motivo?: string } }>('/:id/aprobar', auth, async (req, reply) => {
    if (!canApprove(req.user.rol) && !(await supervisorOk(req, req.body?.pin, 'beca.aprobar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const b = await prisma.finBeca.findUnique({ where: { id: req.params.id }, include: { ciclo: { select: { estado: true } } } });
    if (!b) return reply.code(404).send({ error: 'Beca no encontrada' });
    if (b.estado !== 'Pendiente') return reply.code(409).send({ error: `Solo se aprueban solicitudes Pendientes (esta está ${b.estado})` });
    if (!cicloEditable(b.ciclo)) return reply.code(409).send({ error: 'El ciclo lectivo de la beca está cerrado (solo lectura)' });
    const quien = canApprove(req.user.rol) ? req.user.nombre : 'Supervisor';
    const motivo = (req.body?.motivo ?? '').trim().slice(0, 300);
    const traza = b.aprob.startsWith('Solicitada por') ? ` · ${b.aprob}` : '';
    const ap = await prisma.finBeca.update({ where: { id: b.id }, data: { estado: 'Aprobada', aprob: `${quien} · ${hoy()}${motivo ? ` · ${motivo}` : ''}${traza}` }, include: INC });
    // Al quedar vigente, el contrato del alumno en ese ciclo pasa a reflejar el tipo de beca (única vía que escribe Contrato.tipoBecaId).
    await prisma.contrato.updateMany({ where: { alumnoId: b.alumnoId, cicloId: b.cicloId }, data: { tipoBecaId: b.tipoBecaId } });
    await audit(req.user, 'Update', { tabla: 'Becas', id: b.id, prev: b.estado, next: `Aprobada${motivo ? ' · ' + motivo : ''}`, ip: req.ip });
    return toBeca(ap);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string; motivo?: string } }>('/:id/rechazar', auth, async (req, reply) => {
    if (!canApprove(req.user.rol) && !(await supervisorOk(req, req.body?.pin, 'beca.rechazar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const b = await prisma.finBeca.findUnique({ where: { id: req.params.id }, include: { ciclo: { select: { estado: true } } } });
    if (!b) return reply.code(404).send({ error: 'Beca no encontrada' });
    if (b.estado !== 'Pendiente') return reply.code(409).send({ error: `Solo se rechazan solicitudes Pendientes (esta está ${b.estado})` });
    if (!cicloEditable(b.ciclo)) return reply.code(409).send({ error: 'El ciclo lectivo de la beca está cerrado (solo lectura)' });
    const quien = canApprove(req.user.rol) ? req.user.nombre : 'Supervisor';
    const motivo = (req.body?.motivo ?? '').trim().slice(0, 300);
    const rc = await prisma.finBeca.update({ where: { id: b.id }, data: { estado: 'Rechazada', aprob: `Rechazada por ${quien} · ${hoy()}${motivo ? ` · ${motivo}` : ''}` }, include: INC });
    await audit(req.user, 'Update', { tabla: 'Becas', id: b.id, prev: b.estado, next: `Rechazada${motivo ? ' · ' + motivo : ''}`, ip: req.ip });
    return toBeca(rc);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/revocar', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body?.pin, 'beca.revocar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const b = await prisma.finBeca.findUnique({ where: { id: req.params.id }, include: { ciclo: { select: { estado: true } } } });
    if (!b) return reply.code(404).send({ error: 'Beca no encontrada' });
    if (!cicloEditable(b.ciclo)) return reply.code(409).send({ error: 'El ciclo lectivo de la beca está cerrado (solo lectura)' });
    const rv = await prisma.finBeca.update({ where: { id: b.id }, data: { estado: 'Revocada', aprob: `Revocada · ${hoy()}` }, include: INC });
    await prisma.contrato.updateMany({ where: { alumnoId: b.alumnoId, cicloId: b.cicloId, tipoBecaId: b.tipoBecaId }, data: { tipoBecaId: null } });
    await audit(req.user, 'Update', { tabla: 'Becas', id: b.id, prev: b.estado, next: 'Revocada', ip: req.ip });
    return toBeca(rv);
  });
};
export default plugin;
