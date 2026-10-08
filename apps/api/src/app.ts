import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import authPlugin from './plugins/auth';
import licensePlugin from './plugins/license';
import { registerModules } from './plugins/modules';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  if (config.isProd && !process.env.CORS_ORIGIN) app.log.warn('CORS_ORIGIN no definido: solo se permiten los orígenes de la app móvil. Define el origen de la web si se sirve desde otro host/puerto.');
  await app.register(cors, { origin: config.corsOrigin, allowedHeaders: ['Content-Type', 'Authorization', 'X-License-Key'] });

  // Cabeceras de seguridad básicas para una API JSON (sin HSTS: las instalaciones LAN suelen ir por http).
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
  });

  // Errores 5xx sin internals (stack, rutas, SQL) en producción; el detalle queda en el log del servidor.
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({ error: config.isProd ? 'Error interno del servidor' : err.message });
    }
    return reply.code(status).send({ error: err.message });
  });

  await app.register(authPlugin);
  await app.register(licensePlugin);
  await registerModules(app);
  return app;
}
