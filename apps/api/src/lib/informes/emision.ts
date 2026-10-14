import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { CATEGORIAS, categoriaCargo, categoriaPorConcepto, nombreCategoria } from '../categorias';
import { inicioDia, round2 } from '../cxc';
import { col, etiquetaMes, etiquetasFiltros, fechaDMY, hoy as hoyDMY, mesDe, rangoCreado, tablaMem, trozos, type Filtros } from './comun';

/**
 * INFORME 4 · Emisión total de facturas por concepto (inf-facturacion). «Facturas» = COMPROBANTES CON NCF emitidos (no lo devengado de los cargos). Une las TRES fuentes de NCF:
 *   · Recibo (FinRecibo): cobros de cartera; sus líneas (FinReciboItem) traen la categoría. Ciclo = FinRecibo.cicloId; fecha = createdAt.
 *   · Venta rápida (FinVenta): kiosko; ciclo = FinVenta.cicloId (o, si es anterior a esa columna, el rango de fechas del ciclo); sus líneas son artículos y la diferencia con el total es el ITBIS.
 *   · Inscripción (PersInscripcion): NCF + factura sin recibo; solo las que NO tienen su NCF en un recibo (si no se contarían dos veces).
 * Categoría de una línea: la guardada (colegiatura, inscripcion, reinscripcion, materiales, servicio, articulo, mora, otro); si falta (datos anteriores), se deduce del cargo o del concepto.
 * Importe de una línea = monto − descuento. Lo que no cuadre con el total del comprobante (recibo sin líneas, ITBIS de ventas) va a «Sin detalle de líneas» / «ITBIS y ajustes (ventas)»,
 * así que el total por categoría SIEMPRE es la suma de los comprobantes. Anulados: se listan aparte y no suman a la emisión.
 */
type Fuente = 'Recibo' | 'Venta rápida' | 'Inscripción';
interface Linea { concepto: string; cat: string; bruto: number; desc: number }
interface Doc { fuente: Fuente; id: string; fecha: Date; ncf: string; tipo: string; cliente: string; vigente: boolean; monto: number; lineas: Linea[] }

const CAT_EXTRA = [{ id: 'itbis', nombre: 'ITBIS y ajustes (ventas rápidas)' }, { id: 'sin_detalle', nombre: 'Sin detalle de líneas' }];
const nombreCat = (id: string) => CAT_EXTRA.find(c => c.id === id)?.nombre ?? nombreCategoria(id);
const ordenCat = (id: string) => { const i = CATEGORIAS.findIndex(c => c.id === id); return i >= 0 ? i : 100 + CAT_EXTRA.findIndex(c => c.id === id); };
const neto = (l: Linea) => round2(l.bruto - l.desc);

