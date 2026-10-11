import type { FastifyPluginAsync } from 'fastify';
import type { AcadAsisDia, AcadAsisGuardado, AcadMarca } from '@stodia/shared';
import { prisma } from '../../db';
import { cicloIdActivo, cicloReq, esCicloActivo } from '../../lib/ciclo';
import { ahora, bloqueActual, bloquesDe, bloqueTexto, elegirAsig, guardarAsistencia, loadCat, marcasDelDia, nomina, optDe } from '../../lib/academico';

const ROLES = ['Super Admin', 'Director Académico', 'Docente'] as const;
const MARCAS: string[] = ['P', 'T', 'AJ', 'AI'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const plugin: FastifyPluginAsync = async app => {
  const guard = { onRequest: [app.authenticate, app.requireRole(...ROLES)] };

  /** Pase de lista de la sección de la asignación elegida (`asig`); fecha = hoy en la zona horaria del colegio salvo que se pida otra. */
  app.get<{ Querystring: { fecha?: string; asig?: string } }>('/', guard, async (req, reply) => {
    const t = await ahora(), ciclo = await cicloReq(req); // Fase 2D: ciclo elegido (X-Ciclo); por defecto el activo
    const fecha = req.query.fecha ?? (esCicloActivo(ciclo) ? t.fecha : ciclo.fechaFin);
    if (!FECHA.test(fecha)) return reply.code(400).send({ error: 'Fecha inválida' });
    const cat = await loadCat();
    const { lista, sel, prohibida } = await elegirAsig(cat, req.user, req.query.asig, ciclo);
    if (prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const asignaciones = lista.map(optDe);
    if (!esCicloActivo(ciclo)) {
      // Ciclo no activo: el detalle diario no se conserva; se muestra la asistencia RESUMIDA (AsistenciaResumen) de los alumnos matriculados en la seccion.
      const vacio: AcadAsisDia = { seccion: sel?.seccion ?? '', tanda: sel?.tanda ?? '', fecha, bloque: '', cards: [], asigId: sel?.id ?? '', asignaciones, ciclo: ciclo.nombre, resumen: [] };
      if (!sel) return vacio;
      const mats = await prisma.matricula.findMany({ where: { cicloId: ciclo.id, seccionId: sel.seccionId }, include: { alumno: { select: { nombres: true, apellidos: true, id: true } }, asistencias: true } });
      vacio.resumen = mats.map(m => ({
        rosterId: m.alumno.id, nombre: `${m.alumno.apellidos}, ${m.alumno.nombres}`,
        dias: m.asistencias.reduce((a, r) => a + r.diasLectivos, 0), presentes: m.asistencias.reduce((a, r) => a + r.presentes, 0), tardanzas: m.asistencias.reduce((a, r) => a + r.tardanzas, 0),
        ausJust: m.asistencias.reduce((a, r) => a + r.ausenciasJustificadas, 0), ausInjust: m.asistencias.reduce((a, r) => a + r.ausenciasInjustificadas, 0),
      })).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      return vacio;
    }
    if (!sel) return { seccion: '', tanda: '', fecha, bloque: '', cards: [], asigId: '', asignaciones } satisfies AcadAsisDia;
    const sec = cat.secciones.get(sel.seccionId)!;
    const bloques = bloquesDe(cat, sec.tanda);
    const slots = (await prisma.acadHorario.findMany({ where: { cicloId: await cicloIdActivo(), seccionId: sel.seccionId, materiaId: sel.materiaId } })).map(r => r.slot);
    const nom = await nomina(cat, sel.seccionId);
    const marcas = await marcasDelDia(nom, fecha);
    const res: AcadAsisDia = {
      seccion: sel.seccion, tanda: sel.tanda, fecha, bloque: bloqueTexto(bloques, bloqueActual(bloques, t.min, t.dow, slots)),
      asigId: sel.id, asignaciones, ciclo: ciclo.nombre,
      cards: nom.map(n => { const m = n.rosterId ? marcas.get(n.rosterId) : undefined; return { rosterId: n.key, nombre: n.nombre, estado: (m?.estado as AcadMarca | undefined) ?? null, notificar: m?.notificar ?? true }; }),
    };
    return res;
  });

  /** Registra el pase de lista completo del día (upsert por alumno y fecha). */
  app.post<{ Body: { fecha: string; asig?: string; items: { rosterId: string; estado: string; notificar: boolean }[] } }>('/', guard, async (req, reply) => {
    const { fecha, items, asig } = req.body;
    if (!FECHA.test(fecha ?? '') || !Array.isArray(items) || items.some(i => !MARCAS.includes(i.estado))) return reply.code(400).send({ error: 'Datos de asistencia inválidos' });
    const cat = await loadCat();
    const { sel, prohibida } = await elegirAsig(cat, req.user, asig);
    if (!sel || prohibida) return reply.code(403).send({ error: 'Sin permiso sobre esa asignación' });
    const res: AcadAsisGuardado | null = await guardarAsistencia(cat, sel.seccionId, fecha, items);
    if (!res) return reply.code(400).send({ error: 'Hay estudiantes que no pertenecen a esta sección' });
    return res;
  });
};
export default plugin;
