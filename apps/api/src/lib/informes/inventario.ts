import type { InformeCelda, InformeResp } from '@stodia/shared';
import { prisma } from '../../db';
import { inicioDia, round2 } from '../cxc';
import { cfgGet } from '../sisconfig';
import { col, fechaDMY, etiquetasFiltros, hoy as hoyDMY, rangoCreado, tablaMem, trozos, type Filtros } from './comun';

/**
 * INFORME 12 · Inventario y tienda: rotación de stock y total recaudado en Uniformes, Libros y Papelería/Útiles (inf-inventario).
 * ROTACIÓN (solo productos con control de stock; los productos con stock vacío —servicios, paquetes, actividades— no generan movimientos y quedan fuera):
 *   Cantidad de un movimiento = FinMovimiento.cantidad (con signo; si falta, se interpreta `q`): Salida < 0, Entrada y Devolución > 0.
 *   Stock inicial = stock actual − Σ cantidades de los movimientos desde el inicio del rango; Stock final = inicial + Σ del rango; Stock promedio = (inicial + final) / 2.
 *   Salidas netas = salidas − devoluciones;  Rotación = salidas netas / stock promedio (vueltas en el rango; vacío si el stock promedio es 0).
 *   Demanda: Alta = en el 25 % superior de salidas netas; Baja = salidas > 0 en el 25 % inferior; Sin movimiento = 0 salidas; Media = el resto.
 * RECAUDADO por categoría de producto = ventas rápidas al contado (FinVentaItem, sin ITBIS, menos devoluciones de notas de crédito sobre esas ventas) + artículos cargados al alumno desde el
 * Expediente (ServicioAlumno.productoId → cargo srv → líneas de recibos vigentes, netas de descuento). El ITBIS de las ventas va en su propia fila para cuadrar con Recaudación (informe 5).
 * Rango: filtros desde/hasta; sin ellos, las fechas del ciclo. Ventas del ciclo = FinVenta.cicloId (o, en datos anteriores, el rango de fechas del ciclo).
 */
const parseQ = (q: string, tipo: string): number => {
  const n = parseInt(String(q).replace(/[−–—]/g, '-').replace('+', '').trim(), 10);
  if (!Number.isFinite(n)) return 0;
  return tipo === 'Salida' ? -Math.abs(n) : n;
};
const sumaDia = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const objetivo = (nombre: string) => (/uniforme/i.test(nombre) ? 'Uniformes' : /libro/i.test(nombre) ? 'Libros' : /papeler|[uú]til/i.test(nombre) ? 'Papelería / Útiles' : null);

