import type { FastifyPluginAsync } from 'fastify';
import type { CobroCuenta, CobroItem, CobroProcesarReq, ReciboFin } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { nextSeq, nowHM, round2, supervisorOk } from '../../fin-utils';

const REFS: Record<string, string | null> = { 'Efectivo': null, 'Tarjeta de Crédito': 'Autorización', 'Tarjeta de Débito': 'Autorización', 'Transferencia': 'Ref. bancaria', 'Cheque': 'No. cheque' };
const TUTOR = 'Carlos Mendoza Pérez';
const CED = '001-0023940-1';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const toItem = (r: { id: string; con: string; al: string; kid: string; vence: string; monto: number; est: string; tipo: string; abono: boolean }): CobroItem =>
  ({ id: r.id, con: r.con, al: r.al, kid: r.kid, vence: r.vence, monto: r.monto, est: r.est as CobroItem['est'], tipo: r.tipo, abono: r.abono || undefined });
const toRecibo = (r: any): ReciboFin => ({
  id: r.id, ncf: r.ncf, tutor: r.tutor, hora: r.hora, monto: r.monto, est: r.est, metodo: r.metodo, abono: r.abono, saldo: r.saldo,
  nc: r.nc ?? undefined, change: r.change, items: JSON.parse(r.items), pays: JSON.parse(r.pays),
});

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  // Busca por cédula/RNC/matrícula/nombre (el prototipo solo conoce la cuenta de Carlos Mendoza).
  app.get<{ Querystring: { q?: string } }>('/cuenta', auth, async (req, reply) => {
    const q = norm(req.query.q ?? '').replace(/[\s-]/g, '');
    const ok = ['00100239401', 'est0412', 'est20260412', 'est0587', 'mendoza', 'carlos', 'juan', 'sofia'].some(x => q && (x.includes(q) || q.includes(x)));
    if (!ok) return reply.code(404).send({ error: 'Sin coincidencias' });
    const [items, recibos] = await Promise.all([
      prisma.finCobroItem.findMany({ where: { paid: false, tutorCed: CED.replace(/\D/g, '') }, orderBy: { orden: 'asc' } }), // solo la cartera del tutor consultado (la demo es la de Carlos Mendoza)
      prisma.finRecibo.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    const res: CobroCuenta = { tutor: TUTOR, cedula: CED, items: items.map(toItem), recibos: recibos.map(toRecibo) };
    return res;
  });

  app.post<{ Body: CobroProcesarReq }>('/procesar', auth, async (req, reply) => {
    const { ids, discount, pays: rawPays, pin } = req.body;
    const sel = await prisma.finCobroItem.findMany({ where: { id: { in: ids }, paid: false }, orderBy: { orden: 'asc' } });
    if (!sel.length) return reply.code(400).send({ error: 'Selecciona al menos un ítem' });
    if (discount === 'exo' && !(await supervisorOk(req, pin, 'cobro.exonerar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const sub = sel.reduce((a, i) => a + i.monto, 0);
    let desc = 0;
    if (discount === 'pronto') desc = sel.filter(i => i.tipo === 'col' && i.est === 'Pendiente').reduce((a, i) => a + i.monto * 0.05, 0);
    if (discount === 'exo') desc = sel.filter(i => i.tipo === 'mora').reduce((a, i) => a + i.monto, 0);
    const total = round2(sub - desc);
    const pays = rawPays.map(p => ({ m: p.m, r: p.r ?? '', amt: rawPays.length === 1 && p.a === '' ? total : parseFloat(p.a) || 0 }));
    const paid = pays.reduce((a, p) => a + p.amt, 0);
    const nonCash = pays.filter(p => p.m !== 'Efectivo').reduce((a, p) => a + p.amt, 0);
    if (total <= 0 || paid <= 0.001) return reply.code(400).send({ error: 'Ingresa el monto recibido' });
    if (nonCash > total + 0.001) return reply.code(400).send({ error: 'El monto no-efectivo excede el total' });
    if (pays.some(p => REFS[p.m] && !p.r.trim())) return reply.code(400).send({ error: 'Falta la referencia del medio de pago' });

    const remaining = round2(total - paid), change = paid > total ? round2(paid - total) : 0;
    const abono = remaining > 0.001;
    const applied: { con: string; monto: number }[] = [];
    if (abono) {
      let left = paid;
      for (const i of sel) {
        if (left <= 0.001) break;
        const take = Math.min(left, i.monto);
        applied.push({ con: i.con + (take < i.monto - 0.001 ? ' (abono)' : ''), monto: take });
        if (take >= i.monto - 0.001) await prisma.finCobroItem.update({ where: { id: i.id }, data: { paid: true } });
        else await prisma.finCobroItem.update({ where: { id: i.id }, data: { monto: round2(i.monto - take), abono: true } });
        left -= take;
      }
    } else {
      await prisma.finCobroItem.updateMany({ where: { id: { in: sel.map(i => i.id) } }, data: { paid: true } });
    }
    const id = 'REC-0' + (await nextSeq('rec', 418)), ncf = 'B02' + String(await nextSeq('ncf', 1881)).padStart(8, '0');
    const metodo = pays.length > 1 ? 'Mixto' : pays[0].m.startsWith('Tarjeta') ? 'Tarjeta' : pays[0].m;
    const row = await prisma.finRecibo.create({
      data: {
        id, ncf, tutor: TUTOR, hora: nowHM(), monto: abono ? paid : total, metodo, abono, saldo: abono ? remaining : 0,
        change: abono ? 0 : change, items: JSON.stringify(abono ? applied : sel.map(i => ({ con: i.con, monto: i.monto }))), pays: JSON.stringify(pays),
      },
    });
    await audit(req.user, 'Insert', { tabla: 'Recibos', id, next: `${ncf} · ${metodo} · $${row.monto}${abono ? ' (abono)' : ''}`, ip: req.ip });
    return toRecibo(row);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/recibos/:id/anular', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body?.pin, 'recibo.anular'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const r = await prisma.finRecibo.findUnique({ where: { id: req.params.id } });
    if (!r) return reply.code(404).send({ error: 'Recibo no encontrado' });
    if (r.est === 'Anulado') return reply.code(409).send({ error: 'Ya está anulado' });
    const nc = 'B04' + String(await nextSeq('nc', 213)).padStart(8, '0');
    const upd = await prisma.finRecibo.update({ where: { id: r.id }, data: { est: 'Anulado', nc } });
    await audit(req.user, 'Update', { tabla: 'Recibos', id: r.id, prev: r.est, next: 'Anulado · NC ' + nc, ip: req.ip });
    return toRecibo(upd);
  });
};
export default plugin;
