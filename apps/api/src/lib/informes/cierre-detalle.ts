import type { Prisma } from '@prisma/client';
import type { CierreCuadre, CierreDeudaAlumno, CierreDetalleAgregado, CierreInforme, CierreTablaId, InformeCelda, InformeColumna, InformeTabla } from '@stodia/shared';
import { prisma } from '../../db';
import { CicloError } from '../ciclo';
import { resumenCierre } from '../ciclo-cierre';
import { hoyISO, round2 } from '../cxc';
import { col, dmyDeISO, etiquetaMes, fechaDMY, mesDe } from './comun';
import type { Hoja } from './xlsx';

/**
 * ETAPA 2 de Informes › Cierre de año (docs/informes-analisis.md §9): desgloses y listados del DETALLE guardado al cerrar (CierreCicloDetalle, ver
 * lib/ciclo-cierre-detalle.ts). Todo es lectura sobre la foto del cierre (no se recalcula nada del ciclo vivo). Los desgloses se agregan en la base de datos
 * (groupBy) salvo los que dependen del JSON `extra` (pagos de recibos mixtos, reembolsos de notas), que son pocas filas. Un cierre anterior a esta función
 * no tiene filas: responde `detalleDisponible:false` y el aviso (sin backfill: decisión del usuario).
 */
export const AVISO_SIN_DETALLE = 'Sin detalle (cierre anterior a esta función): este cierre solo conserva sus totales y la deuda por alumno al cerrar.';

const ETQ_CAT: Record<string, string> = {
  colegiatura: 'Colegiatura', inscripcion: 'Inscripción', reinscripcion: 'Reinscripción', materiales: 'Materiales', servicio: 'Servicios (comedor, transporte, actividades)',
  articulo: 'Artículos (kiosko / uniformes)', mora: 'Recargos por mora', otro: 'Otros', varios: 'Varios conceptos', credito: 'Nota de crédito', debito: 'Nota de débito',
};
const etqCat = (c: string) => ETQ_CAT[c] ?? c;
const ORDEN_CAT = Object.keys(ETQ_CAT);
const RANGOS = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', '+90 días', 'Vencido (sin fecha)'] as const;

const TIPO_DB: Record<Exclude<CierreTablaId, 'deudores'>, string> = { cargos: 'cargo', recibos: 'recibo', notas: 'nota', descuentos: 'descuento', ventas: 'venta' };
export const TABLAS_CIERRE: CierreTablaId[] = ['cargos', 'recibos', 'notas', 'descuentos', 'ventas', 'deudores'];

function json<T = Record<string, unknown>>(s: string | null | undefined): T { try { return (s ? JSON.parse(s) : {}) as T; } catch { return {} as T; } }
const dmyDate = (d: Date | null) => (d ? dmyDeISO(d.toISOString().slice(0, 10)) : '');

function tabla(id: string, titulo: string, columnas: InformeColumna[], filas: InformeCelda[][], totales?: InformeCelda[], vacio = 'Sin datos.'): InformeTabla {
  return { id, titulo, columnas, filas, totales, total: filas.length, page: 1, size: filas.length, vacio };
}
const sumaCol = (filas: InformeCelda[][], i: number) => round2(filas.reduce((a, f) => a + (typeof f[i] === 'number' ? (f[i] as number) : 0), 0));

async function cierreDe(nombre: string) {
  const c = await prisma.ciclo.findUnique({ where: { nombre }, select: { id: true, estado: true } });
  if (!c) throw new CicloError(`El ciclo lectivo «${nombre}» no existe`, 404);
  if (c.estado !== 'Cerrado') throw new CicloError(`El ciclo ${nombre} no está cerrado`, 409);
  const cierre = await prisma.cierreCiclo.findUnique({ where: { cicloId: c.id }, select: { id: true, fecha: true, deudaAlumnos: true } });
  return { ciclo: c, cierre };
}

async function conteos(cierreId: number) {
  const g = await prisma.cierreCicloDetalle.groupBy({ by: ['tipo'], where: { cierreId }, _count: { _all: true } });
  return Object.fromEntries(g.map(x => [x.tipo, x._count._all])) as Record<string, number>;
}

