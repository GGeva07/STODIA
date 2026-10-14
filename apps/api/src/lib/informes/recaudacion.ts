import type { Prisma } from '@prisma/client';
import type { InformeCelda, InformeResp, InformeTabla } from '@stodia/shared';
import { prisma } from '../../db';
import { round2 } from '../cxc';
import { col, etiquetaMes, etiquetasFiltros, fechaDMY, hoy as hoyDMY, mesDe, paginaDb, rangoCreado, trozos, type Filtros } from './comun';

/**
 * INFORME 5 · Recaudación por método de pago (inf-facturacion) e INFORME 6 · Cobrado neto tras devoluciones.
 * Fuente SIEMPRE FinReciboPago (hay recibos con metodoPagoId NULL: pago mixto o histórico). Recibos Anulados NO suman: se listan aparte.
 * Ventas rápidas (FinVenta) no tienen ciclo: se filtran por rango de fechas (el del ciclo si no se indica) y van en su propia línea.
 */
const reciboWhere = (f: Filtros, anulado = false): Prisma.FinReciboWhereInput => ({
  cicloId: f.ciclo.id, est: anulado ? 'Anulado' : { not: 'Anulado' },
  ...(rangoCreado(f) ? { createdAt: rangoCreado(f)! } : {}), ...(f.cajero ? { cajeroId: f.cajero } : {}),
});
const pagoWhere = (f: Filtros): Prisma.FinReciboPagoWhereInput => ({ recibo: { is: reciboWhere(f) }, ...(f.metodo ? { metodoPagoId: f.metodo } : {}) });

/** Rango de las ventas rápidas: el filtro de fechas o, si no hay, el del ciclo (mismos días ISO). */
export function rangoVentas(f: Filtros) {
  const g = { ...f, desde: f.desde ?? f.ciclo.fechaInicio, hasta: f.hasta ?? f.ciclo.fechaFin };
  return { rango: rangoCreado(g)!, desde: g.desde, hasta: g.hasta, porDefecto: !f.desde && !f.hasta };
}
const ventaWhere = (f: Filtros): Prisma.FinVentaWhereInput => ({ createdAt: rangoVentas(f).rango, ...(f.cajero ? { cajeroId: f.cajero } : {}), ...(f.metodo ? { metodoPagoId: f.metodo } : {}) });

async function nombresMetodo(ids: string[]) {
  const l = ids.length ? await prisma.metodoPago.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } }) : [];
  return new Map(l.map(m => [m.id, m.nombre]));
}

async function cobradoPorMetodo(f: Filtros) {
  const g = await prisma.finReciboPago.groupBy({ by: ['metodoPagoId'], where: pagoWhere(f), _sum: { monto: true }, _count: { _all: true } });
  return new Map(g.map(x => [x.metodoPagoId, { monto: x._sum.monto ?? 0, n: x._count._all }]));
}
async function ventasPorMetodo(f: Filtros) {
  const g = await prisma.finVenta.groupBy({ by: ['metodoPagoId'], where: ventaWhere(f), _sum: { total: true }, _count: { _all: true } });
  return new Map(g.map(x => [x.metodoPagoId, { monto: x._sum.total ?? 0, n: x._count._all }]));
}
async function cobradoPorMes(f: Filtros) {
  const out = new Map<string, number>();
  for (const p of await prisma.finReciboPago.findMany({ where: pagoWhere(f), select: { monto: true, recibo: { select: { createdAt: true } } } })) {
    const m = mesDe(p.recibo.createdAt, f.tz);
    out.set(m, (out.get(m) ?? 0) + p.monto);
  }
  return out;
}

