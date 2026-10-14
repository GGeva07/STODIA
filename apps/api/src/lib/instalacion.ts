import fs from 'node:fs';
import path from 'node:path';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db';

/**
 * Estado de la instancia (docs: .agent-sync/analisis-instalacion/CONTRATO.md).
 *  - 'pendiente': el servidor se instaló sin datos del colegio. Espera POST /instalacion/activar con el código de un solo uso.
 *  - 'activa'   : ya tiene Super Admin y perfil. Instalaciones antiguas (sin la marca) cuentan como activas si existe un Super Admin.
 * El código vive en SisConfig 'activacion' (solo el código y su vencimiento) y se copia a DATA_DIR/codigo-activacion.txt para el técnico.
 */
export type EstadoInstancia = 'pendiente' | 'activa';

const KEY_ESTADO = 'instalacion';
const KEY_CODIGO = 'activacion';
export const CODIGO_TTL_MS = 72 * 3600_000;
/** Sin 0/O/1/I/L para dictarlo por teléfono sin errores. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Carpeta de datos persistentes: la del archivo SQLite (/data en Docker) o DATA_DIR. */
export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    const f = url.slice(5);
    return path.dirname(path.isAbsolute(f) ? f : path.resolve(process.cwd(), 'prisma', f));
  }
  return path.resolve(process.cwd(), 'data');
}

/** Versión del servidor: STODIA_VERSION (la fija el actualizador/la imagen) o la de package.json de la API. */
export function version(): string {
  if (process.env.STODIA_VERSION) return process.env.STODIA_VERSION.replace(/^v/, '');
  try {
    // src/lib -> ../../package.json ; dist/lib -> ../../package.json
    return (JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
  } catch { return '0.0.0'; }
}
/** Versión mínima del cliente de escritorio que este servidor admite. */
export const minClientVersion = () => process.env.STODIA_MIN_CLIENT_VERSION || '0.1.0';

let cache: EstadoInstancia | null = null;

export async function estadoInstancia(): Promise<EstadoInstancia> {
  if (cache) return cache;
  const row = await prisma.sisConfig.findUnique({ where: { clave: KEY_ESTADO } });
  let e: EstadoInstancia | null = null;
  if (row) { try { e = (JSON.parse(row.valor) as { estado?: EstadoInstancia }).estado ?? null; } catch { /* corrupto: se recalcula */ } }
  if (!e) e = (await prisma.user.count({ where: { rol: 'Super Admin' } })) > 0 ? 'activa' : 'pendiente';
  if (e === 'activa') cache = e; // 'pendiente' no se cachea: puede cambiar en cualquier momento
  return e;
}

export async function marcarActiva(por: string) {
  const prev = await prisma.sisConfig.findUnique({ where: { clave: KEY_ESTADO } });
  if (prev?.valor.includes('"activa"')) { cache = 'activa'; return; } // ya marcada: conserva fecha y autor originales
  const valor = JSON.stringify({ estado: 'activa', activadaEn: new Date().toISOString(), por });
  await prisma.sisConfig.upsert({ where: { clave: KEY_ESTADO }, update: { valor }, create: { clave: KEY_ESTADO, valor } });
  await prisma.sisConfig.deleteMany({ where: { clave: KEY_CODIGO } });
  try { fs.rmSync(path.join(dataDir(), 'codigo-activacion.txt'), { force: true }); } catch { /* sin permiso: no bloquea */ }
  cache = 'activa';
}

const nuevoCodigo = () => Array.from({ length: 8 }, (_, i) => (i === 4 ? '-' : '') + ALFABETO[randomInt(ALFABETO.length)]).join('');
/** Normaliza lo que escribe el técnico: mayúsculas, sin espacios ni guiones, y vuelve a poner el guion. */
export const normCodigo = (v: unknown) => { const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s; };

/** Devuelve el código vigente o crea uno nuevo (si no hay o venció). Solo en estado 'pendiente'. */
export async function asegurarCodigo(): Promise<{ codigo: string; vence: string; nuevo: boolean }> {
  const row = await prisma.sisConfig.findUnique({ where: { clave: KEY_CODIGO } });
  if (row) {
    try {
      const v = JSON.parse(row.valor) as { codigo: string; vence: string };
      if (v.codigo && Date.parse(v.vence) > Date.now()) { escribirArchivo(v.codigo, v.vence); return { ...v, nuevo: false }; }
    } catch { /* corrupto: se regenera */ }
  }
  const codigo = nuevoCodigo(), vence = new Date(Date.now() + CODIGO_TTL_MS).toISOString();
  const valor = JSON.stringify({ codigo, vence });
  await prisma.sisConfig.upsert({ where: { clave: KEY_CODIGO }, update: { valor }, create: { clave: KEY_CODIGO, valor } });
  escribirArchivo(codigo, vence);
  return { codigo, vence, nuevo: true };
}

function escribirArchivo(codigo: string, vence: string) {
  try {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'codigo-activacion.txt'), `${codigo}\nvence ${vence}\n`, { mode: 0o600 });
  } catch { /* el código también sale en el log de arranque */ }
}

/** Comparación en tiempo constante del código (y vigencia). */
export async function codigoValido(entrada: unknown): Promise<boolean> {
  const row = await prisma.sisConfig.findUnique({ where: { clave: KEY_CODIGO } });
  if (!row) return false;
  let v: { codigo?: string; vence?: string };
  try { v = JSON.parse(row.valor); } catch { return false; }
  if (!v.codigo || !v.vence || Date.parse(v.vence) <= Date.now()) return false;
  const a = Buffer.from(normCodigo(entrada)), b = Buffer.from(v.codigo);
  return a.length === b.length && timingSafeEqual(a, b);
}