// ===================================================================================================================
// RESUMEN + DESGLOSES
// ===================================================================================================================
export async function informeCierreDetalle(nombre: string, tz: string): Promise<CierreInforme> {
  const { cierre } = await cierreDe(nombre);
  const r = await resumenCierre(nombre, 1_000_000);
  if (!cierre) return { ...r, detalleDisponible: false, aviso: AVISO_SIN_DETALLE };
  const filas = await conteos(cierre.id);
  if (!Object.values(filas).some(n => n > 0)) return { ...r, detalleDisponible: false, aviso: AVISO_SIN_DETALLE };

  const cierreId = cierre.id, hoy = hoyISO(tz, cierre.fecha);
  const [cargos, recibos, notas, desc, ventas] = await Promise.all([
    prisma.cierreCicloDetalle.groupBy({ by: ['fecha', 'categoria', 'estado'], where: { cierreId, tipo: 'cargo' }, _sum: { monto: true, descuento: true, pendiente: true }, _count: { _all: true } }),
    prisma.cierreCicloDetalle.findMany({ where: { cierreId, tipo: 'recibo' }, select: { fecha: true, monto: true, descuento: true, metodo: true, estado: true, extra: true } }),
    prisma.cierreCicloDetalle.findMany({ where: { cierreId, tipo: 'nota' }, select: { fecha: true, monto: true, estado: true, categoria: true, concepto: true, metodo: true, extra: true } }),
    prisma.cierreCicloDetalle.groupBy({ by: ['concepto', 'categoria'], where: { cierreId, tipo: 'descuento' }, _sum: { monto: true }, _count: { _all: true } }),
    prisma.cierreCicloDetalle.groupBy({ by: ['metodo'], where: { cierreId, tipo: 'venta' }, _sum: { monto: true }, _count: { _all: true } }),
  ]);
  const D: Record<string, InformeTabla> = {};

  // ---- Cargos: por categoría, por mes de vencimiento, antigüedad del pendiente ----
  type Ag = { n: number; monto: number; desc: number; pend: number; venc: number };
  const nuevo = (): Ag => ({ n: 0, monto: 0, desc: 0, pend: 0, venc: 0 });
  const sumar = (a: Ag, g: (typeof cargos)[number]) => { a.n += g._count._all; a.monto += g._sum.monto ?? 0; a.desc += g._sum.descuento ?? 0; a.pend += g._sum.pendiente ?? 0; if (g.estado === 'Vencido') a.venc += g._sum.pendiente ?? 0; };
  const porCat = new Map<string, Ag>(), porMes = new Map<string, Ag>(), moraMes = new Map<string, Ag>(), aging = new Map<string, Ag>();
  for (const g of cargos) {
    const cat = porCat.get(g.categoria) ?? nuevo(); sumar(cat, g); porCat.set(g.categoria, cat);
    const ym = g.fecha ? g.fecha.toISOString().slice(0, 7) : 'sin-fecha';
    const mes = porMes.get(ym) ?? nuevo(); sumar(mes, g); porMes.set(ym, mes);
    if (g.categoria === 'mora') { const m = moraMes.get(ym) ?? nuevo(); sumar(m, g); moraMes.set(ym, m); }
    if ((g._sum.pendiente ?? 0) > 0) {
      let rango: (typeof RANGOS)[number];
      if (g.estado !== 'Vencido') rango = 'Por vencer';
      else if (!g.fecha) rango = 'Vencido (sin fecha)';
      else { const d = Math.round((Date.parse(hoy) - g.fecha.getTime()) / 86_400_000); rango = d <= 30 ? '1–30 días' : d <= 60 ? '31–60 días' : d <= 90 ? '61–90 días' : '+90 días'; }
      const a = aging.get(rango) ?? nuevo(); sumar(a, { ...g, _sum: { ...g._sum, monto: 0, descuento: 0 } }); aging.set(rango, a);
    }
  }
  const tot = (m: Map<string, Ag>) => [...m.values()].reduce((a, x) => ({ n: a.n + x.n, monto: a.monto + x.monto, desc: a.desc + x.desc, pend: a.pend + x.pend, venc: a.venc + x.venc }), nuevo());
  const cobN = (a: Ag) => round2(a.monto - a.desc - a.pend); // cobrado de cargos, neto de descuento
  const pct = (x: number, t: number) => (t ? round2((x / t) * 100) : 0);

  const catOrd = [...porCat.entries()].sort((a, b) => (ORDEN_CAT.indexOf(a[0]) + 100) % 100 - (ORDEN_CAT.indexOf(b[0]) + 100) % 100);
  const tc = tot(porCat);
  D.facturadoCategoria = tabla('facturadoCategoria', 'Facturado por categoría', [col('cat', 'Categoría'), col('n', 'Cargos', 'entero'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cob', 'Cobrado (neto de descuento)', 'moneda'), col('pend', 'Pendiente', 'moneda'), col('pct', '% del facturado', 'porcentaje')],
    catOrd.map(([k, a]) => [etqCat(k), a.n, round2(a.monto), round2(a.desc), cobN(a), round2(a.pend), pct(a.monto, tc.monto)]), ['TOTAL', tc.n, round2(tc.monto), round2(tc.desc), cobN(tc), round2(tc.pend), tc.monto ? 100 : 0]);
  const mesesOrd = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const etqMes = (ym: string) => (ym === 'sin-fecha' ? 'Sin fecha de vencimiento' : etiquetaMes(ym));
  D.facturadoMes = tabla('facturadoMes', 'Facturado por mes de vencimiento', [col('mes', 'Mes'), col('n', 'Cargos', 'entero'), col('fact', 'Facturado', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('cob', 'Cobrado (neto de descuento)', 'moneda'), col('pend', 'Pendiente', 'moneda')],
    mesesOrd.map(([k, a]) => [etqMes(k), a.n, round2(a.monto), round2(a.desc), cobN(a), round2(a.pend)]), ['TOTAL', tc.n, round2(tc.monto), round2(tc.desc), cobN(tc), round2(tc.pend)]);

  // ---- Pendiente: antigüedad (a la fecha del cierre) y por categoría ----
  const ta = tot(aging);
  const agOrd = RANGOS.filter(k => aging.has(k)).map(k => [k, aging.get(k)!] as const);
  D.pendienteAntiguedad = tabla('pendienteAntiguedad', `Pendiente por antigüedad (al ${fechaDMY(cierre.fecha, tz)})`, [col('r', 'Antigüedad'), col('n', 'Cargos', 'entero'), col('pend', 'Pendiente', 'moneda'), col('pct', '% del pendiente', 'porcentaje')],
    agOrd.map(([k, a]) => [k, a.n, round2(a.pend), pct(a.pend, ta.pend)]), ['TOTAL', ta.n, round2(ta.pend), ta.pend ? 100 : 0], 'No había cartera pendiente al cerrar.');
  const venOrd = agOrd.filter(([k]) => k !== 'Por vencer'), tv = tot(new Map(venOrd));
  D.vencidoAntiguedad = tabla('vencidoAntiguedad', 'Vencido por antigüedad (días de atraso al cerrar)', [col('r', 'Antigüedad'), col('n', 'Cargos', 'entero'), col('pend', 'Vencido', 'moneda'), col('pct', '% del vencido', 'porcentaje')],
    venOrd.map(([k, a]) => [k, a.n, round2(a.pend), pct(a.pend, tv.pend)]), ['TOTAL', tv.n, round2(tv.pend), tv.pend ? 100 : 0], 'No había cartera vencida al cerrar.');
  const pendCat = catOrd.filter(([, a]) => a.pend > 0);
  D.pendienteCategoria = tabla('pendienteCategoria', 'Pendiente por categoría', [col('cat', 'Categoría'), col('n', 'Cargos', 'entero'), col('pend', 'Pendiente', 'moneda'), col('venc', 'De ello vencido', 'moneda'), col('pct', '% del pendiente', 'porcentaje')],
    pendCat.map(([k, a]) => [etqCat(k), 0, round2(a.pend), round2(a.venc), pct(a.pend, tc.pend)]), ['TOTAL', 0, round2(tc.pend), round2(tc.venc), tc.pend ? 100 : 0], 'No había cartera pendiente al cerrar.');
  // nº de cargos sin pagar por categoría (el groupBy de arriba cuenta todos los cargos): segunda pasada solo con los pendientes
  const cntPend = new Map<string, number>();
  for (const g of cargos) if ((g._sum.pendiente ?? 0) > 0) cntPend.set(g.categoria, (cntPend.get(g.categoria) ?? 0) + g._count._all);
  D.pendienteCategoria.filas.forEach((f, i) => { f[1] = cntPend.get(pendCat[i][0]) ?? 0; });
  D.pendienteCategoria.totales![1] = [...cntPend.values()].reduce((a, x) => a + x, 0);

  // ---- Mora ----
  const mora = porCat.get('mora') ?? nuevo();
  const moraOrd = [...moraMes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  D.moraMes = tabla('moraMes', 'Recargos por mora por mes de vencimiento', [col('mes', 'Mes'), col('n', 'Recargos', 'entero'), col('mora', 'Mora generada', 'moneda'), col('cob', 'Cobrada', 'moneda'), col('pend', 'Pendiente', 'moneda')],
    moraOrd.map(([k, a]) => [etqMes(k), a.n, round2(a.monto), round2(a.monto - a.pend), round2(a.pend)]), ['TOTAL', mora.n, round2(mora.monto), round2(mora.monto - mora.pend), round2(mora.pend)], 'No se generaron recargos por mora en el ciclo.');

  // ---- Recibos: cobrado por método y por mes ----
  const vig = recibos.filter(x => x.estado === 'Emitido');
  const porMetodo = new Map<string, { n: number; monto: number }>();
  const addM = (m: string, monto: number, n = 0) => { const a = porMetodo.get(m) ?? { n: 0, monto: 0 }; a.n += n; a.monto += monto; porMetodo.set(m, a); };
  for (const x of vig) {
    const e = json<{ pagos?: { metodo: string; monto: number }[] }>(x.extra);
    if (e.pagos?.length) { addM(e.pagos[0].metodo, 0, 1); for (const p of e.pagos) addM(p.metodo, p.monto); const dif = round2(x.monto - e.pagos.reduce((a, p) => a + p.monto, 0)); if (Math.abs(dif) > 0.004) addM(e.pagos[0].metodo, dif); }
    else addM(x.metodo ?? 'Sin método registrado', x.monto, 1);
  }
  const totCobrado = round2(vig.reduce((a, x) => a + x.monto, 0));
  D.cobradoMetodo = tabla('cobradoMetodo', 'Cobrado por método de pago', [col('m', 'Método de pago'), col('n', 'Recibos', 'entero'), col('monto', 'Monto', 'moneda'), col('pct', '% del cobrado', 'porcentaje')],
    [...porMetodo.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([k, a]) => [k, a.n, round2(a.monto), pct(a.monto, totCobrado)]), ['TOTAL', vig.length, totCobrado, totCobrado ? 100 : 0], 'No hay recibos vigentes.');
  const cobMes = new Map<string, { n: number; monto: number; desc: number }>();
  for (const x of vig) { const ym = x.fecha ? mesDe(x.fecha, tz) : 'sin-fecha'; const a = cobMes.get(ym) ?? { n: 0, monto: 0, desc: 0 }; a.n++; a.monto += x.monto; a.desc += x.descuento; cobMes.set(ym, a); }
  D.cobradoMes = tabla('cobradoMes', 'Cobrado por mes (fecha del recibo)', [col('mes', 'Mes'), col('n', 'Recibos', 'entero'), col('monto', 'Cobrado', 'moneda'), col('desc', 'Descuentos otorgados', 'moneda'), col('pct', '% del cobrado', 'porcentaje')],
    [...cobMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => [etqMes(k), a.n, round2(a.monto), round2(a.desc), pct(a.monto, totCobrado)]),
    ['TOTAL', vig.length, totCobrado, round2(vig.reduce((a, x) => a + x.descuento, 0)), totCobrado ? 100 : 0], 'No hay recibos vigentes.');
  const anul = recibos.filter(x => x.estado === 'Anulado');
  D.recibosEstado = tabla('recibosEstado', 'Recibos vigentes y anulados', [col('e', 'Estado'), col('n', 'Recibos', 'entero'), col('monto', 'Monto', 'moneda')],
    [['Vigentes (suman al cobrado)', vig.length, totCobrado], ['Anulados (no suman)', anul.length, round2(anul.reduce((a, x) => a + x.monto, 0))]]);

  // ---- Notas: resumen por clase y motivo; devoluciones por método; cobrado neto por método ----
  type NotaX = { clase?: string; motivo?: string; reembolsos?: { metodo: string; monto: number }[]; enCiclo?: boolean; sobreReciboVigente?: boolean };
  const nx = notas.map(n => ({ n, e: json<NotaX>(n.extra) }));
  const porMotivo = new Map<string, { clase: string; motivo: string; n: number; monto: number }>();
  for (const { n, e } of nx) {
    if (!e.enCiclo || n.estado !== 'Emitido') continue;
    const k = `${n.categoria}|${e.motivo ?? n.concepto}`, a = porMotivo.get(k) ?? { clase: n.categoria, motivo: e.motivo ?? n.concepto, n: 0, monto: 0 };
    a.n++; a.monto += n.monto; porMotivo.set(k, a);
  }
  const notasFilas = [...porMotivo.values()].sort((a, b) => a.clase.localeCompare(b.clase) || b.monto - a.monto);
  D.notasMotivo = tabla('notasMotivo', 'Notas emitidas por tipo y motivo', [col('clase', 'Tipo'), col('motivo', 'Motivo'), col('n', 'Notas', 'entero'), col('monto', 'Monto', 'moneda')],
    notasFilas.map(a => [etqCat(a.clase), a.motivo, a.n, round2(a.monto)]), ['TOTAL', '', notasFilas.reduce((a, x) => a + x.n, 0), round2(notasFilas.reduce((a, x) => a + x.monto, 0))], 'No se emitieron notas de crédito ni de débito en el ciclo.');
  const dev = new Map<string, { n: number; monto: number }>();
  let totDev = 0;
  for (const { n, e } of nx) {
    if (n.categoria !== 'credito' || !e.sobreReciboVigente) continue;
    totDev += n.monto;
    for (const rb of e.reembolsos ?? []) { const a = dev.get(rb.metodo) ?? { n: 0, monto: 0 }; a.n++; a.monto += rb.monto; dev.set(rb.metodo, a); }
  }
  totDev = round2(totDev);
  D.devolucionesMetodo = tabla('devolucionesMetodo', 'Devoluciones (notas de crédito sobre recibos vigentes) por método', [col('m', 'Método de reembolso'), col('n', 'Reembolsos', 'entero'), col('monto', 'Monto', 'moneda')],
    [...dev.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([k, a]) => [k, a.n, round2(a.monto)]), ['TOTAL', [...dev.values()].reduce((a, x) => a + x.n, 0), round2([...dev.values()].reduce((a, x) => a + x.monto, 0))], 'No hubo devoluciones sobre recibos vigentes del ciclo.');
  const metodosNeto = new Set([...porMetodo.keys(), ...dev.keys()]);
  D.netoMetodo = tabla('netoMetodo', 'Cobrado neto por método de pago', [col('m', 'Método de pago'), col('cob', 'Cobrado', 'moneda'), col('dev', 'Devuelto', 'moneda'), col('neto', 'Cobrado neto', 'moneda')],
    [...metodosNeto].map(m => [m, round2(porMetodo.get(m)?.monto ?? 0), round2(dev.get(m)?.monto ?? 0), round2((porMetodo.get(m)?.monto ?? 0) - (dev.get(m)?.monto ?? 0))] as InformeCelda[]).sort((a, b) => (b[3] as number) - (a[3] as number)),
    ['TOTAL', totCobrado, round2([...dev.values()].reduce((a, x) => a + x.monto, 0)), round2(totCobrado - [...dev.values()].reduce((a, x) => a + x.monto, 0))], 'Sin cobros.');

  // ---- Descuentos ----
  const porMot = new Map<string, { n: number; monto: number }>(), porDcat = new Map<string, { n: number; monto: number }>();
  for (const g of desc) {
    const a = porMot.get(g.concepto) ?? { n: 0, monto: 0 }; a.n += g._count._all; a.monto += g._sum.monto ?? 0; porMot.set(g.concepto, a);
    const b = porDcat.get(g.categoria) ?? { n: 0, monto: 0 }; b.n += g._count._all; b.monto += g._sum.monto ?? 0; porDcat.set(g.categoria, b);
  }
  const totD = round2([...porMot.values()].reduce((a, x) => a + x.monto, 0)), nD = [...porMot.values()].reduce((a, x) => a + x.n, 0);
  D.descuentosMotivo = tabla('descuentosMotivo', 'Descuentos por motivo', [col('m', 'Motivo'), col('n', 'Líneas', 'entero'), col('monto', 'Monto', 'moneda'), col('pct', '% del total', 'porcentaje')],
    [...porMot.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([k, a]) => [k, a.n, round2(a.monto), pct(a.monto, totD)]), ['TOTAL', nD, totD, totD ? 100 : 0], 'No se aplicaron descuentos en el ciclo.');
  D.descuentosCategoria = tabla('descuentosCategoria', 'Descuentos por tipo de cargo', [col('c', 'Categoría'), col('n', 'Líneas', 'entero'), col('monto', 'Monto', 'moneda'), col('pct', '% del total', 'porcentaje')],
    [...porDcat.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([k, a]) => [etqCat(k), a.n, round2(a.monto), pct(a.monto, totD)]), ['TOTAL', nD, totD, totD ? 100 : 0], 'No se aplicaron descuentos en el ciclo.');

  // ---- Ventas rápidas ----
  const tvta = round2(ventas.reduce((a, x) => a + (x._sum.monto ?? 0), 0)), nvta = ventas.reduce((a, x) => a + x._count._all, 0);
  D.ventasMetodo = tabla('ventasMetodo', 'Ventas rápidas (kiosko) por método', [col('m', 'Método de pago'), col('n', 'Ventas', 'entero'), col('monto', 'Monto', 'moneda')],
    ventas.sort((a, b) => (b._sum.monto ?? 0) - (a._sum.monto ?? 0)).map(x => [x.metodo ?? '—', x._count._all, round2(x._sum.monto ?? 0)]), ['TOTAL', nvta, tvta], 'No hubo ventas rápidas en las fechas del ciclo.');

  // ---- Cantidades ----
  D.cantidades = tabla('cantidades', 'Cantidades del ciclo', [col('c', 'Concepto'), col('n', 'Cantidad', 'entero')],
    [['Recibos vigentes', r.recibos], ['Recibos anulados', r.recibosAnulados], ['Cargos del ciclo', r.cargos], ['Cargos sin pagar', r.cargosPendientes], ['Alumnos con deuda al cerrar', r.alumnosConDeuda], ['Matrículas en el ciclo', r.matriculas]]);

  // ---- Cuadre (cifra guardada en CierreCiclo vs suma de las filas del detalle) ----
  const cu = (id: string, etiqueta: string, cifra: number, detalle: number): CierreCuadre => { const d = round2(detalle - cifra); return { id, etiqueta, cifra: round2(cifra), detalle: round2(detalle), diferencia: d, ok: Math.abs(d) < 0.01 }; };
  const sumNotas = (clase: string) => nx.filter(({ n, e }) => n.categoria === clase && e.enCiclo && n.estado === 'Emitido').reduce((a, { n }) => a + n.monto, 0);
  const cuadre: Record<string, CierreCuadre> = {
    facturado: cu('facturado', 'Facturado', r.facturado, tc.monto), cobrado: cu('cobrado', 'Cobrado', r.cobrado, totCobrado),
    nc: cu('nc', 'Notas de crédito', r.notasCredito, sumNotas('credito')), nd: cu('nd', 'Notas de débito', r.notasDebito, sumNotas('debito')),
    neto: cu('neto', 'Cobrado neto', r.cobradoNeto, totCobrado - totDev), desc: cu('desc', 'Descuentos', r.descuentos, totD),
    pend: cu('pend', 'Pendiente', r.pendiente, tc.pend), venc: cu('venc', 'Vencido', r.vencido, tc.venc),
    mora: cu('mora', 'Mora', r.mora, mora.monto), morap: cu('morap', 'Mora pendiente', r.moraPendiente, mora.pend),
    recibos: cu('recibos', 'Recibos vigentes', r.recibos, vig.length), anulados: cu('anulados', 'Recibos anulados', r.recibosAnulados, anul.length),
    cargos: cu('cargos', 'Cargos', r.cargos, tc.n), deudores: cu('deudores', 'Alumnos con deuda', r.alumnosConDeuda, r.deudaAlumnos.length),
  };
  const agregado: CierreDetalleAgregado = {
    filas, desgloses: D, cuadre, fechaCierre: fechaDMY(cierre.fecha, tz),
    notas: [
      'Esta es la foto línea por línea del ciclo al momento de cerrar (tabla CierreCicloDetalle): no cambia aunque después se cobre la deuda o se edite un alumno, tutor o cargo.',
      `Vencido y antigüedad se calculan a la fecha del cierre (${fechaDMY(cierre.fecha, tz)}). Un cargo cuenta como «por vencer» si vence ese día o después.`,
      'Cada cargo muestra lo facturado = lo cobrado (bruto, antes del descuento) por recibos vigentes + lo que seguía pendiente. Cobrado (neto de descuento) = facturado − descuentos − pendiente.',
      'Las ventas rápidas (kiosko) no pertenecen a un ciclo: se guardan las de las fechas del ciclo y NO forman parte de ninguna cifra del cierre.',
      'Las notas de crédito/débito se cuentan por el ciclo de la nota; el cobrado neto resta las notas de crédito sobre recibos vigentes del ciclo (la misma regla del cierre).',
    ],
  };
  return { ...r, detalleDisponible: true, detalle: agregado };
}

// ===================================================================================================================
// LISTADOS PAGINADOS
// ===================================================================================================================
export interface ParamsTabla { tabla: CierreTablaId; page: number; size: number; q?: string; alumno?: string; categoria?: string; estado?: string; metodo?: string; orden?: 'fecha' | 'monto' }

const COLS: Record<CierreTablaId, InformeColumna[]> = {
  cargos: [col('f', 'Vence', 'fecha'), col('cod', 'Código'), col('al', 'Alumno'), col('tut', 'Tutor'), col('con', 'Concepto'), col('cat', 'Categoría'), col('mon', 'Facturado', 'moneda'), col('des', 'Descuento', 'moneda'), col('pen', 'Pendiente', 'moneda'), col('est', 'Estado'), col('ncf', 'NCF cobro')],
  recibos: [col('f', 'Fecha', 'fecha'), col('rec', 'Recibo'), col('ncf', 'NCF'), col('al', 'Alumno(s)'), col('tut', 'Tutor'), col('con', 'Concepto'), col('met', 'Método'), col('mon', 'Monto', 'moneda'), col('des', 'Descuento', 'moneda'), col('caj', 'Cajero'), col('est', 'Estado')],
  notas: [col('f', 'Fecha', 'fecha'), col('ncf', 'NCF'), col('tipo', 'Tipo'), col('mod', 'Documento afectado'), col('al', 'Alumno'), col('tut', 'Cliente / tutor'), col('mot', 'Motivo'), col('met', 'Reembolso'), col('mon', 'Monto', 'moneda'), col('reab', 'Reabre cobro'), col('caj', 'Cajero'), col('est', 'Estado')],
  descuentos: [col('f', 'Fecha', 'fecha'), col('rec', 'Recibo'), col('ncf', 'NCF'), col('cod', 'Código'), col('al', 'Alumno'), col('con', 'Concepto'), col('cat', 'Categoría'), col('mot', 'Motivo'), col('pct', '% del cargo', 'porcentaje'), col('mon', 'Descuento', 'moneda')],
  ventas: [col('f', 'Fecha', 'fecha'), col('id', 'Venta'), col('ncf', 'NCF'), col('con', 'Artículos'), col('met', 'Método'), col('caj', 'Cajero'), col('mon', 'Total', 'moneda')],
  deudores: [col('cod', 'Código'), col('al', 'Alumno'), col('sec', 'Grado / sección'), col('car', 'Cargos', 'entero'), col('pen', 'Pendiente', 'moneda'), col('ven', 'Vencido', 'moneda')],
};
const TITULO: Record<CierreTablaId, string> = { cargos: 'Detalle de facturados (cargos del ciclo)', recibos: 'Detalle de cobrados (recibos del ciclo)', notas: 'Detalle de notas de crédito y débito', descuentos: 'Detalle de descuentos', ventas: 'Detalle de ventas rápidas (kiosko)', deudores: 'Alumnos con deuda al cierre' };
const VACIO: Record<CierreTablaId, string> = { cargos: 'No hay cargos con estos filtros.', recibos: 'No hay recibos con estos filtros.', notas: 'No hay notas con estos filtros.', descuentos: 'No hay descuentos con estos filtros.', ventas: 'No hay ventas con estos filtros.', deudores: 'Ningún alumno tiene deuda con estos filtros.' };

export function validarTabla(t: unknown): CierreTablaId {
  if (typeof t === 'string' && (TABLAS_CIERRE as string[]).includes(t)) return t as CierreTablaId;
  throw new CicloError(`Tabla no válida. Usa una de: ${TABLAS_CIERRE.join(', ')}`, 400);
}

function filaDe(t: CierreTablaId, x: { fecha: Date | null; refId: string; alumnoCodigo: string; alumnoNombre: string; tutorNombre: string; concepto: string; categoria: string; metodo: string | null; ncf: string | null; cajero: string | null; monto: number; descuento: number; pendiente: number; estado: string; extra: string | null }, tz: string): InformeCelda[] {
  const e = json<Record<string, unknown>>(x.extra);
  switch (t) {
    case 'cargos': return [dmyDate(x.fecha), x.alumnoCodigo, x.alumnoNombre, x.tutorNombre, x.concepto, etqCat(x.categoria), x.monto, x.descuento, x.pendiente, x.estado, x.ncf];
    case 'recibos': {
      const pagos = (e.pagos as { metodo: string; monto: number }[] | undefined) ?? [];
      return [x.fecha ? `${fechaDMY(x.fecha, tz)}${e.hora ? ' ' + e.hora : ''}` : '', x.refId, x.ncf, x.alumnoNombre, x.tutorNombre, x.concepto, pagos.length > 1 ? pagos.map(p => `${p.metodo} ${round2(p.monto).toLocaleString('en-US')}`).join(' + ') : x.metodo ?? '—', x.monto, x.descuento, x.cajero, x.estado];
    }
    case 'notas': return [x.fecha ? fechaDMY(x.fecha, tz) : '', x.ncf, etqCat(x.categoria), String(e.ncfModificado ?? ''), x.alumnoNombre, x.tutorNombre, x.concepto, ((e.reembolsos as { metodo: string; monto: number }[] | undefined) ?? []).map(p => p.metodo).join(' + ') || '—', x.monto, e.reabre ? 'Sí' : 'No', x.cajero, x.estado];
    case 'descuentos': return [x.fecha ? fechaDMY(x.fecha, tz) : '', String(e.reciboId ?? ''), x.ncf, x.alumnoCodigo, x.alumnoNombre, String(e.lineaConcepto ?? ''), etqCat(x.categoria), x.concepto, typeof e.pct === 'number' ? e.pct : null, x.monto];
    case 'ventas': return [x.fecha ? fechaDMY(x.fecha, tz) : '', x.refId, x.ncf, x.concepto, x.metodo, x.cajero, x.monto];
    default: return [];
  }
}

/** Listado paginado (size 0 = todas las filas) con TOTALES del conjunto filtrado completo. */
export async function cierreTabla(nombre: string, tz: string, p: ParamsTabla): Promise<InformeTabla> {
  const { cierre } = await cierreDe(nombre);
  if (!cierre) throw new CicloError(AVISO_SIN_DETALLE, 404);
  const columnas = COLS[p.tabla];
  const q = p.q?.trim().toLowerCase();

  if (p.tabla === 'deudores') {
    let l = json<CierreDeudaAlumno[]>(cierre.deudaAlumnos);
    if (!Array.isArray(l)) l = [];
    if (q) l = l.filter(d => `${d.code} ${d.nombre} ${d.seccion}`.toLowerCase().includes(q));
    if (p.alumno) l = l.filter(d => d.alumnoId === p.alumno);
    const pag = p.size === 0 ? l : l.slice((p.page - 1) * p.size, p.page * p.size);
    return {
      id: 'deudores', titulo: TITULO.deudores, columnas, paginable: true, vacio: VACIO.deudores,
      filas: pag.map(d => [d.code, d.nombre, d.seccion, d.cargos, round2(d.pendiente), round2(d.vencido)]), total: l.length, page: p.size === 0 ? 1 : p.page, size: p.size === 0 ? l.length : p.size,
      totales: ['', 'TOTAL', '', l.reduce((a, d) => a + d.cargos, 0), round2(l.reduce((a, d) => a + d.pendiente, 0)), round2(l.reduce((a, d) => a + d.vencido, 0))],
    };
  }

  const and: Prisma.CierreCicloDetalleWhereInput[] = [];
  if (q) and.push({ OR: ['alumnoNombre', 'alumnoCodigo', 'tutorNombre', 'ncf', 'refId', 'concepto', 'cajero'].map(k => ({ [k]: { contains: q } })) as Prisma.CierreCicloDetalleWhereInput[] });
  if (p.alumno) and.push({ alumnoId: p.alumno });
  if (p.categoria) and.push({ categoria: p.categoria });
  if (p.estado) and.push(p.estado === 'SinPagar' ? { estado: { in: ['Pendiente', 'Vencido'] } } : { estado: p.estado });
  if (p.metodo) and.push({ OR: [{ metodo: p.metodo }, { extra: { contains: `"metodo":${JSON.stringify(p.metodo)}` } }] });
  const where: Prisma.CierreCicloDetalleWhereInput = { cierreId: cierre.id, tipo: TIPO_DB[p.tabla], ...(and.length ? { AND: and } : {}) };
  const [agg, rows] = await Promise.all([
    prisma.cierreCicloDetalle.aggregate({ where, _sum: { monto: true, descuento: true, pendiente: true }, _count: { _all: true } }),
    prisma.cierreCicloDetalle.findMany({
      where, orderBy: p.orden === 'monto' ? [{ monto: 'desc' }, { id: 'asc' }] : [{ fecha: 'asc' }, { id: 'asc' }], ...(p.size ? { skip: (p.page - 1) * p.size, take: p.size } : {}),
      select: { fecha: true, refId: true, alumnoCodigo: true, alumnoNombre: true, tutorNombre: true, concepto: true, categoria: true, metodo: true, ncf: true, cajero: true, monto: true, descuento: true, pendiente: true, estado: true, extra: true },
    }),
  ]);
  const s = agg._sum, tm = round2(s.monto ?? 0);
  const totales: Record<CierreTablaId, InformeCelda[]> = {
    cargos: ['', '', 'TOTAL', '', '', '', tm, round2(s.descuento ?? 0), round2(s.pendiente ?? 0), '', ''],
    recibos: ['', '', '', '', '', 'TOTAL', '', tm, round2(s.descuento ?? 0), '', ''],
    notas: ['', '', '', '', '', '', 'TOTAL', '', tm, '', '', ''],
    descuentos: ['', '', '', '', '', '', '', 'TOTAL', null, tm],
    ventas: ['', '', '', '', '', 'TOTAL', tm], deudores: [],
  };
  return {
    id: p.tabla, titulo: TITULO[p.tabla], columnas, paginable: true, vacio: VACIO[p.tabla], filas: rows.map(x => filaDe(p.tabla, x, tz)), total: agg._count._all,
    page: p.size ? p.page : 1, size: p.size || agg._count._all, totales: totales[p.tabla],
  };
}

// ===================================================================================================================
// EXCEL
// ===================================================================================================================
const aHoja = (t: InformeTabla, nombre: string, pre?: InformeCelda[][]): Hoja => ({ nombre, preambulo: pre, cabecera: t.columnas.map(c => c.titulo), tipos: t.columnas.map(c => c.tipo), filas: [...t.filas, ...(t.totales ? [t.totales] : [])] });

const NOMBRE_HOJA: Record<string, string> = {
  facturadoCategoria: 'Fact. por categoría', facturadoMes: 'Fact. por mes', pendienteAntiguedad: 'Pend. por antigüedad', vencidoAntiguedad: 'Venc. por antigüedad', pendienteCategoria: 'Pend. por categoría',
  moraMes: 'Mora por mes', cobradoMetodo: 'Cobrado por método', cobradoMes: 'Cobrado por mes', recibosEstado: 'Recibos vigentes-anulados', notasMotivo: 'Notas por motivo',
  devolucionesMetodo: 'Devoluciones por método', netoMetodo: 'Neto por método', descuentosMotivo: 'Desc. por motivo', descuentosCategoria: 'Desc. por categoría', ventasMetodo: 'Ventas por método', cantidades: 'Cantidades',
};

/** Libro completo del cierre: Resumen, Facturado (cargos), Cobrado (recibos), Notas, Descuentos, Ventas rápidas, Deudores y una hoja por desglose. */
export async function hojasCierre(nombre: string, tz: string): Promise<Hoja[]> {
  const inf = await informeCierreDetalle(nombre, tz);
  const cab: InformeCelda[][] = [[`Cierre del año escolar ${inf.ciclo}`], [inf.cerrado ? `Cerrado el ${fechaDMY(new Date(inf.cerrado.fecha), tz)} por ${inf.cerrado.usuarioNombre || inf.cerrado.usuario}` : 'Ciclo cerrado'], []];
  const cu = inf.detalle?.cuadre;
  const fila = (etq: string, v: number, id?: string): InformeCelda[] => [etq, v, cu && id && cu[id] ? cu[id].detalle : null, cu && id && cu[id] ? cu[id].diferencia : null];
  const resumen: Hoja = {
    nombre: 'Resumen', preambulo: cab, cabecera: ['Indicador', 'Cifra del cierre', 'Suma del detalle', 'Diferencia'], tipos: ['texto', 'moneda', 'moneda', 'moneda'],
    filas: [
      fila('Facturado (cargos del ciclo)', inf.facturado, 'facturado'), fila('Cobrado (recibos vigentes)', inf.cobrado, 'cobrado'), fila('Notas de crédito', inf.notasCredito, 'nc'), fila('Notas de débito', inf.notasDebito, 'nd'),
      fila('Cobrado neto', inf.cobradoNeto, 'neto'), fila('Descuentos aplicados', inf.descuentos, 'desc'), fila('Pendiente por cobrar', inf.pendiente, 'pend'), fila('De ello vencido', inf.vencido, 'venc'),
      fila('Recargos por mora', inf.mora, 'mora'), fila('Mora pendiente', inf.moraPendiente, 'morap'), fila('Recibos vigentes (cantidad)', inf.recibos, 'recibos'), fila('Recibos anulados (cantidad)', inf.recibosAnulados, 'anulados'),
      fila('Cargos (cantidad)', inf.cargos, 'cargos'), fila('Cargos sin pagar (cantidad)', inf.cargosPendientes), fila('Alumnos con deuda (cantidad)', inf.alumnosConDeuda, 'deudores'), fila('Matrículas en el ciclo (cantidad)', inf.matriculas),
      [], ...(inf.aviso ? [[inf.aviso] as InformeCelda[]] : []), ...(inf.detalle?.notas ?? []).map(n => [n] as InformeCelda[]),
    ],
  };
  if (!inf.detalleDisponible) {
    const l = inf.deudaAlumnos; // cierre anterior a esta función: solo existen los totales y la deuda por alumno guardada
    const t: InformeTabla = tabla('deudores', TITULO.deudores, COLS.deudores, l.map(d => [d.code, d.nombre, d.seccion, d.cargos, round2(d.pendiente), round2(d.vencido)]),
      ['', 'TOTAL', '', l.reduce((a, d) => a + d.cargos, 0), round2(l.reduce((a, d) => a + d.pendiente, 0)), round2(l.reduce((a, d) => a + d.vencido, 0))]);
    return [resumen, aHoja(t, 'Deudores')];
  }
  const todo = (t: CierreTablaId) => cierreTabla(nombre, tz, { tabla: t, page: 1, size: 0 });
  const [cg, rc, nt, ds, vt, dd] = await Promise.all([todo('cargos'), todo('recibos'), todo('notas'), todo('descuentos'), todo('ventas'), todo('deudores')]);
  const des = inf.detalle!.desgloses;
  return [
    resumen, aHoja(cg, 'Facturado (cargos)'), aHoja(rc, 'Cobrado (recibos)'), aHoja(nt, 'Notas'), aHoja(ds, 'Descuentos'), aHoja(vt, 'Ventas rápidas'), aHoja(dd, 'Deudores'),
    ...Object.values(des).map(t => aHoja(t, NOMBRE_HOJA[t.id] ?? t.titulo.slice(0, 31))),
  ];
}
