import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { finalesCiclo, leerCierreNotas, tieneCierreNotas } from '../notas-finales';
import { cfgPromocion } from '../promocion';
import { col, etiquetasFiltros, hoy as hoyDMY, tablaMem, type Filtros } from './comun';

/**
 * INFORME 2 · Movimientos del alumnado (inf-cierre). Una fila por MATRÍCULA del ciclo (sin reservas ni liberadas) con su movimiento:
 *   Promovido · Repitente (reprobado) · Retirado · Egresado · Inactivo · Pendiente (sin resultado aún).
 * FUENTE: MatriculaResultado (resultado CONGELADO al aplicar la promoción —con promedio y destino reales— o al cerrar el año) cuando existe; si no, se RECONSTRUYE comparando la
 * matrícula del ciclo N con la del ciclo siguiente (grado mayor = Promovido, igual o menor = Repitente) y con los estados de la matrícula/alumno, y la fila queda marcada «Reconstruido».
 * Inactivo = alumno con estado actual «Inactivo» sin matrícula vigente en el ciclo siguiente (no hay fecha de inactivación histórica). Motivo: Matricula.motivoRetiro, y como
 * respaldo el motivo de la liberación de cupo (reinscripción) o el escrito en la auditoría.
 */
export const RESULTADOS_MOV = ['Promovido', 'Repitente', 'Retirado', 'Egresado', 'Inactivo', 'Pendiente'] as const;
type Mov = (typeof RESULTADOS_MOV)[number];

interface Fila {
  matriculaId: string; alumnoId: string; code: string; nombre: string; orden: string;
  gradoId: string; grado: string; gradoOrden: number; seccionId: string; seccion: string;
  mov: Mov; destino: string; promedio: number | null; reprobadas: number; motivo: string; fechaRetiro: string; fuente: 'Congelado (promoción)' | 'Congelado (cierre)' | 'Reconstruido';
  destinoGrado: string;
}

const MOT_AUDIT = / · motivo: (.+)$/s;

