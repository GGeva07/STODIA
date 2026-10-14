import type { FastifyPluginAsync } from 'fastify';
import type { Movimiento, ProductoFin, VentaReq, VentaRes } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { rncValido } from '../../lib/rnc';
import { nextSeq, nowHM, round2 } from '../../fin-utils';
import { cfgGet } from '../../lib/sisconfig';
import { cicloActivoRow } from '../../lib/ciclo';
import { metodoCatalogo } from '../../lib/recibos';
import { consultarDgii, proveedorTutor, proveedorHistorial, soloDigitos, longitudRncOk } from '../../lib/rnc-lookup';
import { FiscalError, alertaSecuencia, asignarNcf, contextoFiscal, disponibilidad, refrescarEstados, enSerie, transaccionFiscal } from '../../lib/fiscal';

const toMov = (m: any): Movimiento => ({ id: m.id, t: m.t, tipo: m.tipo, name: m.name, q: m.q, ref: m.ref });

/** Lineas del carrito contra el catalogo (venta al contado): articulos existentes, cantidad > 0 y stock suficiente (stock null = ilimitado/servicio). */
async function resolverLineas(items: { id: string; q: number }[]): Promise<{ rows: { p: Awaited<ReturnType<typeof prisma.finProducto.findMany>>[number]; q: number }[] } | { code: 400 | 409; error: string }> {
  const prods = await prisma.finProducto.findMany({ where: { id: { in: items.map(i => i.id) } } });
  const lines = items.filter(i => i.q > 0).map(i => ({ p: prods.find(p => p.id === i.id), q: i.q }));
  if (!lines.length || lines.some(l => !l.p)) return { code: 400, error: 'El carrito está vacío' };
  const rows = lines.map(l => ({ p: l.p!, q: l.q }));
  for (const { p, q } of rows) if (p.stock != null && q > p.stock) return { code: 409, error: `Solo hay ${p.stock} unidades de ${p.name}` };
  return { rows };
}

