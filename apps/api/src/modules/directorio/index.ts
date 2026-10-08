import type { FastifyPluginAsync } from 'fastify';
import type { Alumno, DirCorte } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { supervisorOk } from '../../fin-utils';
import { READONLY_ROLES, toAlumno } from '../../lib/personas';
import { cuentaDerivada, saldoVencidoPorAlumno } from '../../lib/cxc';
import { fechaCorte } from '../../lib/pers-fin';

const EDITABLE = ['nombres', 'apellidos', 'fnac', 'estado', 'grado', 'sec', 'tanda', 'tel', 'dir'] as const;
type Edit = Partial<Record<(typeof EDITABLE)[number], string>>;

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (): Promise<Alumno[]> => {
    const rows = await prisma.alumno.findMany({ include: { tutor: { select: { nombre: true } } }, orderBy: { apellidos: 'asc' } });
    const cuentaDe = await cuentaDerivada();
    return rows.map(r => ({ ...toAlumno(r), cuenta: cuentaDe(r.id) }));
  });

  // Saldo vencido por alumno (notificaciones de cobro impresas): cuentas por cobrar reales (lib/cxc).
  app.post<{ Body: { ids: string[] } }>('/saldos', auth, async req => saldoVencidoPorAlumno(req.body?.ids ?? []));

  // Fecha límite de pago de las notificaciones de cobro: próximo día de corte configurado (o hoy + plazo estándar).
  app.get('/corte', auth, async (): Promise<DirCorte> => fechaCorte());

  app.put<{ Params: { id: string }; Body: Edit }>('/:id', auth, async (req, reply) => {
    if (READONLY_ROLES.includes(req.user.rol)) return reply.code(403).send({ error: `El rol ${req.user.rol} solo tiene lectura sobre la ficha del estudiante` });
    const prev = await prisma.alumno.findUnique({ where: { id: req.params.id } });
    if (!prev) return reply.code(404).send({ error: 'Alumno no encontrado' });
    const data: Edit = {};
    for (const k of EDITABLE) if (typeof req.body?.[k] === 'string') data[k] = req.body[k]!.trim();
    if (!data.nombres || !data.apellidos) return reply.code(400).send({ error: 'Nombres y apellidos son obligatorios.' });
    if (data.estado && !['Activo', 'Inactivo', 'Retirado'].includes(data.estado)) return reply.code(400).send({ error: 'Estado inválido' });
    const changed = EDITABLE.filter(k => data[k] !== undefined && data[k] !== prev[k]);
    const row = await prisma.alumno.update({ where: { id: prev.id }, data, include: { tutor: { select: { nombre: true } } } });
    for (const k of changed) await audit(req.user, 'Update', { tabla: 'Alumnos', id: `${prev.code}/${k}`, prev: prev[k], next: data[k], ip: req.ip });
    return { alumno: { ...toAlumno(row), cuenta: (await cuentaDerivada())(row.id) }, changed: changed.length };
  });

  // Eliminación jerárquica: Super Admin directo; el resto necesita la clave de supervisor.
  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/:id/eliminar', auth, async (req, reply) => {
    if (READONLY_ROLES.includes(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    if (!(await supervisorOk(req, req.body?.pin, 'alumno.eliminar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida. Intento registrado en auditoría.' });
    const a = await prisma.alumno.findUnique({ where: { id: req.params.id } });
    if (!a) return reply.code(404).send({ error: 'Alumno no encontrado' });
    await prisma.$transaction([
      prisma.persExpediente.deleteMany({ where: { alumnoId: a.id } }),
      prisma.persDocumento.deleteMany({ where: { alumnoId: a.id } }),
      prisma.persServicio.deleteMany({ where: { alumnoId: a.id } }),
      prisma.alumno.delete({ where: { id: a.id } }),
    ]);
    await audit(req.user, 'Delete', { tabla: 'Alumnos', id: a.code, prev: `${a.nombres} ${a.apellidos}`, next: 'Eliminado', ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