/** Todos los comprobantes del filtro (ciclo, rango de fechas, tipo de comprobante) con sus líneas ya categorizadas. */
async function cargarDocs(f: Filtros): Promise<Doc[]> {
  const rango = rangoCreado(f);
  const cicloRango = { gte: inicioDia(f.ciclo.fechaInicio, f.tz), lt: inicioDia(new Date(Date.UTC(+f.ciclo.fechaFin.slice(0, 4), +f.ciclo.fechaFin.slice(5, 7) - 1, +f.ciclo.fechaFin.slice(8, 10) + 1)).toISOString().slice(0, 10), f.tz) };
  const [recibos, ventas, insc] = await Promise.all([
    prisma.finRecibo.findMany({
      where: { cicloId: f.ciclo.id, ...(rango ? { createdAt: rango } : {}), ...(f.comprobante ? { tipoComprobanteId: f.comprobante } : {}) },
      select: { id: true, ncf: true, tutor: true, clienteNombre: true, createdAt: true, monto: true, est: true, tipoComprobante: { select: { codigo: true } } },
    }),
    prisma.finVenta.findMany({
      where: { OR: [{ cicloId: f.ciclo.id }, { cicloId: null, createdAt: cicloRango }], ...(rango ? { createdAt: rango } : {}) },
      select: { id: true, ncf: true, total: true, doc: true, createdAt: true, lineas: { select: { nombre: true, cantidad: true, precio: true } } },
    }),
    prisma.persInscripcion.findMany({ where: { cicloId: f.ciclo.id, ...(rango ? { createdAt: rango } : {}) }, select: { id: true, ncf: true, factura: true, createdAt: true, alumno: { select: { tutor: { select: { nombre: true } } } } } }),
  ]);
  // Las líneas se leen aparte y por lotes: un findMany anidado con miles de recibos hace que el motor de Prisma/SQL Server (límite de 2100 parámetros) se caiga ("no entry found for key").
  const lineasDe = new Map<string, { concepto: string; monto: number; descuento: number | null; categoria: string | null; cobroItem: { tipo: string; con: string; categoria: string | null } | null }[]>();
  for (const ch of trozos(recibos.map(r => r.id), 500)) {
    for (const l of await prisma.finReciboItem.findMany({ where: { reciboId: { in: ch } }, orderBy: [{ reciboId: 'asc' }, { orden: 'asc' }], select: { reciboId: true, concepto: true, monto: true, descuento: true, categoria: true, cobroItem: { select: { tipo: true, con: true, categoria: true } } } })) {
      const arr = lineasDe.get(l.reciboId) ?? []; arr.push(l); lineasDe.set(l.reciboId, arr);
    }
  }
  const ncfRecibos = new Set<string>();
  for (const ch of trozos(insc.map(i => i.ncf))) for (const r of await prisma.finRecibo.findMany({ where: { ncf: { in: ch } }, select: { ncf: true } })) ncfRecibos.add(r.ncf);

  const docs: Doc[] = [];
  for (const r of recibos) {
    const lineas: Linea[] = (lineasDe.get(r.id) ?? []).map(l => ({
      concepto: l.concepto, bruto: l.monto, desc: l.descuento ?? 0,
      cat: l.categoria ?? l.cobroItem?.categoria ?? (l.cobroItem ? categoriaCargo(l.cobroItem.tipo, l.cobroItem.con) : categoriaPorConcepto(l.concepto)),
    }));
    const dif = round2(r.monto - lineas.reduce((a, l) => a + neto(l), 0));
    if (Math.abs(dif) > 0.005) lineas.push({ concepto: lineas.length ? 'Diferencia con el total del recibo' : 'Recibo sin líneas', cat: 'sin_detalle', bruto: dif, desc: 0 });
    docs.push({ fuente: 'Recibo', id: r.id, fecha: r.createdAt, ncf: r.ncf, tipo: r.tipoComprobante.codigo, cliente: r.clienteNombre || r.tutor, vigente: r.est !== 'Anulado', monto: round2(r.monto), lineas });
  }
  for (const v of ventas) {
    const tipo = v.ncf.slice(0, 3);
    if (f.comprobante && tipo !== f.comprobante) continue;
    const lineas: Linea[] = v.lineas.map(l => ({ concepto: `${l.cantidad} × ${l.nombre}`, cat: 'articulo', bruto: round2(l.precio * l.cantidad), desc: 0 }));
    const dif = round2(v.total - lineas.reduce((a, l) => a + neto(l), 0));
    if (Math.abs(dif) > 0.005) lineas.push({ concepto: 'ITBIS', cat: 'itbis', bruto: dif, desc: 0 });
    docs.push({ fuente: 'Venta rápida', id: v.id, fecha: v.createdAt, ncf: v.ncf, tipo, cliente: v.doc === 'cf2' ? 'Crédito fiscal (comprador no guardado)' : 'Consumidor final', vigente: true, monto: round2(v.total), lineas });
  }
  for (const i of insc) {
    if (ncfRecibos.has(i.ncf)) continue;
    const tipo = i.ncf.slice(0, 3);
    if (f.comprobante && tipo !== f.comprobante) continue;
    docs.push({ fuente: 'Inscripción', id: i.id, fecha: i.createdAt, ncf: i.ncf, tipo, cliente: i.alumno.tutor.nombre, vigente: true, monto: round2(i.factura), lineas: [{ concepto: 'Inscripción', cat: 'inscripcion', bruto: round2(i.factura), desc: 0 }] });
  }
  // Filtro de categoría: solo las líneas de esa categoría; el comprobante cuenta por lo que tiene de ella.
  if (f.categoria) {
    const out: Doc[] = [];
    for (const d of docs) { const ls = d.lineas.filter(l => l.cat === f.categoria); if (ls.length) out.push({ ...d, lineas: ls, monto: round2(ls.reduce((a, l) => a + neto(l), 0)) }); }
    return out;
  }
  return docs;
}

const FUENTES: Fuente[] = ['Recibo', 'Venta rápida', 'Inscripción'];

