import type { FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit';
import { clienteCoincide, evalKey, getEval, licInfo, setClave } from '../../lib/license';

const plugin: FastifyPluginAsync = async app => {
  app.get('/', { onRequest: [app.authenticate] }, () => licInfo());

  /** Solo Super Admin del cliente: pegar una clave renovada emitida por el proveedor. */
  app.put<{ Body: { clave?: string } }>('/clave', {
    onRequest: [app.authenticate, app.requireRole('Super Admin')],
  }, async (req, reply) => {
    const clave = typeof req.body?.clave === 'string' ? req.body.clave.trim() : '';
    if (!clave) return reply.code(400).send({ error: 'Pega la clave de licencia' });
    const e = evalKey(clave);
    if (e.estado === 'invalida' || !e.payload) return reply.code(400).send({ error: e.detalle ?? 'Clave inválida' });
    if (e.estado === 'vencida') return reply.code(400).send({ error: 'La clave ya está vencida (' + e.payload.vence + ')' });
    if (!(await clienteCoincide(e.payload))) return reply.code(400).send({ error: 'La clave pertenece a otro cliente' });
    const prev = await getEval();
    await setClave(clave);
    const ip = req.ip;
    await audit(req.user, 'Update', { tabla: 'Licencia', id: 'tenant-001/clave', prev: prev.payload ? `${prev.payload.id} ${prev.payload.plan} vence ${prev.payload.vence}` : prev.estado, next: `${e.payload.id} ${e.payload.plan} vence ${e.payload.vence}`, ip });
    return licInfo();
  });

  /** Antes permitía editar plan/módulos/cuotas/vigencia a mano: eso lo emite solo el proveedor. */
  app.put('/', { onRequest: [app.authenticate] }, async (_req, reply) => reply.code(403).send({ error: 'La licencia solo se modifica con una clave emitida por el proveedor (PUT /licencia/clave)' }));
};
export default plugin;
