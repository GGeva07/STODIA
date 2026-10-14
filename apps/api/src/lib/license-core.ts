import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import type { LicPlan, ScreenId } from '@stodia/shared';

/**
 * Núcleo criptográfico de la licencia. SIN dependencias de BD: lo usan la API y la herramienta del proveedor.
 * Clave: `STODIA1.<payload base64url>.<firma Ed25519 base64url>`; la firma cubre los bytes exactos del payload.
 */
export const LTIER: Record<LicPlan, number> = { 'Básico': 1, 'Intermedio': 2, 'Avanzado': 3 };
export const LQ: Record<LicPlan, { alumnos: string; usuarios: string; campus: string }> = {
  'Básico': { alumnos: '300', usuarios: '3', campus: '1' },
  'Intermedio': { alumnos: '800', usuarios: '10', campus: '1' },
  'Avanzado': { alumnos: '2000', usuarios: '30', campus: '3' },
};
/** [id, etiqueta, categoría, tier mínimo, pantallas que habilita] — LFEAT del prototipo. Las pantallas de Informes (inf-*) cuelgan de funciones ya existentes (pos, kiosko, directorio, eoy) para no invalidar las claves firmadas. */
export const LFEAT: [string, string, string, number, ScreenId[]][] = [
  ['pos', 'Terminal de Cobros, historial de turno y recibos', 'ERP / CxC', 1, ['pos', 'inf-cxc', 'inf-facturacion']], ['kiosko', 'Venta Rápida y kárdex básico', 'ERP / CxC', 1, ['kiosko', 'inventario', 'inf-inventario']],
  ['planes', 'Planes de Pago con cuota por tanda', 'ERP / CxC', 2, ['planes']], ['becas', 'Becas y Acuerdos', 'ERP / CxC', 2, ['becas']], ['tarifario', 'Tarifario Anual oficial', 'ERP / CxC', 2, []],
  ['notas', 'Matriz de Notas y boletín básico', 'Académico', 1, ['notas']], ['asistencia', 'Pase de Lista en tableta', 'Académico', 2, ['asistencia']], ['horarios', 'Horarios con validación de choques', 'Académico', 2, ['horarios']], ['extra', 'Cursos extracurriculares', 'Académico', 2, ['extra']], ['sabana', 'Sábana de calificaciones consolidada', 'Académico', 2, []],
  ['directorio', 'Directorio y Expediente 360', 'Estudiantes', 1, ['directorio', 'expediente', 'inf-estudiantes']], ['inscripcion', 'Inscripción y prematrícula (wizard)', 'Estudiantes', 2, ['inscripcion']], ['tutores', 'Tutores', 'Estudiantes', 2, ['tutores']],
  ['catalogos', 'Catálogos Maestros', 'Sistema', 1, ['catalogos']], ['comunica', 'Comunicaciones: circulares y avisos masivos', 'Comunicaciones', 2, ['comunica']],
  ['ncf', 'Emisión estándar de NCF (B01, B02, B04)', 'Fiscal', 2, []], ['ecf', 'Facturación electrónica e-CF (firma XML, Key Vault)', 'Fiscal', 3, []],
  ['comedor', 'Validación de Comedor con QR/NFC y alérgenos', 'Comedor y transporte', 3, ['comedor']], ['alimentacion', 'Planes de Alimentación', 'Comedor y transporte', 3, ['alimentacion']], ['transporte', 'Rutas de Transporte y choferes', 'Comedor y transporte', 3, []],
  ['portal', 'Portal del Tutor (PWA) con pasarela y monedero', 'Portales', 3, ['portal']],
  ['auditoria', 'Auditoría Global (logs inmutables)', 'Control y seguridad', 3, ['auditoria']], ['rbac', 'Editor dinámico de roles (RBAC)', 'Control y seguridad', 3, []], ['eoy', 'Cierre de año (EOY) automatizado', 'Control y seguridad', 3, ['inf-cierre']],
];
export const FEATURE_IDS = LFEAT.map(f => f[0]);

export const KEY_PREFIX = 'STODIA1';
export interface LicPayload {
  v: 1;
  cliente: string;
  rnc?: string;
  plan: LicPlan;
  features: string[];
  cuotas: { alumnos: string; usuarios: string; campus: string };
  emitida: string;
  vence: string;
  id: string;
}
export type VerifyResult = { ok: true; payload: LicPayload } | { ok: false; reason: 'formato' | 'firma' | 'payload' };

const b64u = (b: Buffer) => b.toString('base64url');
const B64U = /^[A-Za-z0-9_-]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const pubFromB64 = (b64: string): KeyObject => createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
export const pubToB64 = (k: KeyObject) => (k.export({ format: 'der', type: 'spki' }) as Buffer).toString('base64');
export const privFromPem = (pem: string): KeyObject => createPrivateKey(pem);

/** Emite una clave (solo el proveedor, con la privada). */
export function signKey(payload: LicPayload, privateKey: KeyObject): string {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${KEY_PREFIX}.${b64u(bytes)}.${b64u(sign(null, bytes, privateKey))}`;
}

/** Valida la estructura del payload ya autenticado. */
function shape(o: unknown): LicPayload | null {
  if (!o || typeof o !== 'object') return null;
  const p = o as Record<string, unknown>;
  if (p.v !== 1 || typeof p.cliente !== 'string' || !p.cliente.trim() || typeof p.id !== 'string' || !p.id) return null;
  if (typeof p.plan !== 'string' || !(p.plan in LTIER)) return null;
  if (typeof p.vence !== 'string' || !ISO.test(p.vence) || typeof p.emitida !== 'string' || !ISO.test(p.emitida)) return null;
  if (p.rnc !== undefined && typeof p.rnc !== 'string') return null;
  if (!Array.isArray(p.features) || !p.features.every(x => typeof x === 'string')) return null;
  const c = p.cuotas as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return null;
  const q = {} as LicPayload['cuotas'];
  for (const k of ['alumnos', 'usuarios', 'campus'] as const) {
    const n = Number(c[k]);
    if (!Number.isInteger(n) || n < 0) return null;
    q[k] = String(n);
  }
  return { v: 1, cliente: p.cliente, rnc: p.rnc as string | undefined, plan: p.plan as LicPlan, features: (p.features as string[]).filter(f => FEATURE_IDS.includes(f)), cuotas: q, emitida: p.emitida, vence: p.vence, id: p.id };
}

/** Verifica firma + estructura. Nunca acepta un payload sin firma válida. NO evalúa el vencimiento. */
export function verifyKey(key: string, publicKeyB64: string): VerifyResult {
  if (typeof key !== 'string' || key.length > 8192) return { ok: false, reason: 'formato' };
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX || !B64U.test(parts[1]) || !B64U.test(parts[2])) return { ok: false, reason: 'formato' };
  const bytes = Buffer.from(parts[1], 'base64url'), sig = Buffer.from(parts[2], 'base64url');
  let good = false;
  try { good = sig.length === 64 && verify(null, bytes, pubFromB64(publicKeyB64), sig); } catch { good = false; }
  if (!good) return { ok: false, reason: 'firma' };
  let obj: unknown;
  try { obj = JSON.parse(bytes.toString('utf8')); } catch { return { ok: false, reason: 'payload' }; }
  const payload = shape(obj);
  return payload ? { ok: true, payload } : { ok: false, reason: 'payload' };
}
