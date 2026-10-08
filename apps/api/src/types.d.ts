import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Rol } from '@stodia/shared';

declare module 'fastify' {
  interface FastifyInstance {
    /** Usar como `{ onRequest: [app.authenticate] }` en rutas protegidas. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Uso: `{ onRequest: [app.authenticate, app.requireRole('Super Admin')] }` */
    requireRole: (...roles: Rol[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; usuario: string; nombre: string; rol: Rol };
    user: { sub: string; usuario: string; nombre: string; rol: Rol };
  }
}
