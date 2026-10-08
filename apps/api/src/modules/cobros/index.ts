import type { FastifyPluginAsync } from 'fastify';
import type { CobroCuenta, CobroHijo, CobroMetodo, CobroItem, CobroProcesarReq, ReciboFin } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { cfgGet } from '../../lib/sisconfig';
import { digits, kidOf } from '../../lib/personas';
import { nextSeq, nowHM, round2, supervisorOk } from '../../fin-utils';

/** Medios de pago del Catálogo metodosPago (sembrado en la demo; configurable por instalación). Sin catálogo: solo Efectivo. */
const metodos = async (): Promise<CobroMetodo[]> => {
  const rows = await prisma.catalogo.findMany({ where: { tipo: 'metodosPago', estado: 'Activo' }, orderBy: { id: 'asc' } });
  const l = rows.map(r => JSON.parse(r.data) as { nombre: string; ref?: string | null }).map(d => ({ nombre: d.nombre, ref: d.ref || null }));
  return l.length ? l : [{ nombre: 'Efectivo', ref: null }];
};
/** Recibos recientes que devuelve /cobros/cuenta para el historial del turno del POS. */
const RECIBOS_TURNO = 50;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const toItem = (r: { id: string; con: string; al: string; kid: string; vence: string; monto: number; est: string; tipo: string; abono: boolean }): CobroItem =>
  ({ id: r.id, con: r.con, al: r.al, kid: r.kid, vence: r.vence, monto: r.monto, est: r.est as CobroItem['est'], tipo: r.tipo, abono: r.abono || undefined });
const toRecibo = (r: any): ReciboFin => ({
  id: r.id, ncf: r.ncf, tutor: r.tutor, hora: r.hora, monto: r.monto, est: r.est, metodo: r.metodo, abono: r.abono, saldo: r.saldo,
  nc: r.nc ?? undefined, change: r.change, items: JSON.parse(r.items), pays: JSON.parse(r.pays),
});

