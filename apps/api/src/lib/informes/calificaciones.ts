import type { InformeCelda, InformeResp, InformeTabla } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { finalesCiclo, leerCierreNotas, tieneCierreNotas, type AlumnoFinales, type FinalesCiclo, type MateriaFinal } from '../notas-finales';
import { cfgPromocion } from '../promocion';
import { col, etiquetasFiltros, hoy as hoyDMY, fechaDMY, tablaMem, trozos, type Filtros } from './comun';

/**
 * INFORME 3 · Calificaciones consolidadas por sección (inf-cierre). Nota = «Final» de la Matriz de Notas (lib/promocion.finalPeriodo, 1 decimal) por periodo; final de la materia =
 * promedio de sus periodos; promedio del alumno = promedio de sus finales de materia (lib/notas-finales.ts). FUENTE: ciclo Cerrado con foto (CierreNota, tomada en cerrarCiclo) →
 * «Congelado»; ciclo abierto o cerrado sin foto → cálculo «En vivo» con la rúbrica de hoy. La sección es la de la MATRÍCULA del ciclo. Aprobado = nota ≥ nota mínima de la política
 * de promoción. Con filtro de periodo, todas las cifras usan el final de ese periodo; con filtro de materia, solo esa materia.
 */
const r1 = (n: number) => Math.round(n * 10) / 10;
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const med1 = (v: number[]) => { const m = media(v); return m == null ? null : r1(m); };
const frozenCache = new Map<string, FinalesCiclo>(); // la foto de un cierre no cambia: se reutiliza entre páginas

