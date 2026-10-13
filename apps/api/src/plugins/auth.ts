import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Rol, ScreenId } from '@stodia/shared';
import { config } from '../config';
import { cfgGet } from '../lib/sisconfig';

/** Rutas permitidas al rol Tutor. */
const TUTOR_OK = /^\/(auth\/|movil\/tutor(\/|$)|config$|licencia$)/;

export default fp(async app => {
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '12h' } });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      // Contraseña temporal: hasta cambiarla solo se permite /auth/* (cambio de contraseña y sesión).
      if (req.user.mc && !req.url.split('?')[0].startsWith('/auth/')) return void reply.code(403).send({ error: 'Debes cambiar tu contraseña temporal antes de continuar', code: 'PASSWORD_CHANGE' });
      // El Tutor (portal móvil) solo toca su propio portal, la sesión, la configuración pública y la licencia: nunca directorio, expedientes ni catálogos.
      if (req.user.rol === 'Tutor' && !TUTOR_OK.test(req.url.split('?')[0])) reply.code(403).send({ error: 'Sin permiso' });
    } catch {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  app.decorate('requireRole', (...roles: Rol[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(req.user.rol)) reply.code(403).send({ error: 'Sin permiso' });
  });

  // Permiso por pantalla: lo que el Super Admin asigna en Configuración › Roles y permisos (matriz guardada en el servidor) manda también en la API.
  // Sin fila para el rol en la matriz solo entra el Super Admin.
  app.decorate('requireScreen', (screen: ScreenId) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user.rol === 'Super Admin') return;
    const m = (await cfgGet('access')) as Record<string, ScreenId[]>;
    if (!m[req.user.rol]?.includes(screen)) reply.code(403).send({ error: 'Sin permiso' });
  });
});