const plugin: FastifyPluginAsync = async app => {
  const auth = { onRequest: [app.authenticate] };

  // Busca por cédula/RNC, carnet (matrícula), nombre del tutor o nombre del alumno contra Tutor/Alumno reales (tutor responsable).
  app.get<{ Querystring: { q?: string } }>('/cuenta', auth, async (req, reply) => {
    const q = norm(req.query.q ?? '').trim(), qd = digits(q), qa = q.replace(/[^a-z0-9]/g, '');
    if (q.length < 2) return reply.code(404).send({ error: 'Escribe una cédula, carnet o nombre para buscar' });
    const [tutores, alumnos] = await Promise.all([
      prisma.tutor.findMany({ select: { id: true, nombre: true, cedula: true, rnc: true, email: true } }),
      prisma.alumno.findMany({ select: { id: true, code: true, nombres: true, apellidos: true, tutorId: true } }),
    ]);
    // Puntaje de coincidencia: cédula/RNC o carnet exactos > carnet parcial > nombre del tutor > nombre del alumno.
    const cand = new Map<string, number>();
    const bump = (tid: string | null, n: number) => { if (tid && n > (cand.get(tid) ?? 0)) cand.set(tid, n); };
    for (const t of tutores) {
      const ced = digits(t.cedula), rnc = digits(t.rnc ?? '');
      if (qd.length >= 5 && (ced === qd || (rnc && rnc === qd))) bump(t.id, 100);
      else if (qd.length >= 5 && qd === q.replace(/[\s-]/g, '') && (ced.includes(qd) || (rnc && rnc.includes(qd)))) bump(t.id, 60);
      const nom = norm(t.nombre);
      if (nom === q) bump(t.id, 80); else if (nom.includes(q)) bump(t.id, 55);
    }
    for (const a of alumnos) {
      const code = norm(a.code).replace(/[^a-z0-9]/g, ''), num = a.id.replace(/\D/g, '');
      if (code === qa || (qd && qd.length <= 8 && /^(est)?-?\d+$/.test(q.replace(/\s/g, '')) && (a.id === qd || num === qd || code.endsWith(qd)))) bump(a.tutorId, 95);
      else if (qa.length >= 4 && code.includes(qa)) bump(a.tutorId, 70);
      const full = norm(a.nombres + ' ' + a.apellidos);
      if (full === q) bump(a.tutorId, 85); else if (full.includes(q)) bump(a.tutorId, 50);
    }
    const best = [...cand.entries()].sort((a, b) => b[1] - a[1])[0];
    const tut = best && tutores.find(t => t.id === best[0]);
    if (!tut) return reply.code(404).send({ error: 'No encontramos ninguna cuenta con «' + (req.query.q ?? '').trim() + '». Verifica la cédula, el carnet o el nombre.' });
    const hijosDb = await prisma.alumno.findMany({ where: { tutorId: tut.id }, orderBy: { id: 'asc' } });
    const hijos: CobroHijo[] = hijosDb.map(a => ({ id: a.id, kid: kidOf(a.id), nombre: `${a.nombres.split(' ')[0]} ${a.apellidos.split(' ')[0]}`, corto: a.nombres.split(' ')[0], grado: a.grado, sec: a.sec, code: a.code }));
    const ced = digits(tut.cedula);
    const [items, recibos, becas] = await Promise.all([
      prisma.finCobroItem.findMany({ where: { paid: false, OR: [...(ced ? [{ tutorCed: ced }] : []), { kid: { in: hijos.map(h => h.kid) } }] }, orderBy: { orden: 'asc' } }),
      // Historial de turno acotado: los últimos RECIBOS_TURNO emitidos + los de este tutor (antes: toda la tabla).
      Promise.all([
        prisma.finRecibo.findMany({ orderBy: { createdAt: 'desc' }, take: RECIBOS_TURNO }),
        prisma.finRecibo.findMany({ where: { tutor: tut.nombre }, orderBy: { createdAt: 'desc' }, take: 200 }),
      ]).then(([ult, suyos]) => [...new Map([...ult, ...suyos].map(r => [r.id, r])).values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
      prisma.finBeca.findMany({ where: { estado: 'Aprobada', est: { in: hijosDb.map(a => `${a.nombres} ${a.apellidos}`) } } }),
    ]);
    const becasTxt = becas.filter(b => b.conceptos.toLowerCase().includes('colegiatura')).map(b => {
      const h = hijos.find(x => hijosDb.find(a => a.id === x.id && `${a.nombres} ${a.apellidos}` === b.est));
      return `Beca ${b.tipo} −${b.regla} ya aplicada a la colegiatura de ${h?.corto ?? b.est}.`;
    });
    const res: CobroCuenta = { tutor: tut.nombre, cedula: tut.cedula, email: tut.email ?? undefined, hijos, becas: becasTxt, items: items.map(toItem), recibos: recibos.map(toRecibo) };
    return res;
  });

  app.get('/metodos', auth, async () => metodos());

  app.post<{ Body: CobroProcesarReq }>('/procesar', auth, async (req, reply) => {
    const { ids, discount, pays: rawPays, pin, cedula, intencionId } = req.body;
    const sel = await prisma.finCobroItem.findMany({ where: { id: { in: ids }, paid: false }, orderBy: { orden: 'asc' } });
    if (!sel.length) return reply.code(400).send({ error: 'Selecciona al menos un ítem' });
    if (discount === 'exo' && !(await supervisorOk(req, pin, 'cobro.exonerar'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const tutores = await prisma.tutor.findMany({ select: { id: true, nombre: true, cedula: true } });
    // Cédula: la de la cuenta cargada; si falta, la del ítem; si tampoco, el tutor responsable del alumno del primer ítem.
    const alumnoTutor = (await prisma.alumno.findMany({ select: { id: true, tutorId: true } })).find(a => kidOf(a.id) === sel[0].kid)?.tutorId;
    const cedBuscada = digits(cedula ?? '') || sel[0].tutorCed || digits(tutores.find(t => t.id === alumnoTutor)?.cedula ?? '');
    const tutorNombre = tutores.find(t => digits(t.cedula) === cedBuscada)?.nombre ?? 'Consumidor final';
    const sub = sel.reduce((a, i) => a + i.monto, 0);
    const prontoPct = (await cfgGet('finanzas')).descuentoProntoPct;
    if (discount === 'pronto' && !(prontoPct > 0)) return reply.code(400).send({ error: 'El descuento por pronto pago no está configurado' });
    let desc = 0;
    if (discount === 'pronto') desc = sel.filter(i => i.tipo === 'col' && i.est === 'Pendiente').reduce((a, i) => a + i.monto * (prontoPct / 100), 0);
    if (discount === 'exo') desc = sel.filter(i => i.tipo === 'mora').reduce((a, i) => a + i.monto, 0);
    const total = round2(sub - desc);
    const pays = rawPays.map(p => ({ m: p.m, r: p.r ?? '', amt: rawPays.length === 1 && p.a === '' ? total : parseFloat(p.a) || 0 }));
    const paid = pays.reduce((a, p) => a + p.amt, 0);
    const nonCash = pays.filter(p => p.m !== 'Efectivo').reduce((a, p) => a + p.amt, 0);
    if (total <= 0 || paid <= 0.001) return reply.code(400).send({ error: 'Ingresa el monto recibido' });
    if (nonCash > total + 0.001) return reply.code(400).send({ error: 'El monto no-efectivo excede el total' });
    const REFS = new Map((await metodos()).map(m => [m.nombre, m.ref]));
    if (pays.some(p => !REFS.has(p.m))) return reply.code(400).send({ error: 'Medio de pago no configurado' });
    if (pays.some(p => REFS.get(p.m) && !p.r.trim())) return reply.code(400).send({ error: 'Falta la referencia del medio de pago' });

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
    const id = 'REC-' + String(await nextSeq('rec')).padStart(4, '0'), ncf = 'B02' + String(await nextSeq('ncf')).padStart(8, '0');
    const metodo = pays.length > 1 ? 'Mixto' : pays[0].m.startsWith('Tarjeta') ? 'Tarjeta' : pays[0].m;
    const row = await prisma.finRecibo.create({
      data: {
        id, ncf, tutor: tutorNombre, hora: nowHM(), monto: abono ? paid : total, metodo, abono, saldo: abono ? remaining : 0,
        change: abono ? 0 : change, items: JSON.stringify(abono ? applied : sel.map(i => ({ con: i.con, monto: i.monto }))), pays: JSON.stringify(pays),
      },
    });
    await audit(req.user, 'Insert', { tabla: 'Recibos', id, next: `${ncf} · ${metodo} · $${row.monto}${abono ? ' (abono)' : ''}`, ip: req.ip });
    // Cobro ligado a una intención de pago del portal (tipo cargos): se cierra con este recibo. Un abono parcial la deja pendiente.
    if (intencionId && !abono) {
      const ok = await prisma.mobPagoIntencion.updateMany({ where: { id: intencionId, estado: 'pendiente', tipo: 'cargos' }, data: { estado: 'confirmada', resuelto: new Date(), resueltoPor: req.user.usuario, reciboId: id } });
      if (ok.count) await audit(req.user, 'Update', { tabla: 'MobPagoIntencion', id: intencionId, prev: 'pendiente', next: 'confirmada · ' + id, ip: req.ip });
    }
    return toRecibo(row);
  });

  app.post<{ Params: { id: string }; Body: { pin?: string } }>('/recibos/:id/anular', auth, async (req, reply) => {
    if (!(await supervisorOk(req, req.body?.pin, 'recibo.anular'))) return reply.code(403).send({ error: 'Clave de supervisor inválida' });
    const r = await prisma.finRecibo.findUnique({ where: { id: req.params.id } });
    if (!r) return reply.code(404).send({ error: 'Recibo no encontrado' });
    if (r.est === 'Anulado') return reply.code(409).send({ error: 'Ya está anulado' });
    const nc = 'B04' + String(await nextSeq('nc')).padStart(8, '0');
    const upd = await prisma.finRecibo.update({ where: { id: r.id }, data: { est: 'Anulado', nc } });
    await audit(req.user, 'Update', { tabla: 'Recibos', id: r.id, prev: r.est, next: 'Anulado · NC ' + nc, ip: req.ip });
    return toRecibo(upd);
  });
};
export default plugin;