export async function informeRecaudacion(f: Filtros): Promise<InformeResp> {
  const [porMetodo, ventas, porMes] = await Promise.all([cobradoPorMetodo(f), ventasPorMetodo(f), cobradoPorMes(f)]);
  const nom = await nombresMetodo([...porMetodo.keys(), ...ventas.keys()]);
  const sum = (m: Map<string, { monto: number; n: number }>) => ({ monto: round2([...m.values()].reduce((a, x) => a + x.monto, 0)), n: [...m.values()].reduce((a, x) => a + x.n, 0) });
  const tr = sum(porMetodo), tv = sum(ventas);
  const wr = reciboWhere(f), wrA = reciboWhere(f, true);
  const conMetodo = f.metodo ? { pagos: { some: { metodoPagoId: f.metodo } } } : {};
  const [nRecibos, anulados] = await Promise.all([
    prisma.finRecibo.count({ where: { ...wr, ...conMetodo } }),
    prisma.finRecibo.aggregate({ where: { ...wrA, ...conMetodo }, _sum: { monto: true }, _count: { _all: true } }),
  ]);
  const vr = rangoVentas(f);

  const filasMetodo = (m: Map<string, { monto: number; n: number }>, t: { monto: number; n: number }) =>
    [...m.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([id, x]) => [nom.get(id) ?? id, x.n, round2(x.monto), t.monto ? round2((x.monto / t.monto) * 100) : 0] as InformeCelda[]);
  const colsMetodo = [col('metodo', 'Método de pago'), col('n', 'Pagos', 'entero'), col('monto', 'Monto', 'moneda'), col('pct', '% del total', 'porcentaje')];

  // Detalle por recibo (vigentes y anulados)
  const detalle = async (id: string, titulo: string, anulado: boolean): Promise<InformeTabla> => {
    const where = { ...reciboWhere(f, anulado), ...conMetodo };
    const pg = paginaDb(f, id);
    const [total, rows] = await Promise.all([
      prisma.finRecibo.count({ where }),
      prisma.finRecibo.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(pg.take ? { skip: pg.skip, take: pg.take } : {}),
        select: { id: true, ncf: true, tutor: true, hora: true, monto: true, createdAt: true, cajero: { select: { nombre: true } } },
      }),
    ]);
    // Los pagos se leen aparte y por lotes: un findMany anidado con miles de recibos tumba el motor de Prisma en SQL Server (límite de 2100 parámetros).
    const pagosDe = new Map<string, { metodoPagoId: string; monto: number; referencia: string }[]>();
    for (const ch of trozos(rows.map(r => r.id), 500)) for (const p of await prisma.finReciboPago.findMany({ where: { reciboId: { in: ch } }, orderBy: [{ reciboId: 'asc' }, { orden: 'asc' }], select: { reciboId: true, metodoPagoId: true, monto: true, referencia: true } })) { const l = pagosDe.get(p.reciboId) ?? []; l.push(p); pagosDe.set(p.reciboId, l); }
    const nm = await nombresMetodo([...new Set([...pagosDe.values()].flatMap(l => l.map(p => p.metodoPagoId)))]);
    const filas = rows.map(r => {
      const todos = pagosDe.get(r.id) ?? [], ps = f.metodo ? todos.filter(p => p.metodoPagoId === f.metodo) : todos;
      return [r.id, `${fechaDMY(r.createdAt, f.tz)} ${r.hora}`, r.ncf, r.tutor, ps.map(p => nm.get(p.metodoPagoId) ?? p.metodoPagoId).join(' + ') || '—', ps.map(p => p.referencia).filter(Boolean).join(', '), round2(ps.reduce((a, p) => a + p.monto, 0) || (f.metodo ? 0 : r.monto)), r.cajero?.nombre ?? '—'] as InformeCelda[];
    });
    return {
      id, titulo, paginable: true, filas, total, page: pg.page, size: f.size === 0 ? filas.length : f.size,
      columnas: [col('rec', 'Recibo'), col('fecha', 'Fecha'), col('ncf', 'NCF'), col('tutor', 'Tutor'), col('metodo', 'Método'), col('ref', 'Referencia'), col('monto', 'Monto', 'moneda'), col('cajero', 'Cajero')],
      totales: anulado ? ['', '', '', '', '', 'Total anulado (no suma al cobrado)', round2(anulados._sum.monto ?? 0), ''] : ['', '', '', '', '', 'TOTAL COBRADO', tr.monto, ''],
      vacio: anulado ? 'No hay recibos anulados con estos filtros.' : 'No hay recibos con estos filtros.',
    };
  };

  const tablas: InformeTabla[] = [
    { id: 'metodo', titulo: 'Recaudación por método de pago (recibos)', columnas: colsMetodo, filas: filasMetodo(porMetodo, tr), totales: ['TOTAL', tr.n, tr.monto, tr.monto ? 100 : 0], total: porMetodo.size, page: 1, size: porMetodo.size, vacio: 'No hay cobros con estos filtros.' },
    {
      id: 'mes', titulo: 'Recaudación por mes (recibos)', columnas: [col('mes', 'Mes'), col('monto', 'Monto', 'moneda'), col('pct', '% del total', 'porcentaje')],
      filas: [...porMes.entries()].sort().map(([m, v]) => [etiquetaMes(m), round2(v), tr.monto ? round2((v / tr.monto) * 100) : 0] as InformeCelda[]),
      totales: ['TOTAL', tr.monto, tr.monto ? 100 : 0], total: porMes.size, page: 1, size: porMes.size, vacio: 'No hay cobros con estos filtros.',
    },
    { id: 'ventas', titulo: 'Ventas rápidas (kiosko) por método', columnas: colsMetodo, filas: filasMetodo(ventas, tv), totales: ['VENTAS RÁPIDAS', tv.n, tv.monto, tv.monto ? 100 : 0], total: ventas.size, page: 1, size: ventas.size, vacio: 'No hay ventas rápidas en el rango.' },
    await detalle('recibos', 'Detalle por recibo', false),
    await detalle('anulados', 'Recibos anulados (no suman al cobrado)', true),
  ];
  return {
    id: 'recaudacion', titulo: 'Recaudación por método de pago', grupo: 'inf-facturacion', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'desde', 'hasta', 'cajero', 'metodo']),
    resumen: [
      { id: 'cobrado', etiqueta: 'Cobrado en recibos', valor: tr.monto, tipo: 'moneda', tono: 'ok' },
      { id: 'recibos', etiqueta: 'Recibos vigentes', valor: nRecibos, tipo: 'entero' },
      { id: 'ventas', etiqueta: 'Ventas rápidas', valor: tv.monto, tipo: 'moneda', tono: 'info' },
      { id: 'total', etiqueta: 'Total recaudado', valor: round2(tr.monto + tv.monto), tipo: 'moneda' },
      { id: 'anulados', etiqueta: 'Recibos anulados', valor: anulados._count._all, tipo: 'entero', tono: anulados._count._all ? 'warn' : undefined },
    ],
    tablas,
    notas: [
      'El cobrado sale de los pagos de cada recibo (FinReciboPago), no de la columna «método» del recibo: un pago mixto reparte el monto entre sus métodos. Los recibos anulados no suman.',
      `Las ventas rápidas (kiosko) no pertenecen a un ciclo: se filtran por fechas (${vr.porDefecto ? `por defecto las del ciclo ${f.ciclo.nombre}: ${vr.desde} a ${vr.hasta}` : `${vr.desde} a ${vr.hasta}`}) y se muestran como línea separada; no están incluidas en «Cobrado en recibos».`,
      'Las inscripciones registradas directamente en Personas (PersInscripcion) no tienen método de pago y no figuran en este informe.',
    ],
  };
}

