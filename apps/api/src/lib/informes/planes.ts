import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { col, etiquetasFiltros, hoy as hoyDMY, paginar, seccionTxt, trozos, type Filtros } from './comun';

/**
 * INFORME 11 · Planes de pago: facturado vs cobrado por plan (inf-cxc). El plan sale del Contrato(alumno, ciclo).planId (el cargo no guarda plan: si el
 * contrato cambió en el año, todo el historial del alumno se asigna a su plan actual). Definiciones (las mismas del cierre del año, lib/ciclo-cierre.ts):
 *   Facturado  = Σ monto bruto de las líneas de recibos vigentes que cobraron cargos del ciclo + Σ cargos aún sin pagar (pendiente).
 *   Descuentos = Σ descuento de esas líneas (pronto pago, exoneraciones).   Cobrado = Facturado − Descuentos − Pendiente.   % cobranza = Cobrado / (Facturado − Descuentos).
 * Alumnos con cargos sin contrato del ciclo se agrupan en «Sin contrato / sin plan».
 */
const SIN_PLAN = '__sin_plan__';

export async function informePlanes(f: Filtros): Promise<InformeResp> {
  const cicloId = f.ciclo.id;
  const [contratos, pendG, lineas, planes] = await Promise.all([
    prisma.contrato.findMany({ where: { cicloId }, select: { alumnoId: true, planId: true } }),
    prisma.finCobroItem.groupBy({ by: ['alumnoId'], where: { cicloId, paid: false }, _sum: { monto: true } }),
    prisma.finReciboItem.findMany({ where: { recibo: { is: { est: { not: 'Anulado' } } }, cobroItem: { is: { cicloId } } }, select: { monto: true, descuento: true, cobroItem: { select: { alumnoId: true } } } }),
    prisma.finPlan.findMany({ select: { id: true, name: true } }),
  ]);
  const planDe = new Map(contratos.map(c => [c.alumnoId, c.planId]));
  const nombrePlan = new Map(planes.map(p => [p.id, p.name]));
  type A = { pend: number; bruto: number; desc: number };
  const porAl = new Map<string, A>();
  const get = (id: string) => { let a = porAl.get(id); if (!a) { a = { pend: 0, bruto: 0, desc: 0 }; porAl.set(id, a); } return a; };
  for (const p of pendG) get(p.alumnoId).pend += p._sum.monto ?? 0;
  for (const l of lineas) if (l.cobroItem) { const a = get(l.cobroItem.alumnoId); a.bruto += l.monto; a.desc += l.descuento ?? 0; }
  // Alumnos del plan filtrado: todos los contratos del plan (aunque no tengan cargos) cuentan como alumnos.
  const planAl = (id: string) => planDe.get(id) ?? SIN_PLAN;
  const conPlan = (id: string) => !f.plan || planAl(id) === f.plan;

  type P = { alumnos: number; conCargos: number; fact: number; desc: number; pend: number };
  const porPlan = new Map<string, P>();
  const gp = (id: string) => { let p = porPlan.get(id); if (!p) { p = { alumnos: 0, conCargos: 0, fact: 0, desc: 0, pend: 0 }; porPlan.set(id, p); } return p; };
  for (const c of contratos) if (conPlan(c.alumnoId)) gp(c.planId).alumnos++;
  for (const [al, a] of porAl) {
    if (!conPlan(al)) continue;
    const p = gp(planAl(al));
    if (!planDe.has(al)) p.alumnos++;
    p.conCargos++; p.fact += a.bruto + a.pend; p.desc += a.desc; p.pend += a.pend;
  }
  const filaPlan = (id: string, p: P) => {
    const neto = p.fact - p.desc, cobrado = neto - p.pend;
    return [id === SIN_PLAN ? 'Sin contrato / sin plan' : nombrePlan.get(id) ?? id, p.alumnos, round2(p.fact), round2(p.desc), round2(cobrado), round2(p.pend), neto > 0 ? round2((cobrado / neto) * 100) : 0] as InformeCelda[];
  };
  const orden = [...porPlan.entries()].sort((a, b) => b[1].fact - a[1].fact);
  const T = orden.reduce((t, [, p]) => ({ alumnos: t.alumnos + p.alumnos, fact: t.fact + p.fact, desc: t.desc + p.desc, pend: t.pend + p.pend }), { alumnos: 0, fact: 0, desc: 0, pend: 0 });
  const totNeto = T.fact - T.desc, totCob = totNeto - T.pend;

  // Detalle por alumno (con cargos del plan filtrado), página
  const alOrden = [...porAl.entries()].filter(([id]) => conPlan(id)).sort((a, b) => (b[1].pend - a[1].pend) || ((b[1].bruto + b[1].pend) - (a[1].bruto + a[1].pend)) || a[0].localeCompare(b[0]));
  const pa = paginar(f, 'alumnos', alOrden);
  const info = new Map<string, { code: string; nombre: string; seccion: string }>();
  for (const ch of trozos(pa.filas.map(([id]) => id))) {
    for (const a of await prisma.alumno.findMany({
      where: { id: { in: ch } },
      select: { id: true, code: true, nombres: true, apellidos: true, seccion: { select: { letra: true, grado: { select: { nombre: true, nivel: { select: { nombre: true } } } } } }, matriculas: { where: { cicloId }, select: { seccion: { select: { letra: true, grado: { select: { nombre: true, nivel: { select: { nombre: true } } } } } } } } },
    })) info.set(a.id, { code: a.code, nombre: `${a.nombres} ${a.apellidos}`.trim(), seccion: seccionTxt(a.matriculas[0]?.seccion ?? a.seccion) });
  }
  const filasAl = pa.filas.map(([id, a]) => {
    const fact = a.bruto + a.pend, neto = fact - a.desc, cob = neto - a.pend, i = info.get(id);
    const pid = planAl(id);
    return [i?.code ?? id, i?.nombre ?? '', i?.seccion ?? '', pid === SIN_PLAN ? 'Sin contrato' : nombrePlan.get(pid) ?? pid, round2(fact), round2(a.desc), round2(cob), round2(a.pend), neto > 0 ? round2((cob / neto) * 100) : 0] as InformeCelda[];
  });
  const pct = (c: number, n: number) => (n > 0 ? round2((c / n) * 100) : 0);
  return {
    id: 'planes', titulo: 'Planes de pago: facturado vs cobrado', grupo: 'inf-cxc', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'plan']),
    resumen: [
      { id: 'planes', etiqueta: 'Planes con alumnos', valor: orden.filter(([id]) => id !== SIN_PLAN).length, tipo: 'entero' },
      { id: 'alumnos', etiqueta: 'Alumnos', valor: T.alumnos, tipo: 'entero' },
      { id: 'fact', etiqueta: 'Facturado', valor: round2(T.fact), tipo: 'moneda' },
      { id: 'cob', etiqueta: 'Cobrado', valor: round2(totCob), tipo: 'moneda', tono: 'ok' },
      { id: 'pend', etiqueta: 'Pendiente', valor: round2(T.pend), tipo: 'moneda', tono: 'warn' },
      { id: 'pct', etiqueta: '% de cobranza', valor: pct(totCob, totNeto), tipo: 'porcentaje' },
    ],
    tablas: [
      {
        id: 'planes', titulo: 'Por plan de pago', columnas: [col('plan', 'Plan'), col('alumnos', 'Alumnos', 'entero'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cob', 'Cobrado', 'moneda'), col('pend', 'Pendiente', 'moneda'), col('pct', '% cobranza', 'porcentaje')],
        filas: orden.map(([id, p]) => filaPlan(id, p)), totales: ['TOTAL', T.alumnos, round2(T.fact), round2(T.desc), round2(totCob), round2(T.pend), pct(totCob, totNeto)],
        total: orden.length, page: 1, size: orden.length, vacio: 'No hay contratos ni cargos en el ciclo.',
      },
      {
        id: 'alumnos', titulo: 'Detalle por alumno', paginable: true,
        columnas: [col('code', 'Código'), col('alumno', 'Alumno'), col('seccion', 'Grado / sección'), col('plan', 'Plan'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cob', 'Cobrado', 'moneda'), col('pend', 'Pendiente', 'moneda'), col('pct', '% cobranza', 'porcentaje')],
        filas: filasAl, total: pa.total, page: pa.page, size: pa.size, vacio: 'No hay alumnos con cargos en el ciclo con estos filtros.',
        totales: ['', 'TOTAL', '', '', round2(alOrden.reduce((s, [, a]) => s + a.bruto + a.pend, 0)), round2(alOrden.reduce((s, [, a]) => s + a.desc, 0)), round2(alOrden.reduce((s, [, a]) => s + a.bruto - a.desc, 0)), round2(alOrden.reduce((s, [, a]) => s + a.pend, 0)), null],
      },
    ],
    notas: [
      'El plan de cada alumno es el de su contrato del ciclo (Contrato.planId). El cargo no guarda el plan: si un alumno cambió de plan durante el año, todo su historial figura en el plan actual.',
      'Facturado = lo cobrado (monto bruto de las líneas de recibos vigentes) + lo pendiente de los cargos del ciclo, incluyendo mora y servicios. Cobrado = facturado − descuentos − pendiente. Un abono parcial ya viene descontado en el cargo pendiente.',
      'Los cobros de cargos de este ciclo hechos desde otro ciclo (deuda anterior) cuentan aquí, porque se asocian al cargo y no al recibo.',
    ],
  };
}
