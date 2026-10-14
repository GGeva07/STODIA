import type { Prisma } from '@prisma/client';
import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { estadoCuota, hoyISO, round2, venceISO } from '../cxc';
import { col, etiquetasFiltros, hoy as hoyDMY, paginar, seccionTxt, trozos, type Filtros } from './comun';

/**
 * INFORME 1 · Cuentas por cobrar (inf-cxc). Saldo pendiente = FinCobroItem con paid=false del ciclo (vencidas y por vencer; el abono parcial ya viene
 * descontado en `monto`). Estado/antigüedad derivados con lib/cxc (estadoCuota): «Por vencer» = no vencida; el resto por días vencidos a HOY.
 * La mora (tipo 'mora') se incluye en el saldo y se muestra además en columna aparte. Solo lectura.
 */
const B = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', '+90 días'] as const;
const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/** Cubeta de antigüedad: 0 = por vencer (incluye «pendiente» aún no exigible), 1..4 = días vencidos. */
function cubeta(it: { vence: string; est: string }, hoy: string): number {
  if (estadoCuota(it, hoy) !== 'Vencida') return 0;
  const v = venceISO(it.vence ?? '');
  if (!v) return 1;
  const d = dias(v, hoy);
  return d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
}
const TIPO: Record<string, string> = { col: 'Colegiatura', com: 'Comedor', mat: 'Matrícula', mora: 'Mora', srv: 'Servicio', tra: 'Transporte' };
const nueva = () => ({ b: [0, 0, 0, 0, 0], mora: 0, cargos: 0 });
type Acum = ReturnType<typeof nueva>;
const total = (a: Acum) => round2(a.b.reduce((x, y) => x + y, 0));

const COLS_B = B.map((t, i) => col('b' + i, t, 'moneda'));