export async function informeCalificaciones(f: Filtros): Promise<InformeResp> {
  const cicloId = f.ciclo.id;
  const [cfg, foto] = await Promise.all([cfgPromocion(), f.ciclo.estado === 'Cerrado' ? tieneCierreNotas(cicloId) : Promise.resolve(false)]);
  let fin: FinalesCiclo;
  if (foto) { fin = frozenCache.get(cicloId) ?? (await leerCierreNotas(cicloId)); frozenCache.set(cicloId, fin); } else fin = await finalesCiclo(cicloId);
  const min = cfg.notaMinima;
  const pIdx = f.periodo ? fin.periodos.findIndex(p => String(p.orden) === f.periodo) : -1;
  const nota = (m: MateriaFinal | undefined): number | null => (m ? (pIdx >= 0 ? m.per[pIdx] : m.final) : null);

  const secciones = await prisma.seccion.findMany({ select: { id: true, letra: true, grado: { select: { id: true, orden: true, nombre: true, nivel: { select: { nombre: true } } } } } });
  const sec = new Map(secciones.map(s => [s.id, { gradoId: s.grado.id, orden: s.grado.orden, letra: s.letra, texto: `${s.grado.nivel.nombre} · ${s.grado.nombre} ${s.letra}` }]));
  const alumnos = [...fin.alumnos.values()].filter(a => (!f.seccion || a.seccionId === f.seccion) && (!f.grado || sec.get(a.seccionId)?.gradoId === f.grado) && a.materias.size > 0);
  const info = new Map<string, { code: string; nombre: string; orden: string }>();
  for (const ch of trozos(alumnos.map(a => a.alumnoId))) {
    for (const a of await prisma.alumno.findMany({ where: { id: { in: ch } }, select: { id: true, code: true, nombres: true, apellidos: true } })) info.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), orden: `${a.apellidos} ${a.nombres}`.toLowerCase() });
  }
  const periodoNombre = (i: number) => `P${fin.periodos[i]?.orden ?? i + 1}`;
  const nombreMateria = (id: string) => fin.materias.get(id) ?? id;

  // Alumno -> nota considerada (según filtros de materia / periodo)
  const notasAl = (a: AlumnoFinales): { materia: string; v: number }[] => {
    const out: { materia: string; v: number }[] = [];
    for (const [mid, m] of a.materias) { if (f.materia && mid !== f.materia) continue; const v = nota(m); if (v != null) out.push({ materia: mid, v }); }
    return out;
  };
  const resumenAl = new Map(alumnos.map(a => { const n = notasAl(a); return [a.alumnoId, { a, n, prom: med1(n.map(x => x.v)), bajo: n.filter(x => x.v < min).length }] as const; }));
  const conNota = [...resumenAl.values()].filter(x => x.prom != null);

  // ---- Sección × materia
  const sm = new Map<string, { seccionId: string; materiaId: string; filas: { a: AlumnoFinales; m: MateriaFinal }[] }>();
  for (const a of alumnos) for (const [mid, m] of a.materias) {
    if (f.materia && mid !== f.materia) continue;
    if (nota(m) == null) continue;
    const k = `${a.seccionId}|${mid}`;
    const e = sm.get(k) ?? { seccionId: a.seccionId, materiaId: mid, filas: [] };
    e.filas.push({ a, m }); sm.set(k, e);
  }
  const smOrden = [...sm.values()].sort((x, y) => (sec.get(x.seccionId)!.orden - sec.get(y.seccionId)!.orden) || sec.get(x.seccionId)!.texto.localeCompare(sec.get(y.seccionId)!.texto, 'es') || nombreMateria(x.materiaId).localeCompare(nombreMateria(y.materiaId), 'es'));
  const colsPer = fin.periodos.map((_, i) => col('p' + i, periodoNombre(i), 'decimal'));
  const filasSM = smOrden.map(e => {
    const vs = e.filas.map(x => nota(x.m)!);
    return [sec.get(e.seccionId)!.texto, nombreMateria(e.materiaId), vs.length, ...fin.periodos.map((_, i) => med1(e.filas.map(x => x.m.per[i]).filter((v): v is number => v != null))), med1(vs), Math.min(...vs), Math.max(...vs), round2((vs.filter(v => v >= min).length / vs.length) * 100)] as InformeCelda[];
  });
  const detSM = smOrden.map(e => e.filas.sort((x, y) => (info.get(x.a.alumnoId)?.orden ?? '').localeCompare(info.get(y.a.alumnoId)?.orden ?? '', 'es')).map(x => [info.get(x.a.alumnoId)?.code ?? '', info.get(x.a.alumnoId)?.nombre ?? '', ...x.m.per, x.m.final] as InformeCelda[]));

  // ---- Por sección
  const porSec = new Map<string, typeof conNota>();
  for (const x of conNota) porSec.set(x.a.seccionId, [...(porSec.get(x.a.seccionId) ?? []), x]);
  const secOrden = [...porSec.entries()].sort((x, y) => (sec.get(x[0])!.orden - sec.get(y[0])!.orden) || sec.get(x[0])!.texto.localeCompare(sec.get(y[0])!.texto, 'es'));
  const filasSec = secOrden.map(([sid, l]) => {
    const ps = l.map(x => x.prom!);
    return [sec.get(sid)!.texto, l.length, med1(ps), ps.filter(p => p >= min).length, ps.filter(p => p < min).length, Math.max(...ps), Math.min(...ps)] as InformeCelda[];
  });
  const detSec = secOrden.map(([sid]) => {
    const por = new Map<string, number[]>();
    for (const e of smOrden.filter(z => z.seccionId === sid)) por.set(e.materiaId, e.filas.map(x => nota(x.m)!));
    return [...por.entries()].sort((x, y) => nombreMateria(x[0]).localeCompare(nombreMateria(y[0]), 'es')).map(([mid, vs]) => [nombreMateria(mid), vs.length, med1(vs), Math.min(...vs), Math.max(...vs), round2((vs.filter(v => v >= min).length / vs.length) * 100)] as InformeCelda[]);
  });

  // ---- Matriz alumno × materia (una sección). Cada sección es una tabla; en pantalla la de la sección filtrada, en Excel una hoja por sección.
  const matrizDe = (sid: string): { cols: ReturnType<typeof col>[]; filas: InformeCelda[][]; titulo: string } => {
    const als = conNota.filter(x => x.a.seccionId === sid).sort((x, y) => (info.get(x.a.alumnoId)?.orden ?? '').localeCompare(info.get(y.a.alumnoId)?.orden ?? '', 'es'));
    const mats = [...new Set(als.flatMap(x => x.n.map(y => y.materia)))].sort((x, y) => nombreMateria(x).localeCompare(nombreMateria(y), 'es'));
    return {
      titulo: `Matriz ${sec.get(sid)!.texto}`,
      cols: [col('code', 'Código'), col('alumno', 'Alumno'), ...mats.map(m => col('m' + m, nombreMateria(m), 'decimal')), col('prom', 'Promedio', 'decimal')],
      filas: als.map(x => [info.get(x.a.alumnoId)?.code ?? '', info.get(x.a.alumnoId)?.nombre ?? '', ...mats.map(m => x.n.find(y => y.materia === m)?.v ?? null), x.prom] as InformeCelda[]),
    };
  };
  let tMatriz: InformeTabla;
  if (f.seccion && porSec.has(f.seccion)) {
    const m = matrizDe(f.seccion);
    tMatriz = tablaMem(f, 'matriz', `Matriz alumno × materia · ${sec.get(f.seccion)!.texto}`, m.cols, m.filas, { paginable: true, vacio: 'Sin notas.' });
  } else {
    tMatriz = tablaMem(f, 'matriz', 'Matriz alumno × materia', [col('alumno', 'Alumno')], [], { vacio: f.seccion ? 'La sección no tiene notas finales con estos filtros.' : 'Elige una sección en el filtro para ver su matriz alumno × materia con los finales. En la exportación a Excel se incluye una hoja por sección.' });
  }
  const anexos: InformeTabla[] | undefined = f.size === 0 && !f.seccion
    ? secOrden.map(([sid]) => { const m = matrizDe(sid); return { id: 'matriz-' + sid, titulo: m.titulo, columnas: m.cols, filas: m.filas, total: m.filas.length, page: 1, size: m.filas.length } satisfies InformeTabla; })
    : undefined;

  // ---- Rankings
  const ordenados = [...conNota].sort((x, y) => y.prom! - x.prom! || (info.get(x.a.alumnoId)?.orden ?? '').localeCompare(info.get(y.a.alumnoId)?.orden ?? '', 'es'));
  const top = ordenados.slice(0, 10).map((x, i) => [i + 1, info.get(x.a.alumnoId)?.code ?? '', info.get(x.a.alumnoId)?.nombre ?? '', sec.get(x.a.seccionId)!.texto, x.prom] as InformeCelda[]);
  const bajos = ordenados.filter(x => x.prom! < min).reverse().map(x => [info.get(x.a.alumnoId)?.code ?? '', info.get(x.a.alumnoId)?.nombre ?? '', sec.get(x.a.seccionId)!.texto, x.prom, x.bajo] as InformeCelda[]);

  const proms = conNota.map(x => x.prom!);
  const aprobados = proms.filter(p => p >= min).length;
  const fechaFoto = foto ? (await prisma.cierreNota.aggregate({ where: { cicloId }, _max: { fecha: true } }))._max.fecha : null;
  const fuenteTxt = foto ? `Congelado al cierre${fechaFoto ? ' (' + fechaDMY(fechaFoto, f.tz) + ')' : ''}` : f.ciclo.estado === 'Cerrado' ? 'En vivo (sin foto de cierre)' : 'En vivo';
  return {
    id: 'calificaciones', titulo: 'Calificaciones consolidadas por sección', grupo: 'inf-cierre', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'grado', 'seccion', 'materia', 'periodo']),
    resumen: [
      { id: 'fuente', etiqueta: 'Fuente de las notas', valor: fuenteTxt, tipo: 'texto', tono: foto ? 'ok' : 'info' },
      { id: 'alumnos', etiqueta: 'Alumnos con notas', valor: conNota.length, tipo: 'entero' },
      { id: 'secciones', etiqueta: 'Secciones', valor: porSec.size, tipo: 'entero' },
      { id: 'materias', etiqueta: 'Materias con notas', valor: new Set(smOrden.map(e => e.materiaId)).size, tipo: 'entero' },
      { id: 'prom', etiqueta: 'Promedio general', valor: med1(proms) ?? 'Sin notas', tipo: 'decimal' },
      { id: 'apro', etiqueta: `Aprobados (≥ ${min})`, valor: aprobados, tipo: 'entero', tono: 'ok' },
      { id: 'bajo', etiqueta: `Bajo la nota mínima (< ${min})`, valor: proms.length - aprobados, tipo: 'entero', tono: proms.length - aprobados ? 'bad' : undefined },
    ],
    tablas: [
      { ...tablaMem(f, 'secciones', 'Promedio por sección', [col('seccion', 'Sección'), col('n', 'Alumnos', 'entero'), col('prom', 'Promedio', 'decimal'), col('apro', 'Aprobados', 'entero'), col('bajo', 'Bajo mínimo', 'entero'), col('max', 'Mejor', 'decimal'), col('min', 'Menor', 'decimal')], filasSec,
        { totales: ['TOTAL', conNota.length, med1(proms), aprobados, proms.length - aprobados, proms.length ? Math.max(...proms) : null, proms.length ? Math.min(...proms) : null], vacio: 'No hay notas finales con estos filtros.',
          detalle: { titulo: 'Promedio por materia de la sección', columnas: [col('materia', 'Materia'), col('n', 'Alumnos', 'entero'), col('prom', 'Promedio', 'decimal'), col('min', 'Menor', 'decimal'), col('max', 'Mejor', 'decimal'), col('apro', '% aprobados', 'porcentaje')], porFila: detSec } }), pdfMax: 75 },
      { ...tablaMem(f, 'seccion-materia', 'Promedio por sección, materia y período', [col('seccion', 'Sección'), col('materia', 'Materia'), col('n', 'Alumnos', 'entero'), ...colsPer, col('prom', pIdx >= 0 ? `Promedio ${periodoNombre(pIdx)}` : 'Promedio final', 'decimal'), col('min', 'Menor', 'decimal'), col('max', 'Mejor', 'decimal'), col('apro', '% aprobados', 'porcentaje')], filasSM,
        { paginable: true, vacio: 'No hay notas finales con estos filtros.',
          totales: ['', 'PROMEDIO GENERAL', conNota.length, ...fin.periodos.map(() => null), med1(proms), proms.length ? Math.min(...proms) : null, proms.length ? Math.max(...proms) : null, proms.length ? round2((aprobados / proms.length) * 100) : null],
          detalle: { titulo: 'Notas finales por alumno', columnas: [col('code', 'Código'), col('alumno', 'Alumno'), ...colsPer, col('final', 'Final materia', 'decimal')], porFila: detSM } }), pdfMax: 75 },
      ...(f.size === 0 && !f.seccion ? [] : [tMatriz]), // exportación sin sección: la matriz va como una hoja por sección (anexos)
      tablaMem(f, 'mejores', 'Mejores promedios (10)', [col('pos', '#', 'entero'), col('code', 'Código'), col('alumno', 'Alumno'), col('seccion', 'Sección'), col('prom', 'Promedio', 'decimal')], top, { vacio: 'No hay promedios con estos filtros.' }),
      { ...tablaMem(f, 'bajo', `Alumnos bajo la nota mínima (${min})`, [col('code', 'Código'), col('alumno', 'Alumno'), col('seccion', 'Sección'), col('prom', 'Promedio', 'decimal'), col('mat', 'Materias bajo mínimo', 'entero')], bajos, { paginable: true, vacio: 'Ningún alumno está por debajo de la nota mínima con estos filtros.' }), pdfMax: 75 },
    ],
    notas: [
      `Cómo se calcula: nota de un período = fórmula «Final» de la Matriz de Notas (promedio ponderado de las competencias de la rúbrica de la materia y examen); final de la materia = promedio simple de los períodos con nota; promedio del alumno = promedio simple de sus finales de materia. Aprobado = nota ≥ ${min} (nota mínima de la política de promoción, Configuración › Promoción de curso).`,
      foto
        ? `Fuente: foto de notas finales tomada al cerrar el año (tabla CierreNota): no cambia aunque después se editen notas o rúbricas.`
        : f.ciclo.estado === 'Cerrado'
          ? 'Fuente: este ciclo se cerró antes de existir la foto de notas, por eso se calcula «en vivo» con las notas y la rúbrica de hoy (puede variar si se editaron).'
          : 'Fuente: cálculo «en vivo» con la Matriz de Notas actual; al cerrar el año se congela en CierreNota.',
      'La sección es la de la matrícula del alumno en el ciclo. Solo cuentan los períodos con TODAS sus competencias (y examen) capturadas; un alumno sin notas completas no aparece. Con el filtro «Período» las cifras usan el final de ese período; con «Materia», solo esa materia.',
      'Excel: hoja de resumen, tablas con su detalle por alumno (todas las notas finales del filtro) y una hoja de matriz alumno × materia por cada sección. El PDF imprime las primeras filas de las tablas largas.',
    ],
    ...(anexos ? { anexos } : {}),
  };
}
