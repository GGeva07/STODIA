import nodemailer from 'nodemailer';
import { prisma } from '../db';
import { config } from '../config';

/**
 * Configuración de canales de comunicación, pasarela de pago y comedor (SisConfig 'canales' | 'pasarela' | 'comedor').
 * Una instalación real arranca con todo inactivo: ningún mensaje se declara entregado ni ningún pago se declara cobrado sin un proveedor real.
 * El modo `demo` (comportamiento simulado de la demo) SOLO existe con SEED_DEMO=true Y el flag demo=true en la config.
 */
async function leer<T>(clave: string, def: T): Promise<T> {
  const row = await prisma.sisConfig.findUnique({ where: { clave } });
  if (!row) return def;
  try { return { ...def, ...JSON.parse(row.valor) }; } catch { return def; }
}
async function guardar(clave: string, valor: unknown) {
  const v = JSON.stringify(valor);
  await prisma.sisConfig.upsert({ where: { clave }, update: { valor: v }, create: { clave, valor: v } });
}

// ---- Pasarela de pago ----
export interface PasarelaCfg { activa: boolean; proveedor: string | null; demo: boolean }
export const pasarelaGet = async (): Promise<PasarelaCfg> => {
  const c = await leer<PasarelaCfg>('pasarela', { activa: false, proveedor: null, demo: false });
  return { ...c, demo: config.seedDemo && c.demo === true };
};
export const pasarelaSet = (v: PasarelaCfg) => guardar('pasarela', v);
/** Proveedores de pasarela implementados en esta versión (ninguno todavía: el portal registra la intención y el cajero verifica). */
export const PASARELAS_IMPLEMENTADAS: string[] = [];

// ---- Comedor ----
export interface ComedorCfg { recargas: number[]; encabezado: string; consumos: { l: string; p: number }[] }
export const comedorGet = () => leer<ComedorCfg>('comedor', { recargas: [500, 1000, 2000], encabezado: '', consumos: [] });
export const comedorSet = (v: ComedorCfg) => guardar('comedor', v);

// ---- Canales ----
export interface EmailCfg { activo: boolean; host: string; port: number; user: string; pass: string; from: string }
export interface CanalesCfg { email: EmailCfg; demo: boolean }
const envEmail = (): EmailCfg => ({
  activo: !!process.env.SMTP_HOST, host: process.env.SMTP_HOST ?? '', port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '', from: process.env.SMTP_FROM ?? '',
});
/** SisConfig manda sobre el entorno; los campos vacíos caen al ENV (SMTP_HOST/PORT/USER/PASS/FROM). */
export async function canalesGet(): Promise<CanalesCfg & { fuente: 'bd' | 'env' }> {
  const row = await prisma.sisConfig.findUnique({ where: { clave: 'canales' } });
  let st: { email?: Partial<EmailCfg>; demo?: boolean } = {};
  if (row) try { st = JSON.parse(row.valor); } catch { /* config corrupta: se ignora */ }
  const e = envEmail(), s = st.email ?? {};
  const email: EmailCfg = {
    activo: s.activo ?? e.activo, host: s.host || e.host, port: Number(s.port) || e.port,
    user: s.user ?? e.user, pass: s.pass || e.pass, from: s.from || e.from || s.user || e.user,
  };
  return { email, demo: config.seedDemo && st.demo === true, fuente: s.host ? 'bd' : 'env' };
}
export async function canalesSet(patch: { email?: Partial<EmailCfg>; demo?: boolean }) {
  const row = await prisma.sisConfig.findUnique({ where: { clave: 'canales' } });
  let st: { email?: Partial<EmailCfg>; demo?: boolean } = {};
  if (row) try { st = JSON.parse(row.valor); } catch { /* */ }
  await guardar('canales', { ...st, ...(patch.demo !== undefined ? { demo: patch.demo } : {}), email: { ...(st.email ?? {}), ...(patch.email ?? {}) } });
}

/** Interfaz mínima de un proveedor de canal. SMS / WhatsApp / Push quedan sin implementar (no hay proveedor: 'Canal no configurado'). */
export interface ProveedorCanal { canal: string; enviar(m: { destino: string; asunto: string; cuerpo: string }): Promise<void> }

const transporte = (c: EmailCfg) => nodemailer.createTransport({
  host: c.host, port: c.port, secure: c.port === 465,
  auth: c.user ? { user: c.user, pass: c.pass } : undefined,
  // Nunca colgar el worker: topes de conexión, saludo y socket.
  connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000, dnsTimeout: 6000,
});

export const proveedorCorreo = (c: EmailCfg): ProveedorCanal => ({
  canal: 'Correo',
  async enviar({ destino, asunto, cuerpo }) {
    const tr = transporte(c);
    try { await tr.sendMail({ from: c.from, to: destino, subject: asunto, text: cuerpo }); } finally { tr.close(); }
  },
});
export async function verificarCorreo(c: EmailCfg) {
  const tr = transporte(c);
  try { await tr.verify(); } finally { tr.close(); }
}
export const correoListo = (c: EmailCfg) => c.activo && !!c.host && !!c.from;

/** Proveedor operativo de un canal, o null si el canal no está configurado / no tiene implementación. */
export async function proveedorDe(canal: string): Promise<ProveedorCanal | null> {
  if (canal !== 'Correo') return null;
  const c = (await canalesGet()).email;
  return correoListo(c) ? proveedorCorreo(c) : null;
}
