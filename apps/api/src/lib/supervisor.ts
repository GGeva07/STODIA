import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { audit } from './audit';

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Clave de SisConfig donde vive el hash del PIN de supervisor (por instancia). */
const KEY = 'supervisor';
export const PIN_MIN = 4;
export const MAX_FALLOS = 5;
export const BLOQUEO_MS = 5 * 60_000;
export const TOKEN_TTL_MS = 60_000;
const TOKEN_PREFIX = 'svt_';

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

async function checkHash(pin: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = await scrypt(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

async function storedHash(): Promise<string | null> {
  const row = await prisma.sisConfig.findUnique({ where: { clave: KEY } });
  if (!row) return null;
  try { return (JSON.parse(row.valor) as { hash?: string }).hash ?? null; } catch { return null; }
}

export const pinConfigurado = async () => !!(await storedHash());

export async function setPin(pin: string) {
  const valor = JSON.stringify({ hash: await hashPin(pin), cambiado: new Date().toISOString() });
  await prisma.sisConfig.upsert({ where: { clave: KEY }, update: { valor }, create: { clave: KEY, valor } });
}

/**
 * PIN inicial de la instancia (solo si aún no hay uno): SUPERVISOR_PIN del entorno (lo escribe el instalador);
 * en desarrollo/demo (SEED_DEMO=true) cae a '1234'. En producción sin SUPERVISOR_PIN no se crea ninguno:
 * los roles sin permiso directo no pueden autorizar hasta que el Super Admin lo defina en Configuración.
 */
export async function seedSupervisorPin(demo: boolean) {
  if (await storedHash()) return;
  const pin = (process.env.SUPERVISOR_PIN ?? '').trim() || (demo ? '1234' : '');
  if (pin.length >= PIN_MIN) await setPin(pin);
}

// ---- Bloqueo por intentos y tokens de un solo uso (en memoria: un proceso por instancia) ----
const fallos = new Map<string, { n: number; hasta: number }>();
interface Tok { usuario: string; accion: string | null; exp: number }
const tokens = new Map<string, Tok>();

const purge = () => {
  const now = Date.now();
  for (const [k, t] of tokens) if (t.exp <= now) tokens.delete(k);
  for (const [k, f] of fallos) if (f.hasta && f.hasta <= now) fallos.delete(k);
};

export type PinResult = { ok: true } | { ok: false; status: 401 | 403 | 429; error: string; retryAfter?: number };

/** Verifica el PIN crudo para `usuario`, con bloqueo (5 fallos -> 5 min) y auditoría de cada fallo. */
export async function verificarPin(req: FastifyRequest, pin: unknown): Promise<PinResult> {
  purge();
  const usuario = req.user.usuario;
  const f = fallos.get(usuario);
  if (f && f.hasta > Date.now()) {
    return { ok: false, status: 429, error: 'Demasiados intentos. Supervisor bloqueado temporalmente.', retryAfter: Math.ceil((f.hasta - Date.now()) / 1000) };
  }
  const stored = await storedHash();
  const valido = typeof pin === 'string' && pin.length >= PIN_MIN && pin.length <= 128 && !!stored && (await checkHash(pin, stored));
  if (valido) { fallos.delete(usuario); return { ok: true }; }
  const n = (f?.n ?? 0) + 1;
  const bloquear = n >= MAX_FALLOS;
  fallos.set(usuario, { n: bloquear ? 0 : n, hasta: bloquear ? Date.now() + BLOQUEO_MS : 0 });
  await audit(usuario, 'Update', { tabla: 'Supervisor', id: 'pin', prev: 'intento', next: bloquear ? 'FALLIDO · usuario bloqueado 5 min' : `FALLIDO (${n}/${MAX_FALLOS})`, ip: req.ip });
  if (bloquear) return { ok: false, status: 429, error: 'Demasiados intentos. Supervisor bloqueado temporalmente.', retryAfter: BLOQUEO_MS / 1000 };
  return { ok: false, status: 403, error: 'Clave de supervisor inválida. Intento registrado en auditoría.' };
}

/** Emite un token de un solo uso (60 s) ligado al usuario y, si se indica, a la acción. */
export function emitirToken(usuario: string, accion: string | null): { token: string; expiresIn: number } {
  purge();
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url');
  tokens.set(token, { usuario, accion, exp: Date.now() + TOKEN_TTL_MS });
  return { token, expiresIn: TOKEN_TTL_MS / 1000 };
}

function consumirToken(req: FastifyRequest, token: string, accion?: string): boolean {
  const t = tokens.get(token);
  if (!t) return false;
  tokens.delete(token); // un solo uso, aunque falle la validación
  return t.exp > Date.now() && t.usuario === req.user.usuario && (!t.accion || !accion || t.accion === accion);
}

/**
 * Autorización de supervisor en el servidor. `credencial` = token de /auth/supervisor (preferido) o el PIN crudo.
 * Devuelve true si procede; si no, el llamador responde 403 (ver `supervisorDenegado`).
 */
export async function supervisorOk(req: FastifyRequest, credencial?: unknown, accion?: string): Promise<boolean> {
  if (req.user.rol === 'Super Admin') return true;
  if (typeof credencial !== 'string' || !credencial) return false;
  if (credencial.startsWith(TOKEN_PREFIX)) {
    const ok = consumirToken(req, credencial, accion);
    if (!ok) await audit(req.user, 'Update', { tabla: 'Supervisor', id: accion ?? 'token', prev: 'token', next: 'RECHAZADO (inválido, vencido o ya usado)', ip: req.ip });
    return ok;
  }
  return (await verificarPin(req, credencial)).ok;
}
