import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Rol } from '@stodia/shared';
import { config } from '../config';

export default fp(async app => {
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  app.decorate('requireRole', (...roles: Rol[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(req.user.rol)) reply.code(403).send({ error: 'Sin permiso' });
  });
});
