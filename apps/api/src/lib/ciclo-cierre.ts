/**
 * Cierre de ciclo lectivo (EOY) sobre las tablas Ciclo / Matricula (Fase 2C). Promueve por SECCION segun el orden de promocion de Grado, deja el
 * historial intacto (la matricula del ciclo que se cierra pasa a Promovido / Repitente / Graduado) y crea la matricula del ciclo siguiente.
 *
 *  - Alumno Activo en 6to egresa (Alumno.estado = Egresado, matricula Graduado). El resto pasa al grado con el orden siguiente, a la misma letra y tanda
 *    (si no existe, a la seccion de esa tanda con menos alumnos; si tampoco, a cualquiera del grado): matricula anterior Promovido + matricula nueva.
 *  - Sin seccion destino (o alumno Inactivo, que no se promueve) repite: matricula anterior Repitente y matricula nueva en la MISMA seccion.
 *  - Los Retirados conservan su matricula Retirado y no pasan al ciclo siguiente.
 *  - El ciclo cerrado queda Cerrado (solo lectura) y el siguiente Activo. Todo en UNA transaccion.
 */
import { prisma } from '../db';
import { CicloError } from './ciclo';
import { idMatricula } from './matricula';

export interface ResultadoCierre { promovidos: number; egresados: number; repitentes: number; sinSeccion: number; activo: string }
const trozos = <T>(l: T[], n = 800) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

export async function cerrarCiclo(nombre: string): Promise<ResultadoCierre> {
  const [cur, next] = await Promise.all([
    prisma.ciclo.findUnique({ where: { nombre } }),
    prisma.ciclo.findFirst({ where: { estado: 'Planificado' }, orderBy: { fechaInicio: 'asc' } }),
  ]);
  if (!cur || cur.estado !== 'Activo') throw new CicloError('Solo se puede cerrar el ciclo activo');
  if (!next) throw new CicloError('Crea primero el ciclo siguiente para poder cerrar este');
  const [alumnos, grados, secciones, yaNext] = await Promise.all([
    prisma.alumno.findMany({ where: { estado: { in: ['Activo', 'Inactivo'] } }, select: { id: true, estado: true, seccionId: true, seccion: { select: { letra: true, tandaId: true, grado: { select: { id: true, nombre: true, orden: true } } } } } }),
    prisma.grado.findMany({ where: { estado: 'Activo' } }),
    prisma.seccion.findMany({ where: { estado: 'Activo' } }),
    prisma.matricula.findMany({ where: { cicloId: next.id }, select: { alumnoId: true } }),
  ]);
  const tiene = new Set(yaNext.map(m => m.alumnoId));
  const carga = new Map<string, number>();
  const promovidos: string[] = [], repiten: string[] = [], graduan: string[] = [], nuevas: { alumnoId: string; seccionId: string }[] = [];
  const porSeccion = new Map<string, string[]>();
  let up = 0, eg = 0, sinSeccion = 0;
  for (const a of alumnos) {
    const g = a.seccion.grado;
    if (a.estado === 'Activo' && g.nombre === '6to') { eg++; graduan.push(a.id); continue; }
    if (a.estado !== 'Activo') { repiten.push(a.id); nuevas.push({ alumnoId: a.id, seccionId: a.seccionId }); continue; } // Inactivo: no se promueve
    const sig = grados.find(x => x.orden === g.orden + 1);
    const cand = sig ? secciones.filter(s => s.gradoId === sig.id) : [];
    const dest = cand.find(s => s.letra === a.seccion.letra && s.tandaId === a.seccion.tandaId)
      ?? [...cand].filter(s => s.tandaId === a.seccion.tandaId).sort((p, q) => (carga.get(p.id) ?? 0) - (carga.get(q.id) ?? 0))[0]
      ?? [...cand].sort((p, q) => (carga.get(p.id) ?? 0) - (carga.get(q.id) ?? 0))[0];
    if (!dest) { sinSeccion++; repiten.push(a.id); nuevas.push({ alumnoId: a.id, seccionId: a.seccionId }); continue; }
    carga.set(dest.id, (carga.get(dest.id) ?? 0) + 1);
    up++;
    promovidos.push(a.id);
    porSeccion.set(dest.id, [...(porSeccion.get(dest.id) ?? []), a.id]);
    nuevas.push({ alumnoId: a.id, seccionId: dest.id });
  }
  await prisma.$transaction(async tx => {
    // 1) matricula del ciclo que se cierra: estado final (el historial se conserva)
    for (const ids of trozos(promovidos)) await tx.matricula.updateMany({ where: { cicloId: cur.id, alumnoId: { in: ids }, estado: 'Activo' }, data: { estado: 'Promovido' } });
    for (const ids of trozos(repiten)) await tx.matricula.updateMany({ where: { cicloId: cur.id, alumnoId: { in: ids }, estado: 'Activo' }, data: { estado: 'Repitente' } });
    for (const ids of trozos(graduan)) {
      await tx.matricula.updateMany({ where: { cicloId: cur.id, alumnoId: { in: ids }, estado: 'Activo' }, data: { estado: 'Graduado' } });
      await tx.alumno.updateMany({ where: { id: { in: ids } }, data: { estado: 'Egresado' } });
    }
    // 2) alumno -> seccion del nuevo ciclo (copia de la matricula activa) y matricula nueva
    for (const [seccionId, ids] of porSeccion) for (const ch of trozos(ids)) await tx.alumno.updateMany({ where: { id: { in: ch } }, data: { seccionId } });
    const filas = nuevas.filter(n => !tiene.has(n.alumnoId)).map(n => ({ id: idMatricula(n.alumnoId, next.id), alumnoId: n.alumnoId, cicloId: next.id, seccionId: n.seccionId, estado: 'Activo', fechaIngreso: next.fechaInicio, fechaRetiro: null }));
    for (const ch of trozos(filas, 400)) await tx.matricula.createMany({ data: ch });
    // 3) estados del ciclo (primero el que se cierra: UX_Ciclo_activo admite UN solo Activo)
    await tx.ciclo.update({ where: { id: cur.id }, data: { estado: 'Cerrado' } });
    await tx.ciclo.update({ where: { id: next.id }, data: { estado: 'Activo' } });
  }, { timeout: 300_000, maxWait: 60_000 });
  return { promovidos: up, egresados: eg, repitentes: repiten.length, sinSeccion, activo: next.nombre };
}
