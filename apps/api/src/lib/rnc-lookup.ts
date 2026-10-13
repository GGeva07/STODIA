import { prisma } from '../db';

/**
 * Resolución de la razón social a partir de un RNC (9 dígitos) o cédula (11) para Cobros › comprobante fiscal.
 * Proveedores en orden: 'tutor' (Tutor.cedula / Tutor.rnc), 'historial' (recibos anteriores: FinRecibo.clienteRnc) y 'dgii' (API externa, DESACTIVADO hasta configurarlo).
 * Ver docs/fiscal-ncf.md › «Datos fiscales del comprador y verificación DGII futura».
 */
export type FuenteRnc = 'tutor' | 'historial' | 'dgii';
export interface ResultadoRnc { razonSocial: string; estado?: string; nombreComercial?: string }
export interface ProveedorRnc { id: FuenteRnc; consultar(rnc: string): Promise<ResultadoRnc | null> }
export interface RncResuelto { rnc: string; valido: boolean; encontrado: boolean; razonSocial?: string; fuente?: FuenteRnc; estado?: string }

export const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const longitudRncOk = (d: string) => d.length === 9 || d.length === 11;

/** Proveedor local, SIEMPRE activo: tutores registrados. */
export const proveedorTutor: ProveedorRnc = {
  id: 'tutor',
  async consultar(rnc) {
    const tutores = await prisma.tutor.findMany({ where: { OR: [{ cedula: rnc }, { rnc }] }, select: { nombre: true, cedula: true, rnc: true } });
    // Una coincidencia por RNC propio gana sobre una por cédula (el RNC es el dato fiscal explícito).
    const t = tutores.find(x => soloDigitos(x.rnc) === rnc) ?? tutores.find(x => soloDigitos(x.cedula) === rnc);
    return t?.nombre?.trim() ? { razonSocial: t.nombre.trim() } : null;
  },
};
/** Proveedor local, SIEMPRE activo: el último nombre usado con ese RNC en un recibo anterior. */
export const proveedorHistorial: ProveedorRnc = {
  id: 'historial',
  async consultar(rnc) {
    const r = await prisma.finRecibo.findFirst({ where: { clienteRnc: rnc, clienteNombre: { not: null } }, orderBy: { createdAt: 'desc' }, select: { clienteNombre: true } });
    return r?.clienteNombre?.trim() ? { razonSocial: r.clienteNombre.trim() } : null;
  },
};

const TIMEOUT_MS = 6000;
/** Configuración del proveedor DGII. NUNCA se registra ni se devuelve la clave. */
async function configDgii(): Promise<{ base: string; key: string } | null> {
  const base = (process.env.STODIA_RNC_API_URL ?? '').trim().replace(/\/+$/, ''), key = (process.env.STODIA_RNC_API_KEY ?? '').trim();
  if (!base || !key) return null;
  let activa = process.env.STODIA_RNC_ACTIVA === '1';
  try {
    const row = await prisma.sisConfig.findUnique({ where: { clave: 'rncVerificacion' } });
    if (row) activa = activa || JSON.parse(row.valor)?.activa === true;
  } catch { /* sin configuración: desactivado */ }
  return activa ? { base, key } : null;
}
/** Resultado detallado de la consulta a la API de RNC. NUNCA incluye la clave. */
export type ConsultaDgii =
  | { tipo: 'sin-config' }
  | { tipo: 'no-encontrado' }
  | { tipo: 'indisponible'; codigo?: number }
  | { tipo: 'ok'; rnc: string; razonSocial: string; nombreComercial?: string; estatus?: string; regimen?: string; estado: string; activo: boolean; updatedAt?: string };

/**
 * Consulta a la API del proveedor: GET {base}/api/v1/rnc/{rnc} con cabecera x-api-key. 200 {status:'success', data:{rnc, razon_social, nombre_comercial, estatus, regimen, updated_at}};
 * 404 = no encontrado; 401/403/429/5xx/timeout = indisponible. El estado ACTIVO puede venir en `regimen` con `estatus` vacío.
 */
export async function consultarDgii(rnc: string): Promise<ConsultaDgii> {
  const cfg = await configDgii();
  if (!cfg) return { tipo: 'sin-config' };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.base}/api/v1/rnc/${encodeURIComponent(rnc)}`, { headers: { 'x-api-key': cfg.key, accept: 'application/json' }, signal: ctl.signal });
    if (res.status === 404) return { tipo: 'no-encontrado' };
    if (res.status !== 200) return { tipo: 'indisponible', codigo: res.status };
    const j = await res.json() as { status?: string; data?: { rnc?: string; razon_social?: string; nombre_comercial?: string; estatus?: string; regimen?: string; updated_at?: string } };
    const d = j?.data, razon = String(d?.razon_social ?? '').trim();
    if (j?.status !== 'success' || !razon) return { tipo: 'no-encontrado' };
    const estatus = String(d?.estatus ?? '').trim(), regimen = String(d?.regimen ?? '').trim();
    const activo = [estatus, regimen].some(x => x.toUpperCase() === 'ACTIVO');
    const estado = activo ? 'ACTIVO' : (estatus || regimen);
    return { tipo: 'ok', rnc: soloDigitos(d?.rnc) || rnc, razonSocial: razon, nombreComercial: d?.nombre_comercial?.trim() || undefined, estatus: estatus || undefined, regimen: regimen || undefined, estado, activo, updatedAt: d?.updated_at ? String(d.updated_at) : undefined };
  } catch { return { tipo: 'indisponible' }; } finally { clearTimeout(timer); }
}

/** Proveedor DGII para resolverRnc (cobros): si la API no responde devuelve null y el llamador cae a lo local sin bloquear el cobro. */
export const proveedorDgii: ProveedorRnc = {
  id: 'dgii',
  async consultar(rnc) {
    const r = await consultarDgii(rnc);
    return r.tipo === 'ok' ? { razonSocial: r.razonSocial, estado: r.estado || undefined, nombreComercial: r.nombreComercial } : null;
  },
};

export const PROVEEDORES_RNC: ProveedorRnc[] = [proveedorTutor, proveedorHistorial, proveedorDgii];

/** Normaliza (dígitos), valida la longitud y consulta los proveedores en orden. Sin coincidencia: `encontrado:false`. */
export async function resolverRnc(entrada: unknown): Promise<RncResuelto> {
  const rnc = soloDigitos(entrada);
  if (!longitudRncOk(rnc)) return { rnc, valido: false, encontrado: false };
  for (const p of PROVEEDORES_RNC) {
    let r: ResultadoRnc | null = null;
    try { r = await p.consultar(rnc); } catch { r = null; }
    if (r) return { rnc, valido: true, encontrado: true, razonSocial: r.razonSocial, fuente: p.id, ...(r.estado ? { estado: r.estado } : {}) };
  }
  return { rnc, valido: true, encontrado: false };
}