export async function informeMovimientos(f: Filtros): Promise<InformeResp> {
  const ciclo = f.ciclo;
  const [ciclos, secciones] = await Promise.all([
    prisma.ciclo.findMany({ orderBy: { fechaInicio: 'asc' }, select: { id: true, nombre: true, fechaInicio: true, estado: true } }),
    prisma.seccion.findMany({ select: { id: true, letra: true, grado: { select: { id: true, nombre: true, orden: true, nivel: { select: { nombre: true } } } } } }),
  ]);
  const sig = ciclos.find(c => c.fechaInicio > ciclo.fechaInicio) ?? null;
  const nombreCiclo = new Map(ciclos.map(c => [c.id, c.nombre]));
  const sec = new Map(secciones.map(s => [s.id, { gradoId: s.grado.id, grado: `${s.grado.nivel.nombre} · ${s.grado.nombre}`, orden: s.grado.orden, texto: `${s.grado.nivel.nombre} · ${s.grado.nombre} ${s.letra}` }]));

  const [mats, sigMats, resultados, cfg] = await Promise.all([
    prisma.matricula.findMany({
      where: { cicloId: ciclo.id, estado: { notIn: ['Liberada', 'Reservado'] } },
      select: { id: true, alumnoId: true, seccionId: true, estado: true, fechaRetiro: true, motivoRetiro: true, alumno: { select: { code: true, nombres: true, apellidos: true, estado: true } } },
    }),
    sig ? prisma.matricula.findMany({ where: { cicloId: sig.id }, select: { alumnoId: true, seccionId: true, estado: true } }) : Promise.resolve([]),
    prisma.matriculaResultado.findMany({ where: { cicloId: ciclo.id }, select: { matriculaId: true, promedio: true, materiasReprobadas: true, resultado: true, accion: true, seccionDestinoId: true, cicloDestinoId: true, fuente: true } }),
    cfgPromocion(),
  ]);
  const mr = new Map(resultados.map(r => [r.matriculaId, r]));
  const sigDe = new Map(sigMats.map(m => [m.alumnoId, m]));

  // Promedio de las filas reconstruidas: foto congelada del ciclo si existe, y si no, la Matriz actual.
  const hayReconstruidas = mats.some(m => !mr.has(m.id) && m.estado !== 'Retirado');
  let finales: Awaited<ReturnType<typeof finalesCiclo>> | null = null;
  if (hayReconstruidas) finales = (await tieneCierreNotas(ciclo.id)) ? await leerCierreNotas(ciclo.id) : await finalesCiclo(ciclo.id);
  const promedioDe = (alumnoId: string) => {
    const a = finales?.alumnos.get(alumnoId);
    if (!a) return { promedio: null as number | null, reprobadas: 0 };
    const v = [...a.materias.values()].map(m => m.final).filter((x): x is number => x != null);
    return { promedio: v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null, reprobadas: v.filter(x => x < cfg.notaMinima).length };
  };

  const filas: Fila[] = mats.map(m => {
    const s = sec.get(m.seccionId)!, a = m.alumno, r = mr.get(m.id);
    const sm = sigDe.get(m.alumnoId), sigVigente = sm && !['Retirado', 'Liberada'].includes(sm.estado) ? sm : null;
    let mov: Mov, destSec: string | null = null, destCiclo: string | null = null, promedio: number | null, reprobadas: number, fuente: Fila['fuente'];
    if (r) {
      fuente = r.fuente === 'promocion' ? 'Congelado (promoción)' : 'Congelado (cierre)';
      promedio = r.promedio; reprobadas = r.materiasReprobadas;
      mov = r.resultado === 'Graduado' ? 'Egresado' : r.resultado === 'Retirado' ? 'Retirado' : r.resultado === 'Aprobado' ? 'Promovido' : r.resultado === 'Reprobado' ? 'Repitente' : 'Pendiente';
      destSec = r.seccionDestinoId; destCiclo = r.cicloDestinoId;
      if (!destSec && sigVigente) { destSec = sigVigente.seccionId; destCiclo = sig!.id; } // 'Pendiente' del cierre cuya matrícula del ciclo siguiente se creó después
    } else {
      fuente = 'Reconstruido';
      ({ promedio, reprobadas } = m.estado === 'Retirado' ? { promedio: null, reprobadas: 0 } : promedioDe(m.alumnoId));
      if (m.estado === 'Retirado') mov = 'Retirado';
      else if (m.estado === 'Graduado') mov = 'Egresado';
      else if (sigVigente) { mov = (sec.get(sigVigente.seccionId)?.orden ?? 0) > s.orden ? 'Promovido' : 'Repitente'; destSec = sigVigente.seccionId; destCiclo = sig!.id; }
      else if (m.estado === 'Promovido') mov = 'Promovido';
      else if (m.estado === 'Repitente') mov = 'Repitente';
      else if (a.estado === 'Egresado') mov = 'Egresado';
      else mov = 'Pendiente';
    }
    if (a.estado === 'Inactivo' && !sigVigente && ['Pendiente', 'Promovido', 'Repitente'].includes(mov)) mov = 'Inactivo';
    if (a.estado === 'Retirado' && !sigVigente && mov === 'Pendiente') mov = 'Retirado';
    return {
      matriculaId: m.id, alumnoId: m.alumnoId, code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), orden: `${a.apellidos} ${a.nombres}`.toLowerCase(),
      gradoId: s.gradoId, grado: s.grado, gradoOrden: s.orden, seccionId: m.seccionId, seccion: s.texto, mov,
      destino: destSec ? `${sec.get(destSec)?.texto ?? ''}${destCiclo ? ` · ${nombreCiclo.get(destCiclo) ?? ''}` : ''}` : '',
      destinoGrado: destSec ? `${sec.get(destSec)?.grado ?? ''}` : '',
      promedio, reprobadas, motivo: m.motivoRetiro ?? '', fechaRetiro: m.fechaRetiro ?? '', fuente,
    };
  });

  // Motivo de respaldo (solo retirados / inactivos sin motivo): liberación de cupo o auditoría.
  const sinMotivo = filas.filter(x => (x.mov === 'Retirado' || x.mov === 'Inactivo') && !x.motivo);
  if (sinMotivo.length) {
    const ids = sinMotivo.map(x => x.alumnoId);
    const [liberadas, audits] = await Promise.all([
      prisma.reinscripcionEvento.findMany({ where: { alumnoId: { in: ids }, tipo: 'Liberada' }, orderBy: { id: 'asc' }, select: { alumnoId: true, motivo: true } }),
      prisma.sisAudit.findMany({ where: { tabla: 'Alumnos', registro: { in: sinMotivo.map(x => `${x.code}/estado`) }, next: { contains: ' · motivo: ' } }, orderBy: { t: 'asc' }, select: { registro: true, next: true } }),
    ]);
    const lib = new Map(liberadas.map(l => [l.alumnoId, l.motivo]));
    const aud = new Map(audits.map(a => [a.registro.replace(/\/estado$/, ''), MOT_AUDIT.exec(a.next)?.[1]?.trim() ?? '']));
    for (const x of sinMotivo) x.motivo = aud.get(x.code) || lib.get(x.alumnoId) || '';
  }

  // Filtros
  const vis = filas.filter(x => (!f.grado || x.gradoId === f.grado) && (!f.seccion || x.seccionId === f.seccion) && (!f.resultado || x.mov === f.resultado));
  vis.sort((a, b) => a.gradoOrden - b.gradoOrden || a.seccion.localeCompare(b.seccion, 'es') || a.orden.localeCompare(b.orden, 'es'));

  const cuenta = (l: Fila[], m: Mov) => l.filter(x => x.mov === m).length;
  const prom = (l: Fila[]) => { const v = l.map(x => x.promedio).filter((x): x is number => x != null); return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const total = vis.length, reconstruidas = vis.filter(x => x.fuente === 'Reconstruido').length;
  const pct = (n: number) => (total ? round2((n / total) * 100) : 0);

  const tResultado = RESULTADOS_MOV.map(m => { const l = vis.filter(x => x.mov === m); return [m, l.length, pct(l.length), prom(l), l.filter(x => x.fuente === 'Reconstruido').length] as InformeCelda[]; });

  // Por grado (detalle: por sección)
  const porGrado = new Map<string, Fila[]>();
  for (const x of vis) porGrado.set(x.gradoId, [...(porGrado.get(x.gradoId) ?? []), x]);
  const gradosOrden = [...porGrado.values()].sort((a, b) => a[0].gradoOrden - b[0].gradoOrden);
  const celdasConteo = (l: Fila[]) => [l.length, ...RESULTADOS_MOV.map(m => cuenta(l, m)), prom(l)] as InformeCelda[];
  const colsConteo = [col('n', 'Alumnos', 'entero'), ...RESULTADOS_MOV.map(m => col(m.toLowerCase(), m === 'Repitente' ? 'Repitentes' : m === 'Pendiente' ? 'Pendientes' : m + 's', 'entero')), col('prom', 'Promedio', 'decimal')];
  const detGrado = gradosOrden.map(l => {
    const ps = new Map<string, Fila[]>();
    for (const x of l) ps.set(x.seccionId, [...(ps.get(x.seccionId) ?? []), x]);
    return [...ps.values()].map(s => [s[0].seccion, ...celdasConteo(s)] as InformeCelda[]);
  });
  const sumCol = (i: number) => round2(gradosOrden.reduce((a, l) => a + (celdasConteo(l)[i] as number), 0));

  // Flujo origen → destino
  const flujo = new Map<string, { o: string; d: string; n: number; ord: number }>();
  for (const x of vis) {
    const d = x.destino ? x.destinoGrado : x.mov === 'Egresado' ? 'Egresa' : x.mov === 'Retirado' ? 'Retirado' : x.mov === 'Inactivo' ? 'Inactivo' : 'Sin destino registrado';
    const k = `${x.gradoId}|${d}`;
    const e = flujo.get(k) ?? { o: x.grado, d, n: 0, ord: x.gradoOrden };
    e.n++; flujo.set(k, e);
  }
  const filasFlujo = [...flujo.values()].sort((a, b) => a.ord - b.ord || b.n - a.n).map(e => [e.o, e.d, e.n] as InformeCelda[]);

  const filasAl = vis.map(x => [x.code, x.nombre, x.seccion, x.mov, x.destino || '—', x.promedio, x.mov === 'Pendiente' || x.mov === 'Retirado' ? null : x.reprobadas, x.fechaRetiro ? x.fechaRetiro.split('-').reverse().join('/') : '', x.motivo, x.fuente] as InformeCelda[]);

  const tablas = [
    tablaMem(f, 'resultado', 'Resumen por resultado', [col('mov', 'Movimiento'), col('n', 'Alumnos', 'entero'), col('pct', '% del total', 'porcentaje'), col('prom', 'Promedio', 'decimal'), col('rec', 'Reconstruidos', 'entero')], tResultado,
      { totales: ['TOTAL', total, total ? 100 : 0, prom(vis), reconstruidas], vacio: 'No hay matrículas con estos filtros.' }),
    tablaMem(f, 'grado', 'Resumen por grado de origen', [col('grado', 'Grado de origen'), ...colsConteo], gradosOrden.map(l => [l[0].grado, ...celdasConteo(l)] as InformeCelda[]),
      { totales: ['TOTAL', total, ...RESULTADOS_MOV.map((_, i) => sumCol(i + 1)), prom(vis)], vacio: 'No hay matrículas con estos filtros.',
        detalle: { titulo: 'Por sección', columnas: [col('seccion', 'Sección'), ...colsConteo], porFila: detGrado } }),
    tablaMem(f, 'flujo', 'Origen → destino (grado)', [col('o', 'Grado de origen'), col('d', 'Destino (grado en el ciclo siguiente)'), col('n', 'Alumnos', 'entero')], filasFlujo,
      { totales: ['TOTAL', '', total], vacio: 'No hay matrículas con estos filtros.' }),
    {
      ...tablaMem(f, 'alumnos', 'Detalle por alumno', [col('code', 'Código'), col('alumno', 'Alumno'), col('origen', 'Origen (grado y sección)'), col('mov', 'Movimiento'), col('destino', 'Destino (sección · ciclo)'), col('prom', 'Promedio', 'decimal'), col('rep', 'Mat. reprobadas', 'entero'), col('fret', 'Fecha de retiro'), col('motivo', 'Motivo'), col('fuente', 'Fuente')], filasAl,
        { paginable: true, vacio: 'No hay alumnos con estos filtros.', totales: ['', `${total.toLocaleString('en-US')} alumnos`, '', '', '', prom(vis), null, '', '', ''] }),
      pdfMax: 75,
    },
  ];
  return {
    id: 'movimientos', titulo: 'Movimientos del alumnado', grupo: 'inf-cierre', ciclo: ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'grado', 'seccion', 'resultado']),
    resumen: [
      { id: 'total', etiqueta: 'Alumnos del ciclo', valor: total, tipo: 'entero' },
      { id: 'prom', etiqueta: 'Promovidos', valor: cuenta(vis, 'Promovido'), tipo: 'entero', tono: 'ok' },
      { id: 'rep', etiqueta: 'Repitentes', valor: cuenta(vis, 'Repitente'), tipo: 'entero', tono: cuenta(vis, 'Repitente') ? 'warn' : undefined },
      { id: 'ret', etiqueta: 'Retirados', valor: cuenta(vis, 'Retirado'), tipo: 'entero', tono: cuenta(vis, 'Retirado') ? 'bad' : undefined },
      { id: 'egr', etiqueta: 'Egresados', valor: cuenta(vis, 'Egresado'), tipo: 'entero', tono: 'info' },
      { id: 'ina', etiqueta: 'Inactivos', valor: cuenta(vis, 'Inactivo'), tipo: 'entero' },
      { id: 'pen', etiqueta: 'Pendientes (sin resultado)', valor: cuenta(vis, 'Pendiente'), tipo: 'entero', tono: cuenta(vis, 'Pendiente') ? 'warn' : undefined },
      { id: 'pmd', etiqueta: 'Promedio general', valor: prom(vis) ?? 'Sin notas', tipo: 'decimal' },
      { id: 'rec', etiqueta: 'Filas reconstruidas', valor: reconstruidas, tipo: 'entero', tono: reconstruidas ? 'info' : undefined },
    ],
    tablas,
    notas: [
      'Cómo se calcula: cada fila es una matrícula del ciclo (se excluyen reservas y cupos liberados). Si la matrícula tiene resultado congelado (MatriculaResultado) se usa tal cual —al aplicar la promoción se guarda con su promedio y destino reales; al cerrar el año se guarda, para quien no tenía promoción, según el estado de la matrícula—. La columna «Fuente» lo indica.',
      `«Reconstruido» = no hay resultado congelado: el movimiento se deduce comparando la matrícula de este ciclo con la del ${sig ? 'ciclo siguiente (' + sig.nombre + ')' : 'ciclo siguiente (no existe)'}: grado superior = Promovido; mismo grado = Repitente; sin matrícula posterior se usa el estado de la matrícula (Retirado, Graduado→Egresado, Promovido, Repitente) y, en su defecto, Pendiente. El promedio reconstruido sale de la foto de notas del cierre si existe y, si no, de la Matriz con la rúbrica de hoy.`,
      `Promedio = promedio simple de las notas finales de materia (Matriz de Notas, fórmula «Final»); Mat. reprobadas = materias con final por debajo de la nota mínima de la política de promoción (${cfg.notaMinima}). Ciclos sin notas completas (2023–24 y 2024–25 en datos reales) muestran el promedio vacío.`,
      'Inactivo = alumno con estado actual «Inactivo» y sin matrícula vigente en el ciclo siguiente: el sistema no guarda una fecha de inactivación. Pendiente = el ciclo aún no tiene resultado de promoción ni destino.',
      'Motivo de retiro: lo que se escribe al dar de baja o inactivar al alumno (Expediente › Eliminar, o Editar › Estado); si no se escribió, se muestra el motivo de la liberación de cupo por reinscripción o el que quedó en la auditoría.',
    ],
  };
}
