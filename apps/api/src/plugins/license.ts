import fp from 'fastify-plugin';
import { getEval, licUsable } from '../lib/license';

/**
 * Hook global: sin licencia válida (vencida, inválida o ausente) solo responden /auth, /licencia y /health.
 * La licencia es la clave firmada por el proveedor; ya no hay secreto compartido por cabecera.
 */
export default fp(async app => {
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || req.url.startsWith('/health')) return;
    if (/^\/(licencia|auth)(\/|\?|$)/.test(req.url)) return;
    const e = await getEval();
    if (!licUsable(e)) return reply.code(402).send({ error: e.estado === 'vencida' ? 'Licencia vencida: renueva el servicio' : e.estado === 'invalida' ? 'Licencia inválida' : 'Sin licencia: activa una clave en Licenciamiento' });
  });
});