export async function informeInventario(f: Filtros): Promise<InformeResp> {
  const desde = f.desde ?? f.ciclo.fechaInicio, hasta = f.hasta ?? f.ciclo.fechaFin;
  const rango = { gte: inicioDia(desde, f.tz), lt: inicioDia(sumaDia(hasta, 1), f.tz) };
  const filtroRango = rangoCreado(f); // solo si el usuario puso fechas (para recibos de artículos cargados)
  const prods = await prisma.finProducto.findMany({ where: f.categoria ? { categoriaId: f.categoria } : {}, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, price: true, stock: true, categoriaId: true, categoria: { select: { nombre: true } } } });
  const conStock = prods.filter(p => p.stock != null), sinStock = prods.length - conStock.length;
  const catDe = new Map(prods.map(p => [p.id, { id: p.categoriaId, nombre: p.categoria.nombre }]));

  // ---- Movimientos desde el inicio del rango (todos, para reconstruir el stock inicial) de los productos con stock
  const movs: { id: number; productoId: string; tipo: string; ref: string; createdAt: Date; cant: number; resultante: number | null }[] = [];
  for (const ch of trozos(conStock.map(p => p.id), 500)) {
    for (const m of await prisma.finMovimiento.findMany({ where: { productoId: { in: ch }, createdAt: { gte: rango.gte } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, productoId: true, tipo: true, q: true, ref: true, cantidad: true, stockResultante: true, createdAt: true } }))
      movs.push({ id: m.id, productoId: m.productoId, tipo: m.tipo, ref: m.ref, createdAt: m.createdAt, cant: m.cantidad ?? parseQ(m.q, m.tipo), resultante: m.stockResultante });
  }
  const movsPor = new Map<string, typeof movs>();
  for (const m of movs) movsPor.set(m.productoId, [...(movsPor.get(m.productoId) ?? []), m]);

  interface Rot { p: (typeof conStock)[number]; ini: number; fin: number; entradas: number; salidas: number; devol: number; netas: number; prom: number; rot: number | null; enRango: typeof movs; demanda: string; resultanteDe: Map<number, number> }
  const rots: Rot[] = conStock.map(p => {
    const l = movsPor.get(p.id) ?? [], actual = p.stock!;
    const ini = actual - l.reduce((a, m) => a + m.cant, 0);
    const enRango = l.filter(m => m.createdAt < rango.lt);
    const entradas = enRango.filter(m => m.tipo === 'Entrada').reduce((a, m) => a + m.cant, 0), salidas = -enRango.filter(m => m.tipo === 'Salida').reduce((a, m) => a + m.cant, 0), devol = enRango.filter(m => m.tipo === 'Devolución').reduce((a, m) => a + m.cant, 0);
    const fin = ini + enRango.reduce((a, m) => a + m.cant, 0), prom = (ini + fin) / 2, netas = salidas - devol;
    // stock resultante tras cada movimiento (guardado o reconstruido hacia atrás desde el stock actual)
    const resultanteDe = new Map<number, number>();
    let despues = actual;
    for (let i = l.length - 1; i >= 0; i--) { resultanteDe.set(l[i].id, l[i].resultante ?? despues); despues -= l[i].cant; }
    return { p, ini, fin, entradas, salidas, devol, netas, prom, rot: prom > 0 ? round2(netas / prom) : null, enRango, demanda: '', resultanteDe };
  });
  // Demanda por cuartiles de salidas netas entre los productos con stock
  const orden = rots.map(r => r.netas).sort((a, b) => a - b);
  const q = (x: number) => orden.length ? orden[Math.min(orden.length - 1, Math.floor(x * (orden.length - 1)))] : 0;
  const q1 = q(0.25), q3 = q(0.75);
  for (const r of rots) r.demanda = r.netas <= 0 ? 'Sin movimiento' : r.netas >= q3 && q3 > 0 ? 'Alta' : r.netas <= q1 ? 'Baja' : 'Media';
  const porDemanda = [...rots].sort((a, b) => b.netas - a.netas || a.p.name.localeCompare(b.p.name, 'es'));

  // ---- Recaudado por categoría
  const ventaWhere = { OR: [{ cicloId: f.ciclo.id }, { cicloId: null, createdAt: { gte: inicioDia(f.ciclo.fechaInicio, f.tz), lt: inicioDia(sumaDia(f.ciclo.fechaFin, 1), f.tz) } }], createdAt: rango };
  const itbisRate = Number(((await cfgGet('finanzas')) as { itbis?: number })?.itbis ?? 0.18);
  const [items, ventasAgg, devLineas, recLineas, pendCargos] = await Promise.all([
    prisma.finVentaItem.findMany({ where: { venta: { is: ventaWhere }, ...(f.categoria ? { producto: { is: { categoriaId: f.categoria } } } : {}) }, select: { productoId: true, nombre: true, cantidad: true, precio: true, tax: true, producto: { select: { categoriaId: true, categoria: { select: { nombre: true } } } } } }),
    prisma.finVenta.aggregate({ where: ventaWhere, _sum: { total: true }, _count: { _all: true } }),
    prisma.notaFiscalLinea.findMany({ where: { efecto: 'Devolucion', productoId: { not: null }, ...(f.categoria ? { producto: { is: { categoriaId: f.categoria } } } : {}), nota: { is: { clase: 'CREDITO', estado: 'Emitida', venta: { is: ventaWhere } } } }, select: { monto: true, cantidad: true, producto: { select: { tax: true, categoriaId: true, categoria: { select: { nombre: true } } } } } }),
    prisma.finReciboItem.findMany({
      where: { recibo: { is: { est: { not: 'Anulado' }, ...(filtroRango ? { createdAt: filtroRango } : {}) } }, cobroItem: { is: { cicloId: f.ciclo.id, servicio: { is: { productoId: f.categoria ? { not: null } : { not: null }, ...(f.categoria ? { producto: { is: { categoriaId: f.categoria } } } : {}) } } } } },
      select: { monto: true, descuento: true, cobroItem: { select: { servicio: { select: { productoId: true, producto: { select: { name: true, categoriaId: true, categoria: { select: { nombre: true } } } } } } } } },
    }),
    prisma.finCobroItem.findMany({ where: { cicloId: f.ciclo.id, paid: false, servicio: { is: { productoId: { not: null }, ...(f.categoria ? { producto: { is: { categoriaId: f.categoria } } } : {}) } } }, select: { monto: true, servicio: { select: { producto: { select: { categoriaId: true, categoria: { select: { nombre: true } } } } } } } }),
  ]);
  interface Cat { id: string; nombre: string; ventas: number; unid: number; dev: number; cargados: number; pend: number; prod: Map<string, { nombre: string; unid: number; ventas: number; cargados: number }> }
  const cats = new Map<string, Cat>();
  const cat = (id: string, nombre: string) => { let c = cats.get(id); if (!c) { c = { id, nombre, ventas: 0, unid: 0, dev: 0, cargados: 0, pend: 0, prod: new Map() }; cats.set(id, c); } return c; };
  const prod = (c: Cat, pid: string, nombre: string) => { let x = c.prod.get(pid); if (!x) { x = { nombre, unid: 0, ventas: 0, cargados: 0 }; c.prod.set(pid, x); } return x; };
  for (const it of items) { const c = cat(it.producto.categoriaId, it.producto.categoria.nombre), v = round2(it.precio * it.cantidad); c.ventas += v; c.unid += it.cantidad; const p = prod(c, it.productoId, it.nombre); p.ventas += v; p.unid += it.cantidad; }
  // La devolución de una nota de crédito incluye el ITBIS de los artículos gravados: aquí se resta la BASE y el ITBIS devuelto se resta en la fila de ITBIS.
  let itbisDevuelto = 0;
  for (const d of devLineas) { const c = cat(d.producto!.categoriaId, d.producto!.categoria.nombre), base = d.producto!.tax ? d.monto / (1 + itbisRate) : d.monto; c.dev += base; itbisDevuelto += d.monto - base; }
  const itbisImplicitoCalc = round2(items.filter(i => i.tax).reduce((a, i) => a + i.precio * i.cantidad, 0) * itbisRate);
  for (const l of recLineas) { const pr = l.cobroItem?.servicio?.producto; if (!pr) continue; const c = cat(pr.categoriaId, pr.categoria.nombre), v = round2(l.monto - (l.descuento ?? 0)); c.cargados += v; prod(c, l.cobroItem!.servicio!.productoId!, pr.name).cargados += v; }
  for (const c of pendCargos) { const pr = c.servicio?.producto; if (pr) cat(pr.categoriaId, pr.categoria.nombre).pend += c.monto; }
  // Las tres categorías pedidas aparecen siempre
  const todasCats = await prisma.categoriaProducto.findMany({ select: { id: true, nombre: true } });
  for (const c of todasCats) if (objetivo(c.nombre) && (!f.categoria || f.categoria === c.id)) cat(c.id, c.nombre);
  const catOrden = [...cats.values()].sort((a, b) => (objetivo(a.nombre) ? 0 : 1) - (objetivo(b.nombre) ? 0 : 1) || (b.ventas + b.cargados) - (a.ventas + a.cargados) || a.nombre.localeCompare(b.nombre, 'es'));
  const totalCat = (c: Cat) => round2(c.ventas - c.dev + c.cargados);
  const sumLineas = round2([...cats.values()].reduce((a, c) => a + c.ventas, 0));
  const itbisBruto = round2((ventasAgg._sum.total ?? 0) - sumLineas);
  const itbisVentas = f.categoria ? 0 : round2(itbisBruto - itbisDevuelto);
  const filasRec = catOrden.map(c => [c.nombre + (objetivo(c.nombre) ? ' ★' : ''), round2(c.unid), round2(c.ventas), round2(c.dev), round2(c.cargados), totalCat(c), round2(c.pend)] as InformeCelda[]);
  if (itbisVentas !== 0) filasRec.push(['ITBIS de ventas rápidas (para cuadrar)', null, itbisVentas, null, null, itbisVentas, null]);
  const detRec: InformeCelda[][][] = catOrden.map(c => [...c.prod.values()].sort((a, b) => (b.ventas + b.cargados) - (a.ventas + a.cargados)).map(p => [p.nombre, p.unid, round2(p.ventas), round2(p.cargados), round2(p.ventas + p.cargados)] as InformeCelda[]));
  if (itbisVentas !== 0) detRec.push([]);
  const sumC = (k: 'ventas' | 'dev' | 'cargados' | 'pend') => round2(catOrden.reduce((a, c) => a + c[k], 0));
  const totalRec = round2(sumC('ventas') - sumC('dev') + sumC('cargados') + itbisVentas);
  const tres = round2(catOrden.filter(c => objetivo(c.nombre)).reduce((a, c) => a + totalCat(c), 0));

  // ---- Valor de inventario por categoría
  const porCatInv = new Map<string, { nombre: string; prods: number; conStock: number; unid: number; valor: number }>();
  for (const p of prods) { const e = porCatInv.get(p.categoriaId) ?? { nombre: p.categoria.nombre, prods: 0, conStock: 0, unid: 0, valor: 0 }; e.prods++; if (p.stock != null) { e.conStock++; e.unid += p.stock; e.valor += p.stock * p.price; } porCatInv.set(p.categoriaId, e); }
  const filasInv = [...porCatInv.values()].sort((a, b) => b.valor - a.valor).map(e => [e.nombre, e.prods, e.conStock, e.unid, round2(e.valor)] as InformeCelda[]);
  const valorTotal = round2([...porCatInv.values()].reduce((a, e) => a + e.valor, 0)), unidTotal = [...porCatInv.values()].reduce((a, e) => a + e.unid, 0);

  // ---- Tablas de productos
  const colsRot = [col('code', 'Código'), col('prod', 'Producto'), col('cat', 'Categoría'), col('ini', 'Stock inicial', 'entero'), col('ent', 'Entradas', 'entero'), col('sal', 'Salidas', 'entero'), col('dev', 'Devoluciones', 'entero'), col('net', 'Salidas netas', 'entero'), col('fin', 'Stock final', 'entero'), col('act', 'Stock actual', 'entero'), col('prom', 'Stock promedio', 'decimal'), col('rot', 'Rotación (vueltas)', 'decimal'), col('dem', 'Demanda'), col('val', 'Valor en stock', 'moneda')];
  const filaRot = (r: Rot) => [r.p.code, r.p.name, r.p.categoria.nombre, r.ini, r.entradas, r.salidas, r.devol, r.netas, r.fin, r.p.stock, round2(r.prom), r.rot, r.demanda, round2((r.p.stock ?? 0) * r.p.price)] as InformeCelda[];
  const rotOrden = [...rots].sort((a, b) => a.p.categoria.nombre.localeCompare(b.p.categoria.nombre, 'es') || b.netas - a.netas || a.p.name.localeCompare(b.p.name, 'es'));
  const detRot = rotOrden.map(r => r.enRango.slice(-40).reverse().map(m => [fechaDMY(m.createdAt, f.tz), m.tipo, m.ref, m.cant, r.resultanteDe.get(m.id) ?? null] as InformeCelda[]));
  const colsTop = [col('prod', 'Producto'), col('cat', 'Categoría'), col('net', 'Salidas netas', 'entero'), col('rot', 'Rotación (vueltas)', 'decimal'), col('act', 'Stock actual', 'entero'), col('dem', 'Demanda')];
  const filaTop = (r: Rot) => [r.p.name, r.p.categoria.nombre, r.netas, r.rot, r.p.stock, r.demanda] as InformeCelda[];
  const sinMov = rots.filter(r => r.netas <= 0 && r.salidas === 0 && (r.p.stock ?? 0) > 0).sort((a, b) => ((b.p.stock ?? 0) * b.p.price) - ((a.p.stock ?? 0) * a.p.price));
  const todosMov = rots.flatMap(r => r.enRango.map(m => ({ m, r }))).sort((a, b) => b.m.createdAt.getTime() - a.m.createdAt.getTime() || b.m.id - a.m.id);
  const filasMov = todosMov.map(({ m, r }) => [fechaDMY(m.createdAt, f.tz), r.p.code, r.p.name, m.tipo, m.ref, m.cant, r.resultanteDe.get(m.id) ?? null] as InformeCelda[]);

  // ---- Cuadre con Recaudación (ventas rápidas)
  const ventasTotal = round2(ventasAgg._sum.total ?? 0);
  const filasCuadre: InformeCelda[][] = f.categoria ? [] : [
    ['Artículos de ventas rápidas + ITBIS vs total de ventas rápidas (informe 5, por fecha)', round2(sumLineas + itbisBruto), ventasTotal, round2(sumLineas + itbisBruto - ventasTotal)],
    [`ITBIS de las ventas (total − artículos) vs ITBIS calculado con la tasa actual (${+(itbisRate * 100).toFixed(2)} %) sobre los artículos gravados`, itbisBruto, itbisImplicitoCalc, round2(itbisBruto - itbisImplicitoCalc)],
  ];

  const salidasTot = rots.reduce((a, r) => a + r.salidas, 0), netasTot = rots.reduce((a, r) => a + r.netas, 0);
  return {
    id: 'inventario-rotacion', titulo: 'Inventario y tienda: rotación y recaudado', grupo: 'inf-inventario', ciclo: f.ciclo.nombre, generado: hoyDMY(f.tz),
    filtros: [...(await etiquetasFiltros(f, ['ciclo', 'desde', 'hasta', 'categoria'])), ...(!f.desde && !f.hasta ? [{ etiqueta: 'Rango', valor: `${desde.split('-').reverse().join('/')} a ${hasta.split('-').reverse().join('/')} (fechas del ciclo)` }] : [])],
    resumen: [
      { id: 'tres', etiqueta: 'Recaudado: Uniformes + Libros + Papelería/Útiles', valor: tres, tipo: 'moneda', tono: 'ok' },
      { id: 'rec', etiqueta: 'Recaudado total en tienda (con ITBIS)', valor: totalRec, tipo: 'moneda' },
      { id: 'sal', etiqueta: 'Unidades salidas netas', valor: netasTot, tipo: 'entero', tono: 'info' },
      { id: 'prod', etiqueta: 'Productos con control de stock', valor: conStock.length, tipo: 'entero' },
      { id: 'sin', etiqueta: 'Sin movimiento (con stock)', valor: sinMov.length, tipo: 'entero', tono: sinMov.length ? 'warn' : undefined },
      { id: 'uni', etiqueta: 'Unidades en stock', valor: unidTotal, tipo: 'entero' },
      { id: 'val', etiqueta: 'Valor del inventario (a precio de venta)', valor: valorTotal, tipo: 'moneda' },
      { id: 'pen', etiqueta: 'Artículos cargados pendientes de cobro', valor: sumC('pend'), tipo: 'moneda', tono: sumC('pend') ? 'warn' : undefined },
    ],
    tablas: [
      tablaMem(f, 'recaudado', 'Total recaudado por categoría (★ = Uniformes, Libros, Papelería/Útiles)', [col('cat', 'Categoría'), col('unid', 'Unidades vendidas (rápidas)', 'entero'), col('ventas', 'Ventas rápidas', 'moneda'), col('dev', 'Devoluciones', 'moneda'), col('carg', 'Artículos cargados (cobrado)', 'moneda'), col('total', 'Total recaudado', 'moneda'), col('pend', 'Cargado pendiente de cobro', 'moneda')], filasRec,
        { totales: ['TOTAL', round2(catOrden.reduce((a, c) => a + c.unid, 0)), round2(sumC('ventas') + itbisVentas), sumC('dev'), sumC('cargados'), totalRec, sumC('pend')], vacio: 'No hay ventas ni artículos cargados en el rango.',
          detalle: { titulo: 'Por producto', columnas: [col('prod', 'Producto'), col('unid', 'Unidades (rápidas)', 'entero'), col('ventas', 'Ventas rápidas', 'moneda'), col('carg', 'Cargado a alumnos (cobrado)', 'moneda'), col('total', 'Total', 'moneda')], porFila: detRec } }),
      tablaMem(f, 'categorias', 'Inventario actual por categoría', [col('cat', 'Categoría'), col('prods', 'Productos', 'entero'), col('con', 'Con control de stock', 'entero'), col('uni', 'Unidades en stock', 'entero'), col('val', 'Valor a precio de venta', 'moneda')], filasInv,
        { totales: ['TOTAL', prods.length, conStock.length, unidTotal, valorTotal], vacio: 'No hay productos.' }),
      { ...tablaMem(f, 'rotacion', 'Rotación por producto', colsRot, rotOrden.map(filaRot), { paginable: true, vacio: 'No hay productos con control de stock.',
          totales: ['', 'TOTAL', '', rots.reduce((a, r) => a + r.ini, 0), rots.reduce((a, r) => a + r.entradas, 0), salidasTot, rots.reduce((a, r) => a + r.devol, 0), netasTot, rots.reduce((a, r) => a + r.fin, 0), unidTotal, null, null, '', valorTotal],
          detalle: { titulo: 'Últimos movimientos del producto en el rango', columnas: [col('fecha', 'Fecha'), col('tipo', 'Tipo'), col('ref', 'Referencia'), col('cant', 'Cantidad', 'entero'), col('res', 'Stock resultante', 'entero')], porFila: detRot } }), pdfMax: 75 },
      tablaMem(f, 'alta', 'Alta demanda (10 con más salidas netas)', colsTop, porDemanda.filter(r => r.netas > 0).slice(0, 10).map(filaTop), { vacio: 'No hubo salidas en el rango.' }),
      tablaMem(f, 'baja', 'Baja demanda (10 con menos salidas netas)', colsTop, [...porDemanda].reverse().slice(0, 10).map(filaTop), { vacio: 'No hay productos con control de stock.' }),
      { ...tablaMem(f, 'sinmov', 'Productos sin movimiento (con stock)', [col('code', 'Código'), col('prod', 'Producto'), col('cat', 'Categoría'), col('act', 'Stock actual', 'entero'), col('val', 'Valor en stock', 'moneda')], sinMov.map(r => [r.p.code, r.p.name, r.p.categoria.nombre, r.p.stock, round2((r.p.stock ?? 0) * r.p.price)] as InformeCelda[]), { paginable: true, vacio: 'Todos los productos con stock tuvieron salidas en el rango.' }), pdfMax: 75 },
      { ...tablaMem(f, 'movimientos', 'Detalle de movimientos', [col('fecha', 'Fecha'), col('code', 'Código'), col('prod', 'Producto'), col('tipo', 'Tipo'), col('ref', 'Referencia'), col('cant', 'Cantidad', 'entero'), col('res', 'Stock resultante', 'entero')], filasMov, { paginable: true, vacio: 'No hay movimientos de inventario en el rango.' }), pdfMax: 75 },
      tablaMem(f, 'cuadre', 'Cuadre con Recaudación', [col('c', 'Comparación'), col('mio', 'Este informe', 'moneda'), col('ref', 'Referencia', 'moneda'), col('dif', 'Diferencia', 'moneda')], filasCuadre, { vacio: 'El cuadre solo se calcula sin filtro de categoría.' }),
    ],
    notas: [
      'Rotación: solo para productos con control de stock (los servicios, actividades y paquetes sin stock no generan movimientos y no tienen rotación). Salidas netas = salidas (ventas rápidas y artículos cargados al alumno) − devoluciones; Rotación = salidas netas / stock promedio, con stock promedio = (stock inicial + stock final) / 2 del rango. El stock inicial se reconstruye hacia atrás desde el stock actual con los movimientos (todo cambio de stock queda en un movimiento).',
      `Demanda: Alta = salidas netas en el 25 % superior; Baja = el 25 % inferior con salidas; Sin movimiento = ninguna salida. Con pocos datos (${rots.length} productos con stock) los cuartiles son poco robustos: úsalos como orientación.`,
      'Recaudado = ventas rápidas al contado (artículos sin ITBIS, menos devoluciones por nota de crédito) + artículos cargados al alumno desde el Expediente y ya cobrados (importe de las líneas de recibos vigentes, neto de descuento). Las devoluciones se restan sin ITBIS (el ITBIS devuelto reduce la fila de ITBIS). Los cargos aún sin cobrar se muestran aparte como pendiente. La fila de ITBIS cuadra el total con las ventas rápidas de Recaudación (informe 5).',
      'Los precios son de venta: el sistema no guarda costo de compra, así que no hay margen. «Papelería / Útiles» agrupa la categoría Papelería (y cualquier categoría cuyo nombre contenga «útil»).',
      f.desde || f.hasta ? 'Con un rango de fechas, el cobrado de artículos cargados se cuenta por fecha del recibo; el pendiente de cobro es el del ciclo completo.' : `Sin fechas, el rango es el del ciclo (${desde} a ${hasta}).`,
      sinStock ? `${sinStock} producto(s) del filtro no manejan stock (no aparecen en rotación ni en movimientos), pero sí cuentan en lo recaudado.` : 'Todos los productos del filtro manejan stock.',
    ],
  };
}