export async function informeEmision(f: Filtros): Promise<InformeResp> {
  const docs = (await cargarDocs(f)).sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.id.localeCompare(a.id));
  const vig = docs.filter(d => d.vigente), anu = docs.filter(d => !d.vigente);
  const sum = (l: Doc[]) => round2(l.reduce((a, d) => a + d.monto, 0));
  const totalVig = sum(vig);

  // Tipos de comprobante
  const tipos = await prisma.tipoComprobante.findMany({ select: { codigo: true, nombre: true } });
  const nomTipo = new Map(tipos.map(t => [t.codigo, t.nombre]));

  // ---- Por categoría (solo vigentes) con detalle por fuente
  type C = { docs: Set<string>; lineas: number; bruto: number; desc: number; porFuente: Map<Fuente, { docs: Set<string>; neto: number }> };
  const porCat = new Map<string, C>();
  for (const d of vig) for (const l of d.lineas) {
    const c = porCat.get(l.cat) ?? { docs: new Set(), lineas: 0, bruto: 0, desc: 0, porFuente: new Map() };
    c.docs.add(d.fuente + d.id); c.lineas++; c.bruto += l.bruto; c.desc += l.desc;
    const pf = c.porFuente.get(d.fuente) ?? { docs: new Set<string>(), neto: 0 };
    pf.docs.add(d.id); pf.neto += neto(l); c.porFuente.set(d.fuente, pf);
    porCat.set(l.cat, c);
  }
  const cats = [...porCat.entries()].sort((a, b) => ordenCat(a[0]) - ordenCat(b[0]));
  const filasCat = cats.map(([id, c]) => [nombreCat(id), c.docs.size, c.lineas, round2(c.bruto), round2(c.desc), round2(c.bruto - c.desc), totalVig ? round2(((c.bruto - c.desc) / totalVig) * 100) : 0] as InformeCelda[]);
  const detCat = cats.map(([, c]) => FUENTES.filter(x => c.porFuente.has(x)).map(x => [x, c.porFuente.get(x)!.docs.size, round2(c.porFuente.get(x)!.neto)] as InformeCelda[]));

  // ---- Por mes × categoría
  const meses = new Map<string, Map<string, number>>();
  const docsMes = new Map<string, number>();
  for (const d of vig) {
    const m = mesDe(d.fecha, f.tz);
    docsMes.set(m, (docsMes.get(m) ?? 0) + 1);
    const row = meses.get(m) ?? new Map<string, number>();
    for (const l of d.lineas) row.set(l.cat, (row.get(l.cat) ?? 0) + neto(l));
    meses.set(m, row);
  }
  const idsCat = cats.map(([id]) => id);
  const mesesOrden = [...meses.keys()].sort();
  const filasMes = mesesOrden.map(m => [etiquetaMes(m), docsMes.get(m) ?? 0, ...idsCat.map(c => round2(meses.get(m)!.get(c) ?? 0)), round2([...meses.get(m)!.values()].reduce((a, b) => a + b, 0))] as InformeCelda[]);

  // ---- Por tipo de comprobante
  const porTipo = new Map<string, { v: Doc[]; a: Doc[] }>();
  for (const d of docs) { const e = porTipo.get(d.tipo) ?? { v: [], a: [] }; (d.vigente ? e.v : e.a).push(d); porTipo.set(d.tipo, e); }
  const tiposOrden = [...porTipo.entries()].sort((a, b) => sum(b[1].v) - sum(a[1].v));
  const filasTipo = tiposOrden.map(([t, e]) => [t, nomTipo.get(t) ?? '(sin catálogo)', e.v.length, sum(e.v), e.a.length, sum(e.a)] as InformeCelda[]);
  const detTipo = tiposOrden.map(([, e]) => FUENTES.map(x => [x, e.v.filter(d => d.fuente === x).length, sum(e.v.filter(d => d.fuente === x))] as InformeCelda[]).filter(r => (r[1] as number) > 0));

  // ---- Por fuente
  const filasFuente = FUENTES.map(x => [x, vig.filter(d => d.fuente === x).length, sum(vig.filter(d => d.fuente === x)), anu.filter(d => d.fuente === x).length, sum(anu.filter(d => d.fuente === x))] as InformeCelda[]);

  // ---- Detalle por factura
  const filasDoc = docs.map(d => {
    const cs = [...new Set(d.lineas.map(l => l.cat))];
    return [fechaDMY(d.fecha, f.tz), d.ncf, d.tipo, d.fuente, d.cliente, cs.length === 1 ? nombreCat(cs[0]) : cs.length ? 'Varias' : '—', d.monto, d.vigente ? 'Vigente' : 'Anulada'] as InformeCelda[];
  });
  const detDoc = docs.map(d => d.lineas.map(l => [l.concepto, nombreCat(l.cat), round2(l.bruto), round2(l.desc), neto(l)] as InformeCelda[]));

  // ---- Cuadre con otros informes (solo sin filtros que lo distorsionen)
  const sinFiltros = !f.comprobante && !f.categoria;
  const filasCuadre: InformeCelda[][] = [];
  if (sinFiltros) {
    const rango = rangoCreado(f);
    const [pagos, cierre, ventasRango] = await Promise.all([
      prisma.finReciboPago.aggregate({ where: { recibo: { is: { cicloId: f.ciclo.id, est: { not: 'Anulado' }, ...(rango ? { createdAt: rango } : {}) } } }, _sum: { monto: true } }),
      f.ciclo.estado === 'Cerrado' && !rango ? prisma.cierreCiclo.findUnique({ where: { cicloId: f.ciclo.id }, select: { cobrado: true } }) : Promise.resolve(null),
      prisma.finVenta.aggregate({ where: { createdAt: rango ?? { gte: inicioDia(f.ciclo.fechaInicio, f.tz), lt: inicioDia(new Date(Date.UTC(+f.ciclo.fechaFin.slice(0, 4), +f.ciclo.fechaFin.slice(5, 7) - 1, +f.ciclo.fechaFin.slice(8, 10) + 1)).toISOString().slice(0, 10), f.tz) } }, _sum: { total: true } }),
    ]);
    const mio = sum(vig.filter(d => d.fuente === 'Recibo')), refPag = round2(pagos._sum.monto ?? 0);
    filasCuadre.push(['Recibos vigentes (este informe) vs Recaudación (pagos de recibos, informe 5)', mio, refPag, round2(mio - refPag)]);
    if (cierre) filasCuadre.push(['Recibos vigentes (este informe) vs Cobrado del cierre del año', mio, round2(cierre.cobrado), round2(mio - cierre.cobrado)]);
    const mv = sum(vig.filter(d => d.fuente === 'Venta rápida')), refV = round2(ventasRango._sum.total ?? 0);
    filasCuadre.push(['Ventas rápidas (este informe) vs Ventas rápidas del informe 5 (por fecha)', mv, refV, round2(mv - refV)]);
  }

  const nDocs = (l: Doc[], fu: Fuente) => l.filter(d => d.fuente === fu).length;
  return {
    id: 'emision', titulo: 'Emisión total de facturas por concepto', grupo: 'inf-facturacion', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: await etiquetasFiltros(f, ['ciclo', 'desde', 'hasta', 'comprobante', 'categoria']),
    resumen: [
      { id: 'total', etiqueta: 'Emisión total (vigente)', valor: totalVig, tipo: 'moneda', tono: 'ok' },
      { id: 'docs', etiqueta: 'Comprobantes vigentes', valor: vig.length, tipo: 'entero' },
      { id: 'rec', etiqueta: 'Recibos', valor: nDocs(vig, 'Recibo'), tipo: 'entero' },
      { id: 'ven', etiqueta: 'Ventas rápidas', valor: nDocs(vig, 'Venta rápida'), tipo: 'entero' },
      { id: 'ins', etiqueta: 'Inscripciones (sin recibo)', valor: nDocs(vig, 'Inscripción'), tipo: 'entero' },
      { id: 'anu', etiqueta: 'Comprobantes anulados', valor: anu.length, tipo: 'entero', tono: anu.length ? 'warn' : undefined },
      { id: 'anum', etiqueta: 'Monto anulado (no suma)', valor: sum(anu), tipo: 'moneda', tono: anu.length ? 'warn' : undefined },
    ],
    tablas: [
      tablaMem(f, 'categorias', 'Emisión por categoría (concepto)', [col('cat', 'Categoría'), col('docs', 'Comprobantes', 'entero'), col('lineas', 'Líneas', 'entero'), col('bruto', 'Bruto', 'moneda'), col('desc', 'Descuentos', 'moneda'), col('neto', 'Emitido', 'moneda'), col('pct', '% del total', 'porcentaje')], filasCat,
        { totales: ['TOTAL', vig.length, cats.reduce((a, [, c]) => a + c.lineas, 0), round2(cats.reduce((a, [, c]) => a + c.bruto, 0)), round2(cats.reduce((a, [, c]) => a + c.desc, 0)), totalVig, totalVig ? 100 : 0], vacio: 'No hay comprobantes con estos filtros.',
          detalle: { titulo: 'Por fuente del comprobante', columnas: [col('fuente', 'Fuente'), col('docs', 'Comprobantes', 'entero'), col('neto', 'Emitido', 'moneda')], porFila: detCat } }),
      tablaMem(f, 'mes', 'Emisión por mes y categoría', [col('mes', 'Mes'), col('docs', 'Comprobantes', 'entero'), ...idsCat.map(c => col('c' + c, nombreCat(c), 'moneda')), col('total', 'Total', 'moneda')], filasMes,
        { totales: ['TOTAL', vig.length, ...idsCat.map(c => round2(cats.find(x => x[0] === c)![1].bruto - cats.find(x => x[0] === c)![1].desc)), totalVig], vacio: 'No hay comprobantes con estos filtros.' }),
      tablaMem(f, 'tipo', 'Emisión por tipo de comprobante', [col('tipo', 'Tipo'), col('nombre', 'Nombre'), col('docs', 'Vigentes', 'entero'), col('monto', 'Monto vigente', 'moneda'), col('anu', 'Anulados', 'entero'), col('anum', 'Monto anulado', 'moneda')], filasTipo,
        { totales: ['TOTAL', '', vig.length, totalVig, anu.length, sum(anu)], vacio: 'No hay comprobantes con estos filtros.', detalle: { titulo: 'Por fuente (vigentes)', columnas: [col('fuente', 'Fuente'), col('docs', 'Comprobantes', 'entero'), col('monto', 'Monto', 'moneda')], porFila: detTipo } }),
      tablaMem(f, 'fuente', 'Emisión por fuente del NCF', [col('fuente', 'Fuente'), col('docs', 'Vigentes', 'entero'), col('monto', 'Monto vigente', 'moneda'), col('anu', 'Anulados', 'entero'), col('anum', 'Monto anulado', 'moneda')], filasFuente,
        { totales: ['TOTAL', vig.length, totalVig, anu.length, sum(anu)] }),
      { ...tablaMem(f, 'facturas', 'Detalle por factura', [col('fecha', 'Fecha'), col('ncf', 'NCF'), col('tipo', 'Tipo'), col('fuente', 'Fuente'), col('cliente', 'Cliente / tutor'), col('cat', 'Categoría'), col('monto', 'Monto', 'moneda'), col('estado', 'Estado')], filasDoc,
        { paginable: true, vacio: 'No hay comprobantes con estos filtros.', totales: ['', '', '', '', 'TOTAL VIGENTE', '', totalVig, ''], detalle: { titulo: 'Líneas del comprobante', columnas: [col('concepto', 'Concepto'), col('cat', 'Categoría'), col('bruto', 'Bruto', 'moneda'), col('desc', 'Descuento', 'moneda'), col('neto', 'Importe', 'moneda')], porFila: detDoc } }), pdfMax: 75 },
      tablaMem(f, 'cuadre', 'Cuadre con otros informes', [col('c', 'Comparación'), col('mio', 'Este informe', 'moneda'), col('ref', 'Referencia', 'moneda'), col('dif', 'Diferencia', 'moneda')], filasCuadre,
        { vacio: 'El cuadre solo se calcula sin filtro de tipo de comprobante ni de categoría.' }),
    ],
    notas: [
      'Cómo se calcula: «factura» = comprobante con NCF emitido (la app emite el comprobante al cobrar, no al generar el cargo). Se unen tres fuentes: recibos (FinRecibo), ventas rápidas del kiosko (FinVenta) e inscripciones con NCF propio (PersInscripcion, solo las que no tienen recibo). La columna «Fuente» las distingue.',
      'Categoría = la de cada línea (colegiatura, inscripción, reinscripción, materiales, servicios, artículos, mora, otros); importe de línea = monto − descuento. Un recibo con líneas de varias categorías se reparte entre ellas; por eso «Comprobantes» de las categorías no suma al total. «ITBIS y ajustes (ventas rápidas)» es la diferencia entre el total de la venta y sus artículos; «Sin detalle de líneas», lo que el total del recibo trae de más o de menos que sus líneas.',
      'Los comprobantes anulados (recibos en estado Anulado) se listan pero no suman a la emisión. Las ventas rápidas no guardan estado de anulación: las devoluciones se ven en el informe de notas de crédito. El tipo de comprobante de ventas e inscripciones sale del prefijo del NCF (B01, B02, E31, E32…).',
      'Diferencias esperadas con otros informes: la Recaudación (informe 5) suma pagos, no comprobantes (un recibo mixto reparte su monto, y el abono parcial puede diferir del total del recibo); las ventas rápidas no están en el cobrado del cierre del año; las inscripciones sin recibo no tienen medio de pago y no figuran en la Recaudación.',
    ],
  };
}
