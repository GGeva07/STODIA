import type { FastifyInstance, FastifyReply } from 'fastify';
import type { NotaCreditoReq, NotaDebitoReq, ReciboEnvioRes, Rol } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { canalesGet, correoListo, proveedorDe } from '../../lib/canales';
import { cicloReq } from '../../lib/ciclo';
import { inicioDia, zonaHoraria } from '../../lib/cxc';
import { FiscalError, enSerie } from '../../lib/fiscal';
import { NotaError, buscarDocumentos, emitirCredito, emitirDebito, idNotaOk, listarNotas, motivosDto, notaDisponible, notaPorId } from '../../lib/notas';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Traduce los errores de dominio de las notas a respuestas en español {error, code?, enlace?}; lo demas sigue al manejador global. */
export function responderNotaError(reply: FastifyReply, e: unknown) {
  if (e instanceof NotaError) {
    if (e.extra?.retryAfter) reply.header('Retry-After', String(e.extra.retryAfter));
    return reply.code(e.statusCode).send({ error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.extra?.enlace ? { enlace: e.extra.enlace } : {}) });
  }
  if (e instanceof FiscalError) return reply.code(e.statusCode).send({ error: e.message });
  throw e;
}

/** Rutas de notas de credito / debito bajo /cobros (roles del POS: Super Admin y Cajero; el resto recibe 403). */
export async function rutasNotas(app: FastifyInstance, roles: readonly Rol[]) {
  const pos = { onRequest: [app.authenticate, app.requireRole(...roles)] };

  app.get('/notas/motivos', pos, async () => motivosDto());

  app.get<{ Querystring: { q?: string } }>('/notas/documentos', pos, async (req) => buscarDocumentos(req.query.q ?? '', (await cicloReq(req)).id));

  app.get<{ Querystring: { q?: string; tipo?: string; desde?: string; hasta?: string; mios?: string; page?: string; size?: string } }>('/notas', pos, async (req, reply) => {
    const { q = '', tipo = '', desde = '', hasta = '', mios } = req.query;
    if ((desde && !ISO_RE.test(desde)) || (hasta && !ISO_RE.test(hasta))) return reply.code(400).send({ error: 'Fecha inválida (usa AAAA-MM-DD)' });
    if (tipo && !['credito', 'debito'].includes(tipo)) return reply.code(400).send({ error: 'Tipo inválido (credito o debito)' });
    const size = Math.min(100, Math.max(1, parseInt(req.query.size ?? '25', 10) || 25)), page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const tz = await zonaHoraria(), ciclo = await cicloReq(req);
    let fin: Date | undefined;
    if (hasta) { const [y, m, d] = hasta.split('-').map(Number); fin = inicioDia(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), tz); }
    return listarNotas({ q, tipo, desde: desde ? inicioDia(desde, tz) : undefined, hasta: fin, cajeroId: mios === '1' || mios === 'true' ? req.user.sub : undefined, cicloId: ciclo.id, page, size });
  });

  app.get<{ Params: { id: string } }>('/notas/:id', pos, async (req, reply) => {
    if (!idNotaOk(req.params.id)) return reply.code(404).send({ error: 'Nota no encontrada' });
    const n = await notaPorId(req.params.id);
    if (!n) return reply.code(404).send({ error: 'Nota no encontrada' });
    return n;
  });

  app.get<{ Params: { id: string } }>('/recibos/:id/notas-disponible', pos, async (req, reply) => {
    try { return await notaDisponible({ reciboId: req.params.id }); } catch (e) { return responderNotaError(reply, e); }
  });
  app.get<{ Params: { id: string } }>('/ventas/:id/notas-disponible', pos, async (req, reply) => {
    try { return await notaDisponible({ ventaId: req.params.id }); } catch (e) { return responderNotaError(reply, e); }
  });

  app.post<{ Body: NotaCreditoReq }>('/notas/credito', pos, (req, reply) => enSerie(async () => {
    try {
      const { nota, repetida } = await emitirCredito(req, req.body ?? ({} as NotaCreditoReq));
      return reply.code(repetida ? 200 : 201).send(nota);
    } catch (e) { return responderNotaError(reply, e); }
  }));

  app.post<{ Body: NotaDebitoReq }>('/notas/debito', pos, (req, reply) => enSerie(async () => {
    try {
      const { nota, repetida } = await emitirDebito(req, req.body ?? ({} as NotaDebitoReq));
      return reply.code(repetida ? 200 : 201).send(nota);
    } catch (e) { return responderNotaError(reply, e); }
  }));

  // Reimpresion / envio por correo: no tocan contabilidad (permitidos tambien en ciclo cerrado: lib/ciclo.ESCRITURA_LIBRE). Siempre auditados.
  app.post<{ Params: { id: string } }>('/notas/:id/reimprimir', pos, async (req, reply) => {
    const n = await prisma.notaFiscal.findUnique({ where: { id: req.params.id }, select: { id: true, clase: true } });
    if (!n) return reply.code(404).send({ error: 'Nota no encontrada' });
    await audit(req.user, 'Update', { tabla: 'Notas', id: n.id, next: `Reimpresión de nota de ${n.clase === 'CREDITO' ? 'crédito' : 'débito'} ${n.id}`, ip: req.ip });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/notas/:id/enviar', pos, async (req, reply): Promise<ReciboEnvioRes | void> => {
    const nota = await notaPorId(req.params.id);
    if (!nota) return reply.code(404).send({ error: 'Nota no encontrada' });
    const destino = (nota.cliente.email ?? '').trim();
    if (!destino) return { ok: false, estado: 'Sin correo' };
    const prov = correoListo((await canalesGet()).email) ? await proveedorDe('Correo') : null;
    if (!prov) return { ok: false, estado: 'Canal no configurado', destino };
    const m = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cr = nota.clase === 'CREDITO';
    const cuerpo = [
      `Nota de ${cr ? 'crédito' : 'débito'} ${nota.id} · ${nota.tipoComprobante.nombre} · ${nota.tipoComprobante.modalidad === 'ELECTRONICA' ? 'e-NCF' : 'NCF'} ${nota.ncf}`,
      `Modifica: ${nota.documento.id} · ${nota.documento.ncf}`, `Fecha: ${nota.fecha} ${nota.hora}`, `Cliente: ${nota.cliente.nombre}`, `Motivo: ${nota.motivo.nombre}${nota.motivoTexto ? ' · ' + nota.motivoTexto : ''}`, '',
      ...nota.lineas.map(l => `- ${l.concepto}: ${m(l.monto)}`), '', `Total: ${m(nota.monto)}`, ...nota.reembolsos.map(r => `Devuelto en ${r.metodo}${r.referencia ? ' ' + r.referencia : ''}: ${m(r.monto)}`),
    ].join('\n');
    try { await prov.enviar({ destino, asunto: `Nota de ${cr ? 'crédito' : 'débito'} ${nota.id}`, cuerpo }); } catch { return reply.code(502).send({ error: 'No se pudo enviar el correo. Revisa el canal de correo en Configuración.' }); }
    await audit(req.user, 'Update', { tabla: 'Notas', id: nota.id, next: `Envío de nota ${nota.id} por correo a ${destino}`, ip: req.ip });
    return { ok: true, estado: 'Enviado', destino };
  });
}
