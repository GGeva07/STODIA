import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import authPlugin from './plugins/auth';
import licensePlugin from './plugins/license';
import { registerModules } from './plugins/modules';
import { mensajeIntegridad } from './lib/errores';
import { CicloError, cicloPedido, cicloReq, errorCicloCerrado, escrituraPorCiclo } from './lib/ciclo';

export async function buildApp() {
  // TRUST_PROXY: 'true' (confiar en X-Forwarded-*; solo si la API va tras el proxy nginx de la web, /api) o N saltos. Por defecto false.
  const tp = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  const trustProxy: boolean | number = tp === 'true' ? true : /^[1-9][0-9]?$/.test(tp) ? Number(tp) : false;
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024, trustProxy });
  if (config.isProd && !process.env.CORS_ORIGIN) app.log.warn('CORS_ORIGIN no definido: solo se permiten los orígenes de la app móvil. Define el origen de la web si se sirve desde otro host/puerto.');
  await app.register(cors, { origin: config.corsOrigin, allowedHeaders: ['Content-Type', 'Authorization', 'X-License-Key', 'X-Ciclo'] });

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
    // Violaciones de FK / UNIQUE (Prisma P2003/P2002 -> SQL Server 547/2601): 409 amistoso en vez de 500.
    const integ = mensajeIntegridad(err);
    if (integ) { req.log.warn({ code: (err as { code?: string }).code }, 'integridad referencial'); return reply.code(integ.status).send({ error: integ.error }); }
    if (err instanceof CicloError) return reply.code(err.status).send({ error: err.message }); // ciclo inexistente (404) / sin ciclo activo (409)
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({ error: config.isProd ? 'Error interno del servidor' : err.message });
    }
    return reply.code(status).send({ error: err.message });
  });

  // Fase 2D · PROTECCION DE ESCRITURA EN EL SERVIDOR: un ciclo Cerrado (X-Ciclo / ?ciclo=) es de solo lectura. Corre tras authenticate (preHandler) y solo mira las
  // rutas POR CICLO (lib/ciclo.PREFIJOS_POR_CICLO); catalogos, auth, config, licencia, comedor, kiosko... ignoran la cabecera. Sin cabecera = ciclo activo = sin cambios.
  app.addHook('preHandler', async (req, reply) => {
    if (!escrituraPorCiclo(req.method, req.url) || !cicloPedido(req)) return;
    try {
      const c = await cicloReq(req);
      if (c.estado !== 'Activo') return reply.code(409).send(errorCicloCerrado(c.nombre, c.estado));
    } catch (e) {
      if (e instanceof CicloError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  await app.register(authPlugin);
  await app.register(licensePlugin);
  await registerModules(app);
  return app;
}