export async function informeCxc(f: Filtros): Promise<InformeResp> {
  const hoy = hoyISO(f.tz), cicloId = f.ciclo.id;
  const where: Prisma.FinCobroItemWhereInput = { cicloId, paid: false };
  if (f.tutor) {
    const t = f.tutor;
    const ids = await prisma.tutor.findMany({ where: { OR: [{ id: t }, { nombre: { contains: t } }, { cedula: { contains: t.replace(/\D/g, '') || '\u0000' } }] }, select: { id: true } });
    where.tutorId = { in: ids.map(x => x.id).concat(ids.length ? [] : ['__ninguno__']) };
  }
  if (f.seccion) where.alumno = { is: { matriculas: { some: { cicloId, seccionId: f.seccion } } } };
  else if (f.grado) where.alumno = { is: { matriculas: { some: { cicloId, seccion: { is: { gradoId: f.grado } } } } } };

  const grupos = await prisma.finCobroItem.groupBy({ by: ['alumnoId', 'tutorId', 'vence', 'est', 'tipo'], where, _sum: { monto: true }, _count: { _all: true } });
  const nb = [0, 0, 0, 0, 0];
  const porAl = new Map<string, Acum & { tut: Map<string, number> }>(), porTut = new Map<string, Acum & { alumnos: Set<string> }>(), global = nueva();
  for (const g of grupos) {
    const k = cubeta(g, hoy);
    if (f.soloVencidos && k === 0) continue;
    const m = g._sum.monto ?? 0, n = g._count._all, mora = g.tipo === 'mora' ? m : 0;
    const a = porAl.get(g.alumnoId) ?? { ...nueva(), tut: new Map() };
    a.b[k] += m; a.mora += mora; a.cargos += n; a.tut.set(g.tutorId ?? '', (a.tut.get(g.tutorId ?? '') ?? 0) + m); porAl.set(g.alumnoId, a);
    const t = porTut.get(g.tutorId ?? '') ?? { ...nueva(), alumnos: new Set<string>() };
    t.b[k] += m; t.mora += mora; t.cargos += n; t.alumnos.add(g.alumnoId); porTut.set(g.tutorId ?? '', t);
    global.b[k] += m; global.mora += mora; global.cargos += n; nb[k] += n;
  }
  const totalGlobal = total(global), vencido = round2(global.b.slice(1).reduce((x, y) => x + y, 0));

  // --- Por estudiante (página) ---
  const alOrden = [...porAl.entries()].sort((x, y) => total(y[1]) - total(x[1]) || x[0].localeCompare(y[0]));
  const pa = paginar(f, 'alumnos', alOrden);
  const ids = pa.filas.map(([id]) => id);
  const info = new Map<string, { code: string; nombre: string; seccion: string; tutor: string }>();
  const detalleAl = new Map<string, InformeCelda[][]>();
  const tutNombre = new Map<string, string>();
  const nombreTutor = async (ids2: string[]) => {
    const falta = ids2.filter(i => i && !tutNombre.has(i));
    for (const ch of trozos(falta)) for (const t of await prisma.tutor.findMany({ where: { id: { in: ch } }, select: { id: true, nombre: true } })) tutNombre.set(t.id, t.nombre);
  };
  for (const ch of trozos(ids)) {
    for (const a of await prisma.alumno.findMany({
      where: { id: { in: ch } },
      select: { id: true, code: true, nombres: true, apellidos: true, tutor: { select: { nombre: true } }, seccion: { select: { letra: true, grado: { select: { nombre: true, nivel: { select: { nombre: true } } } } } }, matriculas: { where: { cicloId }, select: { seccion: { select: { letra: true, grado: { select: { nombre: true, nivel: { select: { nombre: true } } } } } } } } },
    })) info.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), seccion: seccionTxt(a.matriculas[0]?.seccion ?? a.seccion), tutor: a.tutor.nombre });
    for (const c of await prisma.finCobroItem.findMany({ where: { ...where, alumnoId: { in: ch } }, orderBy: [{ orden: 'asc' }], select: { alumnoId: true, con: true, tipo: true, vence: true, est: true, monto: true, tutorId: true } })) {
      const k = cubeta(c, hoy);
      if (f.soloVencidos && k === 0) continue;
      const v = venceISO(c.vence ?? ''), d = v && v < hoy ? dias(v, hoy) : 0;
      const l = detalleAl.get(c.alumnoId) ?? [];
      l.push([c.con, TIPO[c.tipo] ?? c.tipo, c.vence, k === 0 ? 'Por vencer' : 'Vencida', d, round2(c.monto)]);
      detalleAl.set(c.alumnoId, l);
    }
  }
  const filasAl = pa.filas.map(([id, a]) => {
    const i = info.get(id);
    return [i?.code ?? id, i?.nombre ?? '(alumno no encontrado)', i?.seccion ?? '', i?.tutor ?? '', a.cargos, ...a.b.map(round2), total(a), round2(a.mora)] as InformeCelda[];
  });
  const COL_DET = [col('con', 'Concepto'), col('tipo', 'Tipo'), col('vence', 'Vence'), col('estado', 'Estado'), col('dias', 'Días vencido', 'entero'), col('monto', 'Monto', 'moneda')];

  // --- Por tutor (página) ---
  const tutOrden = [...porTut.entries()].sort((x, y) => total(y[1]) - total(x[1]) || x[0].localeCompare(y[0]));
  const pt = paginar(f, 'tutores', tutOrden);
  await nombreTutor(pt.filas.map(([id]) => id));
  const cedulas = new Map<string, string>();
  for (const ch of trozos(pt.filas.map(([id]) => id).filter(Boolean))) for (const t of await prisma.tutor.findMany({ where: { id: { in: ch } }, select: { id: true, cedula: true } })) cedulas.set(t.id, t.cedula);
  const detalleTut: InformeCelda[][][] = [];
  const alDeTutores = new Set<string>();
  for (const [, t] of pt.filas) t.alumnos.forEach(a => alDeTutores.add(a));
  const nomAl = new Map<string, { code: string; nombre: string }>();
  for (const ch of trozos([...alDeTutores])) for (const a of await prisma.alumno.findMany({ where: { id: { in: ch } }, select: { id: true, code: true, nombres: true, apellidos: true } })) nomAl.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim() });
  // cargos por (tutor, alumno)
  const porTutAl = new Map<string, Acum>();
  const ptIds = pt.filas.map(([id]) => id);
  if (ptIds.length) for (const g of grupos) {
    if (!g.tutorId || !ptIds.includes(g.tutorId)) continue;
    const k = cubeta(g, hoy);
    if (f.soloVencidos && k === 0) continue;
    const key = g.tutorId + '|' + g.alumnoId, a = porTutAl.get(key) ?? nueva();
    a.b[k] += g._sum.monto ?? 0; a.cargos += g._count._all; if (g.tipo === 'mora') a.mora += g._sum.monto ?? 0; porTutAl.set(key, a);
  }
  const filasTut = pt.filas.map(([id, t]) => {
    const det = [...t.alumnos].map(al => ({ al, a: porTutAl.get(id + '|' + al) })).filter(x => x.a).sort((x, y) => total(y.a!) - total(x.a!))
      .map(({ al, a }) => [nomAl.get(al)?.code ?? al, nomAl.get(al)?.nombre ?? '', a!.cargos, ...a!.b.map(round2), total(a!)] as InformeCelda[]);
    detalleTut.push(det);
    return [tutNombre.get(id) ?? '(sin tutor)', cedulas.get(id) ?? '', t.alumnos.size, t.cargos, ...t.b.map(round2), total(t), round2(t.mora)] as InformeCelda[];
  });

  const sumaCol = (i: number) => round2(global.b[i]);
  const cantTodasAl = alOrden.length, cantTodasTut = tutOrden.length;
  const resp: InformeResp = {
    id: 'cxc', titulo: 'Cuentas por cobrar (CxC)', grupo: 'inf-cxc', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'grado', 'seccion', 'tutor', 'soloVencidos']),
    resumen: [
      { id: 'total', etiqueta: 'Saldo pendiente', valor: totalGlobal, tipo: 'moneda', tono: 'warn' },
      { id: 'vencido', etiqueta: 'De ello vencido', valor: vencido, tipo: 'moneda', tono: 'bad' },
      { id: 'xv', etiqueta: 'Por vencer', valor: sumaCol(0), tipo: 'moneda' },
      { id: 'mora', etiqueta: 'Mora pendiente', valor: round2(global.mora), tipo: 'moneda' },
      { id: 'alumnos', etiqueta: 'Estudiantes con saldo', valor: cantTodasAl, tipo: 'entero' },
      { id: 'tutores', etiqueta: 'Tutores con saldo', valor: cantTodasTut, tipo: 'entero' },
      { id: 'cargos', etiqueta: 'Cargos sin pagar', valor: global.cargos, tipo: 'entero' },
    ],
    tablas: [
      {
        id: 'antiguedad', titulo: 'Saldo por antigüedad', columnas: [col('b', 'Antigüedad'), col('cargos', 'Cargos', 'entero'), col('monto', 'Monto', 'moneda'), col('pct', '% del saldo', 'porcentaje')],
        filas: B.map((t, i) => [t, nb[i], sumaCol(i), totalGlobal ? round2((global.b[i] / totalGlobal) * 100) : 0] as InformeCelda[]),
        totales: ['Total', global.cargos, totalGlobal, totalGlobal ? 100 : 0], total: B.length, page: 1, size: B.length,
      },
      {
        id: 'alumnos', titulo: 'Por estudiante', paginable: true,
        columnas: [col('code', 'Código'), col('alumno', 'Estudiante'), col('seccion', 'Grado / sección'), col('tutor', 'Tutor'), col('cargos', 'Cargos', 'entero'), ...COLS_B, col('total', 'Total', 'moneda'), col('mora', 'De ello mora', 'moneda')],
        filas: filasAl, total: pa.total, page: pa.page, size: pa.size, vacio: 'No hay estudiantes con saldo pendiente con estos filtros.',
        totales: ['', 'TOTAL', '', '', global.cargos, ...global.b.map(round2), totalGlobal, round2(global.mora)],
        detalle: { titulo: 'Cargos pendientes', columnas: COL_DET, porFila: pa.filas.map(([id]) => detalleAl.get(id) ?? []) },
      },
      {
        id: 'tutores', titulo: 'Por tutor', paginable: true,
        columnas: [col('tutor', 'Tutor'), col('cedula', 'Cédula'), col('alumnos', 'Estudiantes', 'entero'), col('cargos', 'Cargos', 'entero'), ...COLS_B, col('total', 'Total', 'moneda'), col('mora', 'De ello mora', 'moneda')],
        filas: filasTut, total: pt.total, page: pt.page, size: pt.size, vacio: 'No hay tutores con saldo pendiente con estos filtros.',
        totales: ['TOTAL', '', cantTodasAl, global.cargos, ...global.b.map(round2), totalGlobal, round2(global.mora)],
        detalle: { titulo: 'Estudiantes del tutor', columnas: [col('code', 'Código'), col('alumno', 'Estudiante'), col('cargos', 'Cargos', 'entero'), ...COLS_B, col('total', 'Total', 'moneda')], porFila: detalleTut },
      },
    ],
    notas: [
      `Saldo pendiente = cargos sin pagar (paid = no) del ciclo ${f.ciclo.nombre}, vencidos y por vencer, al ${hoyDMY(f.tz)}. Los abonos parciales ya vienen descontados del cargo.`,
      'Antigüedad = días transcurridos desde el vencimiento; «Por vencer» incluye lo que vence hoy y lo que vence más adelante. La mora (recargos) está incluida en el saldo y se muestra además en su propia columna.',
      'El saldo de un ciclo cerrado es el pendiente de hoy (sigue siendo cobrable); el «saldo al cierre» de cada ciclo está en Informes de cierre de año.',
    ],
  };
  return resp;
}
