import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Rol } from '@stodia/shared';
import { config } from '../config';

/** Rutas permitidas al rol Tutor. */
const TUTOR_OK = /^\/(auth\/|movil\/tutor(\/|$)|config$|licencia$)/;

export default fp(async app => {
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      // El Tutor (portal móvil) solo toca su propio portal, la sesión, la configuración pública y la licencia: nunca directorio, expedientes ni catálogos.
      if (req.user.rol === 'Tutor' && !TUTOR_OK.test(req.url.split('?')[0])) reply.code(403).send({ error: 'Sin permiso' });
    } catch {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  app.decorate('requireRole', (...roles: Rol[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(req.user.rol)) reply.code(403).send({ error: 'Sin permiso' });
  });
});
