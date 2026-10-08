import type { LicenciaInfo, LicEstado, ScreenId } from '@stodia/shared';
import { prisma } from '../db';
import { cfgGet } from './sisconfig';
import { LFEAT, LQ, LTIER, verifyKey, type LicPayload } from './license-core';
import { DEV_LICENSE_KEY } from './license-dev-key';
import { licensePublicKey } from './license-pubkey';

export { LFEAT, LQ, LTIER };

/**
 * Licencia = CLAVE FIRMADA por el proveedor (Ed25519). El cliente solo puede pegar una clave nueva
 * (PUT /licencia/clave); plan, módulos, cuotas y vencimiento salen exclusivamente del payload verificado.
 * Origen de la clave: SisConfig 'licenciaClave' > env LICENSE_KEY > (SEED_DEMO=true) clave de ejemplo de desarrollo.
 */
export const today = () => new Date().toISOString().slice(0, 10);

export interface LicEval { estado: LicEstado; payload: LicPayload | null; detalle?: string }

let cacheKey: string | null | undefined;

async function claveActual(): Promise<string | null> {
  if (cacheKey !== undefined) return cacheKey;
  const row = await prisma.sisConfig.findUnique({ where: { clave: 'licenciaClave' } });
  let k: string | null = null;
  if (row) { try { const v = JSON.parse(row.valor); if (typeof v === 'string' && v) k = v; } catch { /* valor corrupto = sin clave guardada */ } }
  cacheKey = k ?? ((process.env.LICENSE_KEY || '').trim() || (process.env.SEED_DEMO === 'true' ? DEV_LICENSE_KEY : null));
  return cacheKey;
}
export async function setClave(key: string) {
  await prisma.sisConfig.upsert({ where: { clave: 'licenciaClave' }, update: { valor: JSON.stringify(key) }, create: { clave: 'licenciaClave', valor: JSON.stringify(key) } });
  cacheKey = key;
}

const MOTIVO = { formato: 'La clave no tiene el formato STODIA1.*', firma: 'La firma de la clave no es válida (clave alterada o de otro emisor)', payload: 'El contenido de la clave es inválido' };

/** Evalúa una clave: firma + vigencia. Nunca confía en nada que no esté firmado. */
export function evalKey(key: string | null): LicEval {
  if (!key) return { estado: 'sin_licencia', payload: null };
  const r = verifyKey(key, licensePublicKey());
  if (!r.ok) return { estado: 'invalida', payload: null, detalle: MOTIVO[r.reason] };
  const dias = diasHasta(r.payload.vence);
  return { estado: dias < 0 ? 'vencida' : dias < 30 ? 'por_vencer' : 'valida', payload: r.payload };
}
const diasHasta = (vence: string) => Math.round((Date.parse(vence) - Date.parse(today())) / 864e5);

export const getEval = async () => evalKey(await claveActual());
/** ¿La licencia permite operar? (válida o por vencer). */
export const licUsable = (e: LicEval) => e.estado === 'valida' || e.estado === 'por_vencer';

export async function licInfo(): Promise<LicenciaInfo> {
  const e = await getEval(), p = e.payload, usable = licUsable(e);
  const [alumnos, usuarios] = await Promise.all([prisma.alumno.count({ where: { estado: 'Activo' } }), prisma.user.count({ where: { estado: 'Activo' } })]);
  const screens = new Set<ScreenId>(['dashboard', 'config']);
  if (usable && p) LFEAT.forEach(f => p.features.includes(f[0]) && f[4].forEach(x => screens.add(x)));
  const tier = p ? LTIER[p.plan] : 0;
  return {
    estado: e.estado, detalle: e.detalle,
    plan: p?.plan ?? null, cliente: p?.cliente ?? null, licId: p?.id ?? null, emitida: p?.emitida ?? null, vence: p?.vence ?? null,
    q: p ? { ...p.cuotas } : { alumnos: '0', usuarios: '0', campus: '0' },
    tier,
    features: LFEAT.map(f => ({ id: f[0], label: f[1], cat: f[2], tier: f[3], on: usable && !!p && p.features.includes(f[0]), incluido: !!p && f[3] <= tier })),
    screens: [...screens], uso: { alumnos, usuarios, campus: 1 },
    expired: e.estado === 'vencida',
    diasRestantes: p ? diasHasta(p.vence) : 0,
  };
}

/** Normaliza para comparar nombres de cliente: sin acentos, puntuación ni mayúsculas. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Si el payload trae RNC lo compara con el de la instalación; si no, compara el nombre del cliente. */
export async function clienteCoincide(p: LicPayload): Promise<boolean> {
  const perfil = await cfgGet('perfil');
  const dig = (s?: string) => (s ?? '').replace(/\D/g, '');
  if (p.rnc && dig(perfil.rnc)) return dig(p.rnc) === dig(perfil.rnc);
  if (perfil.nombre) return norm(p.cliente) === norm(perfil.nombre);
  return true;
}
