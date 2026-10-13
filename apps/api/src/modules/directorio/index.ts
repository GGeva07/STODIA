import type { FastifyPluginAsync } from 'fastify';
import type { Alumno, DirCorte } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { supervisorOk } from '../../fin-utils';
import { READONLY_ROLES, SEC_INC, dependenciasAlumno, gst, toAlumno } from '../../lib/personas';
import { resolverSeccion } from '../../lib/catalogos-tipados';
import { cuentaDerivada, saldoVencidoPorAlumno } from '../../lib/cxc';
import { fechaCorte } from '../../lib/pers-fin';
import { sincronizarMatricula } from '../../lib/matricula';
import { cicloReq, esCicloActivo } from '../../lib/ciclo';

const EDITABLE = ['nombres', 'apellidos', 'fnac', 'estado', 'grado', 'sec', 'tanda', 'tel', 'dir'] as const;
type Edit = Partial<Record<(typeof EDITABLE)[number], string>>;

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req): Promise<Alumno[]> => {
    // Fase 2D: con otro ciclo (X-Ciclo) el Directorio lista las MATRICULAS de ese ciclo, con la seccion de ENTONCES y los saldos de ese ciclo.
    const ciclo = await cicloReq(req);
    if (!esCicloActivo(ciclo)) {
      const [mats, cuentaDe] = await Promise.all([
        prisma.matricula.findMany({ where: { cicloId: ciclo.id }, include: { seccion: { include: { grado: true, tanda: true } }, alumno: { include: { tutor: { select: { nombre: true } }, alergias: SEC_INC.alergias } } } }),
        cuentaDerivada(ciclo.id),
      ]);
      const estadoDe = (e: string) => (e === 'Retirado' ? 'Retirado' : e === 'Graduado' ? 'Egresado' : 'Activo');
      return mats.map(m => ({ ...toAlumno({ ...m.alumno, seccionId: m.seccionId, seccion: m.seccion, estado: estadoDe(m.estado) }), cuenta: cuentaDe(m.alumnoId) }))
        .sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
    }
    const rows = await prisma.alumno.findMany({ where: { estado: { not: 'Preinscrito' } }, include: { tutor: { select: { nombre: true } }, ...SEC_INC }, orderBy: { apellidos: 'asc' } });
    const cuentaDe = await cuentaDerivada();
    return rows.map(r => ({ ...toAlumno(r), cuenta: cuentaDe(r.id) }));
  });

  // Saldo vencido por alumno (notificaciones de cobro impresas): cuentas por cobrar reales (lib/cxc).
  app.post<{ Body: { ids: string[] } }>('/saldos', auth, async req => saldoVencidoPorAlumno(req.body?.ids ?? [], (await cicloReq(req)).id));

  // Fecha límite de pago de las notificaciones de cobro: próximo día de corte configurado (o hoy + plazo estándar).
  app.get('/corte', auth, async (): Promise<DirCorte> => fechaCorte());

  app.put<{ Params: { id: string }; Body: Edit & { pin?: string } }>('/:id', auth, async (req, reply) => {
    if (READONLY_ROLES.includes(req.user.rol)) return reply.code(403).send({ error: `El rol ${req.user.rol} solo tiene lectura sobre la ficha del estudiante` });
    if (!(await supervisorOk(req, req.body?.pin, 'alumno.editar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida. Intento registrado en auditoría.' });
    const prevDb = await prisma.alumno.findUnique({ where: { id: req.params.id }, include: SEC_INC });
    if (!prevDb) return reply.code(404).send({ error: 'Alumno no encontrado' });
    const prev = { ...prevDb, ...gst(prevDb) };
    const data: Edit = {};
    for (const k of EDITABLE) if (typeof req.body?.[k] === 'string') data[k] = req.body[k]!.trim();
    if (!data.nombres || !data.apellidos) return reply.code(400).send({ error: 'Nombres y apellidos son obligatorios.' });
    if (data.estado && !['Activo', 'Inactivo', 'Retirado'].includes(data.estado)) return reply.code(400).send({ error: 'Estado inválido' });
    const changed = EDITABLE.filter(k => data[k] !== undefined && data[k] !== prev[k]);
    // grado / sec / tanda ya no son columnas: el cambio de cualquiera de los tres resuelve la nueva SECCION (FK). '1ro' existe en dos niveles: se prefiere el del alumno.
    const { grado, sec, tanda, ...resto } = data;
    let seccionId: string | undefined;
    if ((grado !== undefined && grado !== prev.grado) || (sec !== undefined && sec !== prev.sec) || (tanda !== undefined && tanda !== prev.tanda)) {
      const r = await resolverSeccion(grado ?? prev.grado, sec ?? prev.sec, tanda ?? prev.tanda, prevDb.seccion.grado.nivelId);
      if ('error' in r) return reply.code(400).send({ error: r.error });
      seccionId = r.id;
    }
    const row = await prisma.alumno.update({ where: { id: prev.id }, data: { ...resto, ...(seccionId ? { seccionId } : {}) }, include: { tutor: { select: { nombre: true } }, ...SEC_INC } });
    if (seccionId || (data.estado && data.estado !== prev.estado)) await sincronizarMatricula(prev.id); // Matricula del ciclo activo = seccion y estado del alumno
    for (const k of changed) await audit(req.user, 'Update', { tabla: 'Alumnos', id: `${prev.code}/${k}`, prev: prev[k], next: data[k], ip: req.ip });
    return { alumno: { ...toAlumno(row), cuenta: (await cuentaDerivada())(row.id) }, changed: changed.length };
  });

  // Eliminación jerárquica: Super Admin directo; el resto necesita la clave de supervisor.
  app.post<{ Params: { id: string }; Body: { pin?: string; baja?: boolean } }>('/:id/eliminar', auth, async (req, reply) => {
    if (READONLY_ROLES.includes(req.user.rol)) return reply.code(403).send({ error: 'Sin permiso' });
    if (!(await supervisorOk(req, req.body?.pin, 'alumno.eliminar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida. Intento registrado en auditoría.' });
    const a = await prisma.alumno.findUnique({ where: { id: req.params.id } });
    if (!a) return reply.code(404).send({ error: 'Alumno no encontrado' });
    // Baja lógica (la usa el expediente): estado Retirado, conserva historial y FKs. Se revierte editando el estado.
    if (req.body?.baja) {
      if (a.estado === 'Retirado') return reply.code(409).send({ error: `${a.nombres} ${a.apellidos} ya está Retirado.` });
      await prisma.alumno.update({ where: { id: a.id }, data: { estado: 'Retirado' } });
      await sincronizarMatricula(a.id);
      await audit(req.user, 'Delete', { tabla: 'Alumnos', id: `${a.code}/estado`, prev: a.estado, next: 'Retirado (baja lógica)', ip: req.ip });
      return { ok: true };
    }
    // Borrado LÓGICO por defecto: con historial (cobros, NCF, notas, monedero...) la FK NoAction lo impide y se responde 409 con la alternativa.
    const dep = await dependenciasAlumno(a.id);
    if (dep.length) return reply.code(409).send({ error: `No se puede eliminar a ${a.nombres} ${a.apellidos}: tiene historial (${dep.join(', ')}). Márcalo como Retirado o Inactivo para conservar su historial.` });
    await prisma.$transaction([
      prisma.persExpediente.deleteMany({ where: { alumnoId: a.id } }),
      prisma.persDocumento.deleteMany({ where: { alumnoId: a.id } }),
      prisma.contrato.deleteMany({ where: { alumnoId: a.id } }),
      prisma.servicioAlumno.deleteMany({ where: { alumnoId: a.id } }),
      prisma.tutorAlumno.deleteMany({ where: { alumnoId: a.id } }),
      prisma.matricula.deleteMany({ where: { alumnoId: a.id } }), // solo queda la del ciclo activo: el historial de otros ciclos ya bloqueo el borrado (dependenciasAlumno)
      prisma.alumno.delete({ where: { id: a.id } }),
    ]);
    await audit(req.user, 'Delete', { tabla: 'Alumnos', id: a.code, prev: `${a.nombres} ${a.apellidos}`, next: 'Eliminado', ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