/** INFORME 6 · Cobrado neto. DEFINICIÓN: devoluciones atribuidas al ciclo (y fecha) del RECIBO de origen — el neto cuadra con lo cobrado del ciclo. */
export async function informeNeto(f: Filtros): Promise<InformeResp> {
  const wRec = reciboWhere(f);
  const reembWhere: Prisma.NotaFiscalReembolsoWhereInput = { ...(f.metodo ? { metodoPagoId: f.metodo } : {}), nota: { is: { clase: 'CREDITO', estado: 'Emitida', recibo: { is: wRec } } } };
  const [cobMetodo, devG, cobMes, devRows, ventasM] = await Promise.all([
    cobradoPorMetodo(f),
    prisma.notaFiscalReembolso.groupBy({ by: ['metodoPagoId'], where: reembWhere, _sum: { monto: true }, _count: { _all: true } }),
    cobradoPorMes(f),
    prisma.notaFiscalReembolso.findMany({ where: reembWhere, select: { monto: true, nota: { select: { recibo: { select: { createdAt: true } } } } } }),
    ventasPorMetodo(f),
  ]);
  const dev = new Map(devG.map(x => [x.metodoPagoId, { monto: x._sum.monto ?? 0, n: x._count._all }]));
  const devVentasG = await prisma.notaFiscalReembolso.groupBy({
    by: ['metodoPagoId'], _sum: { monto: true },
    where: { ...(f.metodo ? { metodoPagoId: f.metodo } : {}), nota: { is: { clase: 'CREDITO', estado: 'Emitida', venta: { is: ventaWhere(f) } } } },
  });
  const devVentas = new Map(devVentasG.map(x => [x.metodoPagoId, x._sum.monto ?? 0]));
  const devMes = new Map<string, number>();
  for (const r of devRows) { const c = r.nota.recibo?.createdAt; if (c) { const m = mesDe(c, f.tz); devMes.set(m, (devMes.get(m) ?? 0) + r.monto); } }
  const nom = await nombresMetodo([...new Set([...cobMetodo.keys(), ...dev.keys(), ...ventasM.keys(), ...devVentas.keys()])]);
  const tot = (m: Map<string, { monto: number }>) => round2([...m.values()].reduce((a, x) => a + x.monto, 0));
  const cobrado = tot(cobMetodo), devuelto = tot(dev), neto = round2(cobrado - devuelto);
  const vCob = tot(ventasM), vDev = round2([...devVentas.values()].reduce((a, x) => a + x, 0));

  // Por fecha de la nota (informativo)
  const porNota = await prisma.notaFiscalReembolso.aggregate({
    where: { ...(f.metodo ? { metodoPagoId: f.metodo } : {}), nota: { is: { clase: 'CREDITO', estado: 'Emitida', cicloId: f.ciclo.id, ...(rangoCreado(f) ? { createdAt: rangoCreado(f)! } : {}), ...(f.cajero ? { cajeroId: f.cajero } : {}) } } },
    _sum: { monto: true },
  });
  const devPorNota = round2(porNota._sum.monto ?? 0);
  const devAnuladas = round2((await prisma.notaFiscalReembolso.aggregate({ where: { ...(f.metodo ? { metodoPagoId: f.metodo } : {}), nota: { is: { clase: 'CREDITO', estado: 'Emitida', recibo: { is: reciboWhere(f, true) } } } }, _sum: { monto: true } }))._sum.monto ?? 0);

  const filasMetodo = (cob: Map<string, { monto: number }>, d: Map<string, number>) => {
    const ids = [...new Set([...cob.keys(), ...d.keys()])];
    return ids.map(id => ({ id, c: cob.get(id)?.monto ?? 0, d: d.get(id) ?? 0 })).sort((a, b) => b.c - a.c).map(x => [nom.get(x.id) ?? x.id, round2(x.c), round2(x.d), round2(x.c - x.d)] as InformeCelda[]);
  };
  const colsNeto = [col('metodo', 'Método de pago'), col('cob', 'Cobrado', 'moneda'), col('dev', 'Devoluciones', 'moneda'), col('neto', 'Cobrado neto', 'moneda')];
  const meses = [...new Set([...cobMes.keys(), ...devMes.keys()])].sort();

  // Lista de devoluciones (notas de crédito con reembolso sobre recibos del ciclo)
  const where: Prisma.NotaFiscalWhereInput = { clase: 'CREDITO', estado: 'Emitida', recibo: { is: wRec }, reembolsos: { some: f.metodo ? { metodoPagoId: f.metodo } : {} } };
  const pg = paginaDb(f, 'devoluciones');
  const [nDev, notas] = await Promise.all([
    prisma.notaFiscal.count({ where }),
    prisma.notaFiscal.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(pg.take ? { skip: pg.skip, take: pg.take } : {}),
      select: { ncf: true, ncfModificado: true, createdAt: true, monto: true, motivo: { select: { nombre: true } }, recibo: { select: { id: true, createdAt: true } }, reembolsos: { select: { metodoPagoId: true, monto: true } } },
    }),
  ]);
  const nm2 = await nombresMetodo([...new Set(notas.flatMap(n => n.reembolsos.map(r => r.metodoPagoId)))]);
  const filasDev = notas.map(n => {
    const rs = f.metodo ? n.reembolsos.filter(r => r.metodoPagoId === f.metodo) : n.reembolsos;
    return [fechaDMY(n.createdAt, f.tz), n.ncf, n.recibo?.id ?? '', n.ncfModificado, n.recibo ? fechaDMY(n.recibo.createdAt, f.tz) : '', n.motivo.nombre, rs.map(r => nm2.get(r.metodoPagoId) ?? r.metodoPagoId).join(' + '), round2(rs.reduce((a, r) => a + r.monto, 0)), round2(n.monto)] as InformeCelda[];
  });

  const notasTxt = [
    `DEFINICIÓN: cobrado neto = cobrado (pagos de recibos vigentes) − devoluciones (reembolsos de notas de crédito emitidas), con las devoluciones ATRIBUIDAS AL CICLO, FECHA Y CAJERO DEL RECIBO DE ORIGEN. Así el neto del ciclo cuadra con lo cobrado del ciclo, aunque la nota se emita en otro ciclo.`,
    devPorNota === devuelto
      ? 'Las devoluciones emitidas en el ciclo (por fecha de la nota) coinciden con las atribuidas por recibo de origen.'
      : `Diferencia de criterio: las notas de crédito EMITIDAS en el ciclo ${f.ciclo.nombre} (por fecha de la nota) devolvieron RD$ ${devPorNota.toLocaleString('en-US', { minimumFractionDigits: 2 })}, frente a RD$ ${devuelto.toLocaleString('en-US', { minimumFractionDigits: 2 })} atribuidas a recibos vigentes del ciclo${devAnuladas ? `; RD$ ${devAnuladas.toLocaleString('en-US', { minimumFractionDigits: 2 })} corresponden a recibos que la propia nota anuló y que por eso ya no cuentan en el cobrado (no se restan dos veces)` : ''}.`,
    `Las ventas rápidas (kiosko) no tienen ciclo: se muestran aparte filtradas por fecha (por defecto las del ciclo) y no entran en el neto del ciclo (cobrado neto ventas rápidas: RD$ ${round2(vCob - vDev).toLocaleString('en-US', { minimumFractionDigits: 2 })}).`,
    'Solo cuentan notas de crédito en estado Emitida con reembolso por método de pago; una nota que solo reabre un cargo sin devolver dinero no resta al cobrado.',
  ];
  return {
    id: 'neto', titulo: 'Cobrado neto tras devoluciones', grupo: 'inf-facturacion', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'desde', 'hasta', 'cajero', 'metodo']),
    resumen: [
      { id: 'cobrado', etiqueta: 'Cobrado', valor: cobrado, tipo: 'moneda', tono: 'ok' },
      { id: 'dev', etiqueta: 'Devoluciones', valor: devuelto, tipo: 'moneda', tono: devuelto ? 'warn' : undefined },
      { id: 'neto', etiqueta: 'Cobrado neto', valor: neto, tipo: 'moneda', tono: 'ok' },
      { id: 'notas', etiqueta: 'Notas con devolución', valor: nDev, tipo: 'entero' },
      { id: 'vneto', etiqueta: 'Ventas rápidas (neto)', valor: round2(vCob - vDev), tipo: 'moneda', tono: 'info' },
    ],
    tablas: [
      { id: 'metodo', titulo: 'Cobrado neto por método de pago', columnas: colsNeto, filas: filasMetodo(cobMetodo, new Map([...dev].map(([k, v]) => [k, v.monto]))), totales: ['TOTAL', cobrado, devuelto, neto], total: new Set([...cobMetodo.keys(), ...dev.keys()]).size, page: 1, size: 999, vacio: 'No hay cobros con estos filtros.' },
      {
        id: 'mes', titulo: 'Cobrado neto por mes del recibo', columnas: [col('mes', 'Mes'), col('cob', 'Cobrado', 'moneda'), col('dev', 'Devoluciones', 'moneda'), col('neto', 'Cobrado neto', 'moneda')],
        filas: meses.map(m => [etiquetaMes(m), round2(cobMes.get(m) ?? 0), round2(devMes.get(m) ?? 0), round2((cobMes.get(m) ?? 0) - (devMes.get(m) ?? 0))] as InformeCelda[]),
        totales: ['TOTAL', cobrado, devuelto, neto], total: meses.length, page: 1, size: meses.length, vacio: 'No hay cobros con estos filtros.',
      },
      { id: 'ventas', titulo: 'Ventas rápidas (kiosko) por método', columnas: colsNeto, filas: filasMetodo(ventasM, devVentas), totales: ['VENTAS RÁPIDAS', vCob, vDev, round2(vCob - vDev)], total: new Set([...ventasM.keys(), ...devVentas.keys()]).size, page: 1, size: 999, vacio: 'No hay ventas rápidas en el rango.' },
      {
        id: 'devoluciones', titulo: 'Devoluciones (notas de crédito con reembolso)', paginable: true,
        columnas: [col('fecha', 'Fecha nota'), col('ncf', 'NCF nota'), col('rec', 'Recibo origen'), col('ncfmod', 'NCF modificado'), col('frec', 'Fecha recibo'), col('motivo', 'Motivo'), col('metodo', 'Método'), col('reemb', 'Reembolsado', 'moneda'), col('monto', 'Monto de la nota', 'moneda')],
        filas: filasDev, total: nDev, page: pg.page, size: f.size === 0 ? filasDev.length : f.size, vacio: 'No hay devoluciones sobre recibos del ciclo con estos filtros.',
        totales: ['', '', '', '', '', '', 'TOTAL DEVUELTO', devuelto, null],
      },
    ],
    notas: notasTxt,
  };
}
