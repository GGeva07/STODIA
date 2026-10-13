import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Rol, ScreenId } from '@stodia/shared';

declare module 'fastify' {
  interface FastifyInstance {
    /** Usar como `{ onRequest: [app.authenticate] }` en rutas protegidas. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Uso: `{ onRequest: [app.authenticate, app.requireRole('Super Admin')] }` */
    /** Permiso según la matriz de acceso guardada: `app.requireScreen('config')`. */
    requireScreen: (screen: ScreenId) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Rol[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; usuario: string; nombre: string; rol: Rol; mc?: boolean };
    user: { sub: string; usuario: string; nombre: string; rol: Rol; mc?: boolean };
  }
}
