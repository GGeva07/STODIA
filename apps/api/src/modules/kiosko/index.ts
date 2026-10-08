import type { FastifyPluginAsync } from 'fastify';
import type { Movimiento, ProductoFin, VentaReq, VentaRes } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { nextSeq, nowHM, round2 } from '../../fin-utils';
import { cfgGet } from '../../lib/sisconfig';

const toMov = (m: any): Movimiento => ({ id: m.id, t: m.t, tipo: m.tipo, name: m.name, q: m.q, ref: m.ref });

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/productos', auth, async () => (await prisma.finProducto.findMany({ orderBy: { code: 'asc' } })) as ProductoFin[]);
  app.get('/movimientos', auth, async () => (await prisma.finMovimiento.findMany({ orderBy: { id: 'desc' }, take: 12 })).map(toMov));

  app.post<{ Body: VentaReq }>('/ventas', auth, async (req, reply) => {
    const { items, doc, rnc, razon, pay, recv } = req.body;
    const prods = await prisma.finProducto.findMany({ where: { id: { in: items.map(i => i.id) } } });
    const lines = items.filter(i => i.q > 0).map(i => ({ p: prods.find(p => p.id === i.id), q: i.q }));
    if (!lines.length || lines.some(l => !l.p)) return reply.code(400).send({ error: 'El carrito está vacío' });
    const rows = lines.map(l => ({ p: l.p!, q: l.q }));
    for (const { p, q } of rows) if (p.stock != null && q > p.stock) return reply.code(409).send({ error: `Solo hay ${p.stock} unidades de ${p.name}` });
    const cf2 = doc === 'cf2';
    if (cf2 && rnc.replace(/\D/g, '').length !== 9) return reply.code(400).send({ error: 'Crédito fiscal: RNC de 9 dígitos obligatorio' });
    if (cf2 && !razon.trim()) return reply.code(400).send({ error: 'Indica la razón social' });
    const itbisRate = (await cfgGet('finanzas')).itbis;
    const sub = rows.reduce((a, l) => a + l.p.price * l.q, 0);
    const itbis = round2(rows.filter(l => l.p.tax).reduce((a, l) => a + l.p.price * l.q, 0) * itbisRate);
    const total = sub + itbis;
    const recvN = parseFloat(recv) || 0, cash = pay === 'Efectivo';
    if (cash && recv && recvN < total) return reply.code(400).send({ error: 'El efectivo recibido no cubre el total' });
    const id = 'VTA-' + String(await nextSeq('vta')).padStart(4, '0');
    const ncf = cf2 ? 'B01' + String(await nextSeq('b01')).padStart(8, '0') : 'B02' + String(await nextSeq('ncf')).padStart(8, '0');
    const got = cash && recvN > 0 ? recvN : total, change = cash && recvN > total ? round2(recvN - total) : 0;
    const hora = nowHM();
    for (const { p, q } of rows) {
      if (p.stock == null) continue;
      await prisma.finProducto.update({ where: { id: p.id }, data: { stock: p.stock - q } });
      await prisma.finMovimiento.create({ data: { t: hora, tipo: 'Salida', name: p.name, q: '−' + q, ref: id } });
    }
    await prisma.finVenta.create({ data: { id, ncf, total, metodo: pay, doc } });
    const res: VentaRes = {
      id, ncf, total, change, recv: got, hora, pay, cliente: cf2 ? razon.trim() + ' · RNC ' + rnc : 'Consumidor final',
      items: rows.map(l => ({ con: l.q + ' × ' + l.p.name, monto: l.p.price * l.q })).concat(itbis ? [{ con: 'ITBIS ' + +(itbisRate * 100).toFixed(2) + '%', monto: itbis }] : []),
    };
    await audit(req.user, 'Insert', { tabla: 'Ventas', id, next: `${ncf} · ${pay} · $${total}`, ip: req.ip });
    return res;
  });

  app.post<{ Body: { id: string; qty: number } }>('/entradas', auth, async (req, reply) => {
    const p = await prisma.finProducto.findUnique({ where: { id: req.body.id } });
    if (!p || p.stock == null) return reply.code(400).send({ error: 'Ese artículo no maneja inventario' });
    const q = Math.floor(Number(req.body.qty));
    if (!(q > 0)) return reply.code(400).send({ error: 'Cantidad inválida' });
    await prisma.finProducto.update({ where: { id: p.id }, data: { stock: p.stock + q } });
    const n = await nextSeq('ent');
    await prisma.finMovimiento.create({ data: { t: nowHM(), tipo: 'Entrada', name: p.name, q: '+' + q, ref: 'ENT-' + String(n).padStart(4, '0') } });
    await audit(req.user, 'Update', { tabla: 'Inventario', id: p.id, prev: p.stock, next: p.stock + q, ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