/** Estado de un RNC/cédula para Crédito fiscal en Venta Rápida. DGII manda: 404 = no existe (bloquea); API caída/sin configurar = 'indisponible' (best-effort, cae a tutores/historial). */
export type RncKiosko = { rnc: string; estado: 'ok' | 'no-encontrado' | 'indisponible' | 'longitud'; razonSocial?: string; fuente?: 'dgii' | 'tutor' | 'historial'; estadoDgii?: string; activo?: boolean };
async function validarRncKiosko(entrada: unknown): Promise<RncKiosko> {
  const rnc = soloDigitos(entrada);
  if (!longitudRncOk(rnc)) return { rnc, estado: 'longitud' };
  const d = await consultarDgii(rnc);
  if (d.tipo === 'ok') return { rnc, estado: 'ok', razonSocial: d.razonSocial, fuente: 'dgii', estadoDgii: d.estado, activo: d.activo };
  for (const p of [proveedorTutor, proveedorHistorial]) {
    const r = await p.consultar(rnc).catch(() => null);
    if (r) return { rnc, estado: 'ok', razonSocial: r.razonSocial, fuente: p.id as 'tutor' | 'historial' };
  }
  return { rnc, estado: d.tipo === 'no-encontrado' ? 'no-encontrado' : 'indisponible' };
}

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/productos', auth, async (): Promise<ProductoFin[]> =>
    (await prisma.finProducto.findMany({ orderBy: { code: 'asc' }, include: { categoria: true } })).map(p => ({ id: p.id, code: p.code, name: p.name, cat: p.categoria.nombre, price: p.price, tax: p.tax, stock: p.stock, icon: p.icon })));
  app.get<{ Params: { rnc: string } }>('/rnc/:rnc', auth, async (req): Promise<RncKiosko> => validarRncKiosko(req.params.rnc));
  app.get('/movimientos', auth, async () => (await prisma.finMovimiento.findMany({ orderBy: { id: 'desc' }, take: 12 })).map(toMov));

  app.post<{ Body: VentaReq }>('/ventas', auth, (req, reply) => enSerie(async () => {
    if (!(await cfgGet('papeleriaAbierta'))) return reply.code(409).send({ error: 'La papelería no está abierta al público. Los artículos se cargan al alumno desde su expediente; actívala en Configuración › Finanzas si el colegio vende al público.' });
    const { items, doc, rnc, razon, pay, recv } = req.body;
    const r = await resolverLineas(items);
    if (!('rows' in r)) return reply.code(r.code).send({ error: r.error });
    const rows = r.rows;
    const cf2 = doc === 'cf2';
    if (cf2 && !rncValido(rnc)) return reply.code(400).send({ error: 'Crédito fiscal: RNC de 9 u 11 dígitos obligatorio' });
    if (cf2 && !razon.trim()) return reply.code(400).send({ error: 'Indica la razón social' });
    if (cf2 && (await validarRncKiosko(rnc)).estado === 'no-encontrado') return reply.code(400).send({ error: 'El RNC no existe en el registro de la DGII' });
    const itbisRate = (await cfgGet('finanzas')).itbis;
    const sub = rows.reduce((a, l) => a + l.p.price * l.q, 0);
    const itbis = round2(rows.filter(l => l.p.tax).reduce((a, l) => a + l.p.price * l.q, 0) * itbisRate);
    const total = sub + itbis;
    const recvN = parseFloat(recv) || 0, cash = pay === 'Efectivo';
    if (cash && recv && recvN < total) return reply.code(400).send({ error: 'El efectivo recibido no cubre el total' });
    const id = 'VTA-' + String(await nextSeq('vta')).padStart(4, '0');
    // Mismo servicio que Cobros: B01/E31 (credito fiscal) o B02/E32 (consumo) segun la modalidad configurada; el numero se consume dentro de la transaccion de la venta.
    const logico = cf2 ? 'CREDITO_FISCAL' : 'CONSUMO';
    await refrescarEstados();
    const disp = (await disponibilidad(prisma, [logico]))[0];
    if (!disp.disponible) throw new FiscalError(409, disp.motivo!);
    const ctxFiscal = await contextoFiscal(logico);
    let ncf = '', secId = '';
    const got = cash && recvN > 0 ? recvN : total, change = cash && recvN > total ? round2(recvN - total) : 0;
    const hora = nowHM();
    const metodo = await metodoCatalogo(pay);
    if (!metodo) return reply.code(400).send({ error: 'Medio de pago no configurado' });
    const cicloVenta = (await cicloActivoRow())?.id ?? null; // Informes: la venta rapida pertenece al ciclo ACTIVO al vender
    // Venta, lineas y salidas de inventario en UNA transaccion; la venta se crea primero porque las lineas y movimientos la referencian por FK.
    await transaccionFiscal(async tx => {
      const asig = await asignarNcf(tx, logico, ctxFiscal);
      ncf = asig.ncf; secId = asig.secuenciaFiscalId;
      await tx.finVenta.create({ data: { id, ncf, total, metodo: metodo.nombre, metodoPagoId: metodo.id, doc, cajeroId: req.user.sub, cicloId: cicloVenta } });
      await tx.finVentaItem.createMany({ data: rows.map(({ p, q }) => ({ ventaId: id, productoId: p.id, nombre: p.name, cantidad: q, precio: p.price, tax: p.tax })) });
      for (const { p, q } of rows) {
        if (p.stock == null) continue;
        await tx.finProducto.update({ where: { id: p.id }, data: { stock: p.stock - q } });
        await tx.finMovimiento.create({ data: { t: hora, tipo: 'Salida', productoId: p.id, name: p.name, q: '−' + q, ref: id, ventaId: id, cantidad: -q, stockResultante: p.stock - q } });
      }
    });
    const alerta = await alertaSecuencia(secId);
    const res: VentaRes = {
      ...(alerta ? { alertaSecuencia: alerta } : {}),
      id, ncf, total, change, recv: got, hora, pay, cliente: cf2 ? razon.trim() + ' · RNC ' + rnc : 'Consumidor final',
      items: rows.map(l => ({ con: l.q + ' × ' + l.p.name, monto: l.p.price * l.q })).concat(itbis ? [{ con: 'ITBIS ' + +(itbisRate * 100).toFixed(2) + '%', monto: itbis }] : []),
    };
    await audit(req.user, 'Insert', { tabla: 'Ventas', id, next: `${ncf} · ${pay} · $${total}`, ip: req.ip });
    return res;
  }));

  app.post<{ Body: { id: string; qty: number } }>('/entradas', auth, async (req, reply) => {
    const p = await prisma.finProducto.findUnique({ where: { id: req.body.id } });
    if (!p || p.stock == null) return reply.code(400).send({ error: 'Ese artículo no maneja inventario' });
    const q = Math.floor(Number(req.body.qty));
    if (!(q > 0)) return reply.code(400).send({ error: 'Cantidad inválida' });
    await prisma.finProducto.update({ where: { id: p.id }, data: { stock: p.stock + q } });
    const n = await nextSeq('ent');
    await prisma.finMovimiento.create({ data: { t: nowHM(), tipo: 'Entrada', productoId: p.id, name: p.name, q: '+' + q, ref: 'ENT-' + String(n).padStart(4, '0'), cantidad: q, stockResultante: p.stock + q } });
    await audit(req.user, 'Update', { tabla: 'Inventario', id: p.id, prev: p.stock, next: p.stock + q, ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
