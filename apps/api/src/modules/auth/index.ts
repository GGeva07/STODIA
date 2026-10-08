import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import type { LoginRequest, LoginResponse, Rol } from '@stodia/shared';
import { prisma } from '../../db';
import { audit } from '../../lib/audit';
import { PIN_MIN, emitirToken, pinConfigurado, setPin, verificarPin } from '../../lib/supervisor';

// Hash de relleno para igualar tiempos cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10);

// Limitador simple en memoria para /login: 10 fallos por IP+usuario cada 5 min -> 429.
const LOGIN_MAX = 10;
const LOGIN_WINDOW = 5 * 60_000;
const loginFails = new Map<string, { n: number; reset: number }>();
const failKey = (ip: string, usuario: string) => `${ip}|${usuario.toLowerCase()}`;

const plugin: FastifyPluginAsync = async app => {
  app.post<{ Body: LoginRequest }>(
    '/login',
    { schema: { body: { type: 'object', required: ['usuario', 'password'], properties: { usuario: { type: 'string', maxLength: 100 }, password: { type: 'string', maxLength: 200 } } } } },
    async (req, reply) => {
      const { usuario, password } = req.body;
      const now = Date.now();
      const key = failKey(req.ip, usuario);
      const f = loginFails.get(key);
      if (f && f.reset > now && f.n >= LOGIN_MAX) {
        reply.header('Retry-After', String(Math.ceil((f.reset - now) / 1000)));
        return reply.code(429).send({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
      }
      const u = await prisma.user.findUnique({ where: { usuario } });
      const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
      if (!u || !ok || u.estado !== 'Activo') {
        loginFails.set(key, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + LOGIN_WINDOW });
        if (loginFails.size > 5000) for (const [k, v] of loginFails) if (v.reset <= now) loginFails.delete(k);
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos' });
      }
      loginFails.delete(key);
      const rol = u.rol as Rol;
      const token = app.jwt.sign({ sub: u.id, usuario: u.usuario, nombre: u.nombre, rol, ...(u.mustChange ? { mc: true } : {}) });
      const res: LoginResponse = { token, user: { usuario: u.usuario, nombre: u.nombre, rol, ...(u.mustChange ? { mustChange: true } : {}) } };
      return res;
    },
  );

  app.get('/me', { onRequest: [app.authenticate] }, async req => ({ usuario: req.user.usuario, nombre: req.user.nombre, rol: req.user.rol, ...(req.user.mc ? { mustChange: true } : {}) }));

  /** Cambio de contraseña propio (obligatorio en el primer ingreso con contraseña temporal). Devuelve una sesión nueva sin la marca de cambio. */
  app.post<{ Body: { actual: string; nueva: string } }>(
    '/password',
    { onRequest: [app.authenticate], schema: { body: { type: 'object', required: ['actual', 'nueva'], properties: { actual: { type: 'string', maxLength: 200 }, nueva: { type: 'string', maxLength: 200 } } } } },
    async (req, reply) => {
      const { actual, nueva } = req.body;
      const key = failKey(req.ip, req.user.usuario), now = Date.now(), f = loginFails.get(key);
      if (f && f.reset > now && f.n >= LOGIN_MAX) return reply.code(429).send({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
      const u = await prisma.user.findUnique({ where: { usuario: req.user.usuario } });
      if (!u || u.estado !== 'Activo' || !(await bcrypt.compare(actual, u.passwordHash))) {
        loginFails.set(key, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + LOGIN_WINDOW });
        return reply.code(403).send({ error: 'La contraseña actual es incorrecta' });
      }
      if (nueva.length < 8) return reply.code(422).send({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      if (nueva === actual) return reply.code(422).send({ error: 'La nueva contraseña debe ser distinta de la actual' });
      loginFails.delete(key);
      await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(nueva, 10), mustChange: false } });
      await audit(req.user, 'Update', { tabla: 'Usuarios', id: u.usuario, prev: u.mustChange ? 'contraseña temporal' : '••••', next: '•••• (cambiada por el usuario)', ip: req.ip });
      const rol = u.rol as Rol;
      const res: LoginResponse = { token: app.jwt.sign({ sub: u.id, usuario: u.usuario, nombre: u.nombre, rol }), user: { usuario: u.usuario, nombre: u.nombre, rol } };
      return res;
    },
  );

  // ---- PIN de supervisor (autenticado; el navegador nunca conoce el PIN) ----
  /** Canjea el PIN por un token de un solo uso (60 s). Límite: 5 fallos -> bloqueo de 5 min por usuario. */
  app.post<{ Body: { pin: string; accion?: string } }>(
    '/supervisor',
    { onRequest: [app.authenticate], schema: { body: { type: 'object', required: ['pin'], properties: { pin: { type: 'string', maxLength: 128 }, accion: { type: 'string', maxLength: 60 } } } } },
    async (req, reply) => {
      const r = await verificarPin(req, req.body.pin);
      if (!r.ok) {
        if (r.retryAfter) reply.header('Retry-After', String(r.retryAfter));
        return reply.code(r.status).send({ error: r.error });
      }
      const t = emitirToken(req.user.usuario, req.body.accion ?? null);
      await audit(req.user, 'Update', { tabla: 'Supervisor', id: req.body.accion ?? 'pin', prev: 'solicitud', next: 'AUTORIZADO (token 60 s)', ip: req.ip });
      return t;
    },
  );

  /** ¿Hay PIN configurado en esta instancia? (solo Super Admin; lo usa Configuración). */
  app.get('/supervisor/estado', { onRequest: [app.authenticate, app.requireRole('Super Admin')] }, async () => ({ configurado: await pinConfigurado() }));

  /** Cambia el PIN: solo Super Admin y confirmando con su contraseña actual. */
  app.put<{ Body: { password: string; pin: string } }>(
    '/supervisor',
    { onRequest: [app.authenticate, app.requireRole('Super Admin')], schema: { body: { type: 'object', required: ['password', 'pin'], properties: { password: { type: 'string', maxLength: 200 }, pin: { type: 'string', maxLength: 128 } } } } },
    async (req, reply) => {
      const { password, pin } = req.body;
      if (pin.length < PIN_MIN) return reply.code(422).send({ error: `La clave debe tener al menos ${PIN_MIN} caracteres` });
      const u = await prisma.user.findUnique({ where: { usuario: req.user.usuario } });
      const key = failKey(req.ip, req.user.usuario);
      const f = loginFails.get(key);
      if (f && f.reset > Date.now() && f.n >= LOGIN_MAX) return reply.code(429).send({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
      if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
        const now = Date.now();
        loginFails.set(key, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + LOGIN_WINDOW });
        return reply.code(403).send({ error: 'Contraseña actual incorrecta' });
      }
      await setPin(pin);
      await audit(req.user, 'Update', { tabla: 'Supervisor', id: 'pin', prev: '••••', next: '•••• (cambiada)', ip: req.ip });
      return { ok: true };
    },
  );
};
export default plugin;
