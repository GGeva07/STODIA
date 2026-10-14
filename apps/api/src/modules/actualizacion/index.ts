import type { FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit';
import { cancelar, cmpVersion, resumen, solicitar, solicitud } from '../../lib/actualizacion';
import { version } from '../../lib/instalacion';

/**
 * Actualizaciones aprobadas por el cliente (lib/actualizacion.ts). Solo el Super Admin ve y aprueba.
 * GET  /actualizacion            -> { actual, disponible, solicitud, ultimo, canal, error }   (?forzar=1 vuelve a consultar el canal)
 * POST /actualizacion/aprobar    { version } -> deja la solicitud para el actualizador del servidor
 * POST /actualizacion/cancelar   -> retira la solicitud si aún no empezó
 */
const plugin: FastifyPluginAsync = async app => {
  const sa = { onRequest: [app.authenticate, app.requireRole('Super Admin')] };

  app.get<{ Querystring: { forzar?: string } }>('/', sa, async req => resumen(req.query.forzar === '1'));

  app.post<{ Body: { version: string } }>('/aprobar', { ...sa, schema: { body: { type: 'object', required: ['version'], properties: { version: { type: 'string', maxLength: 32 } } } } }, async (req, reply) => {
    const r = await resumen();
    if (!r.disponible) return reply.code(409).send({ error: r.error ?? 'No hay una versión nueva disponible' });
    if (r.disponible.version !== req.body.version.replace(/^v/, '')) return reply.code(409).send({ error: `La versión disponible es ${r.disponible.version}; recarga la página` });
    if (cmpVersion(r.disponible.version, version()) <= 0) return reply.code(409).send({ error: 'Ya tienes esa versión' });
    const s = solicitar(r.disponible.version, req.user.usuario);
    await audit(req.user, 'Update', { tabla: 'Actualizacion', id: s.version, prev: version(), next: s.version, ip: req.ip });
    return { ok: true, solicitud: s };
  });

  app.post('/cancelar', sa, async (req, reply) => {
    const s = solicitud();
    if (!s) return reply.code(404).send({ error: 'No hay ninguna actualización pendiente' });
    cancelar();
    await audit(req.user, 'Delete', { tabla: 'Actualizacion', id: s.version, prev: 'aprobada', next: 'cancelada', ip: req.ip });
    return { ok: true };
  });
};
export default plugin;
