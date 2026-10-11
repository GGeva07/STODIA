import type { Prisma } from '@prisma/client';
import type { CobroPago, EstadoDgii, ModalidadFiscal, NotaResumen, ReciboFin } from '@stodia/shared';
import { prisma } from '../db';
import { partesEnZona } from './cxc';
import { fmtCed } from './tutor-datos';

type Db = typeof prisma | Prisma.TransactionClient;

/** MetodoPago del recibo segun sus pagos: el del unico medio usado; NULL si el pago es mixto o no hay pagos (el detalle por medio es FinReciboPago). */
export async function metodoPagoIdDe(pays: CobroPago[], db: Db = prisma): Promise<string | null> {
  const nombres = [...new Set(pays.map(p => p.m))];
  if (nombres.length !== 1) return null;
  return (await db.metodoPago.findUnique({ where: { nombre: nombres[0] }, select: { id: true } }))?.id ?? null;
}

/** Linea de un recibo (FinReciboItem). cobroItemId = FinCobroItem que se cobro; ausente en lineas historicas sin cargo en cartera. */
export interface LineaRecibo { con: string; monto: number; cobroItemId?: string }

/** `include` de Prisma para leer un recibo completo (lineas, pagos, cajero, caja y titular): lo que necesita `reciboDto`. */
export const RECIBO_INC = {
  lineas: { orderBy: { orden: 'asc' as const }, include: { cobroItem: { select: { alumno: { select: { nombres: true, apellidos: true } }, notaDebito: { select: { id: true, ncf: true } } } } } },
  pagos: { orderBy: { orden: 'asc' as const }, include: { metodoPago: { select: { nombre: true } } } },
  cajero: { select: { nombre: true } },
  caja: { select: { codigo: true } },
  titular: { select: { cedula: true, email: true } },
  tipoComprobante: { select: { codigo: true, nombre: true } },
  /** Notas de credito / debito que modifican el recibo (badge «Con nota de crédito», neto). */
  notas: { select: { id: true, clase: true, ncf: true, monto: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
} as const;
type ReciboConDetalle = {
  lineas: { concepto: string; monto: number; cobroItemId: string | null }[];
  pagos: { monto: number; referencia: string; metodoPago: { nombre: string } }[];
};
/** Lineas con la forma de siempre: `{ con, monto }` y `cobroItemId` solo cuando existe. */
export const itemsDe = (r: Pick<ReciboConDetalle, 'lineas'>): LineaRecibo[] => r.lineas.map(l => ({ con: l.concepto, monto: l.monto, ...(l.cobroItemId ? { cobroItemId: l.cobroItemId } : {}) }));
/** Pagos con la forma de siempre: `{ m, r, amt }` (m = nombre EXACTO del medio de pago). */
export const paysDe = (r: Pick<ReciboConDetalle, 'pagos'>): CobroPago[] => r.pagos.map(p => ({ m: p.metodoPago.nombre, r: p.referencia, amt: p.monto }));

/** Instalacion de una sola sede (no hay catalogo de sucursales). */
export const SUCURSAL = 'Principal';
const fechaDMY = (tz: string, d: Date) => { const p = partesEnZona(tz, d); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`; };

type ReciboDb = Omit<ReciboConDetalle, 'lineas'> & {
  id: string; ncf: string; modalidad: string; estadoDgii: string; clienteRnc: string | null; clienteNombre: string | null; regimenEspecial: string | null;
  tipoComprobante: { codigo: string; nombre: string };
  tutor: string; hora: string; monto: number; est: string; abono: boolean; saldo: number; nc: string | null; change: number; createdAt: Date; cicloId: string;
  lineas: { concepto: string; monto: number; cobroItemId: string | null; cobroItem?: { alumno: { nombres: string; apellidos: string }; notaDebito?: { id: string; ncf: string } | null } | null }[];
  notas?: { id: string; clase: string; ncf: string; monto: number; createdAt: Date }[];
  cajero?: { nombre: string } | null; caja?: { codigo: string } | null; titular?: { cedula: string; email: string | null } | null;
};
/**
 * UNICA construccion del DTO de recibo (ReciboFin): la usan la emision (POST /cobros/procesar), la cuenta del POS (historial de turno) y la consulta
 * por id (GET /cobros/recibos/:id), de modo que el modal del recibo recibe SIEMPRE la misma forma. `cajero` = «Sistema» en recibos historicos sin cajero.
 */
export function reciboDto(r: ReciboDb, tz: string): ReciboFin {
  const pays = paysDe(r);
  const alumnos = [...new Set(r.lineas.map(l => l.cobroItem?.alumno).filter((a): a is { nombres: string; apellidos: string } => !!a).map(a => `${a.nombres.split(' ')[0]} ${a.apellidos.split(' ')[0]}`))];
  return {
    id: r.id, ncf: r.ncf, tutor: r.tutor, hora: r.hora, monto: r.monto, est: r.est as ReciboFin['est'], metodo: metodoDe(pays), abono: r.abono, saldo: r.saldo, nc: r.nc ?? undefined, change: r.change,
    items: itemsDe(r), pays,
    fecha: fechaDMY(tz, r.createdAt), cajero: r.cajero?.nombre ?? 'Sistema', caja: r.caja?.codigo ?? '', sucursal: SUCURSAL,
    cedula: r.titular ? fmtCed(r.titular.cedula) : undefined, email: r.titular?.email ?? undefined, alumnos, cicloId: r.cicloId,
    tipoComprobante: { codigo: r.tipoComprobante.codigo, nombre: r.tipoComprobante.nombre, modalidad: r.modalidad as ModalidadFiscal },
    ...(r.clienteRnc ? { clienteRnc: r.clienteRnc } : {}), ...(r.clienteNombre ? { clienteNombre: r.clienteNombre } : {}), ...(r.regimenEspecial ? { regimenEspecial: r.regimenEspecial } : {}),
    estadoDgii: r.estadoDgii as EstadoDgii,
    ...notasDeRecibo(r, tz),
  };
}
/** Notas del recibo: resumen, acreditado, neto y notas de debito cuyos cargos cobro este recibo. Solo aparecen cuando existen. */
function notasDeRecibo(r: ReciboDb, tz: string): Partial<ReciboFin> {
  const out: Partial<ReciboFin> = {};
  const notas: NotaResumen[] = (r.notas ?? []).map(n => ({ id: n.id, clase: n.clase as NotaResumen['clase'], ncf: n.ncf, monto: n.monto, fecha: fechaDMY(tz, n.createdAt) }));
  if (notas.length) { const ac = Math.round(notas.filter(n => n.clase === 'CREDITO').reduce((a, n) => a + n.monto, 0) * 100) / 100; out.notas = notas; out.acreditado = ac; out.neto = Math.max(0, Math.round((r.monto - ac) * 100) / 100); }
  const nds = new Map<string, string>();
  for (const l of r.lineas) if (l.cobroItem?.notaDebito) nds.set(l.cobroItem.notaDebito.id, l.cobroItem.notaDebito.ncf);
  if (nds.size) out.notasDebitoCobradas = [...nds].map(([id, ncf]) => ({ id, ncf }));
  return out;
}

/** Filas FinReciboItem de un recibo a partir de las lineas de la API. */
export const lineasData = (reciboId: string, lineas: LineaRecibo[]) => lineas.map((l, orden) => ({ reciboId, orden, concepto: l.con, monto: l.monto, cobroItemId: l.cobroItemId ?? null }));
/** Filas FinReciboPago a partir de los pagos de la API (el medio se resuelve por nombre exacto). Falla si el medio no existe en el catalogo. */
export async function pagosData(reciboId: string, pays: CobroPago[], db: Db = prisma) {
  const metodos = new Map((await db.metodoPago.findMany({ select: { id: true, nombre: true } })).map(m => [m.nombre, m.id]));
  return pays.map((p, orden) => {
    const metodoPagoId = metodos.get(p.m);
    if (!metodoPagoId) throw new Error(`Medio de pago «${p.m}» inexistente en el catálogo`);
    return { reciboId, orden, metodoPagoId, monto: p.amt, referencia: p.r ?? '' };
  });
}

/**
 * Metodo del recibo, DERIVADO de los pagos (no se guarda): un pago = su medio (las tarjetas se muestran como «Tarjeta»), varios = «Mixto».
 * `pays[].m` guarda siempre el nombre EXACTO del catalogo metodosPago.
 */
export function metodoDe(pays: CobroPago[]): string {
  if (pays.length > 1) return 'Mixto';
  const m = pays[0]?.m ?? '';
  return m.startsWith('Tarjeta') ? 'Tarjeta' : m;
}
/** Cobrado integramente en efectivo (el resto del recaudo cuenta como banco/tarjeta/transferencia/cheque). */
export const esEfectivo = (pays: CobroPago[]) => pays.length === 1 && pays[0].m === 'Efectivo';

/** Caja (id del catalogo cajas) asignada al usuario segun el personal (Empleado): por cuenta enlazada, por usuario o, si no, por nombre. NULL si no tiene caja. */
export async function cajaDe(user: { sub?: string; usuario: string; nombre: string }): Promise<string | null> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const rows = await prisma.empleado.findMany({ where: { estado: 'Activo', cajaId: { not: null } }, include: { user: { select: { id: true, usuario: true } } } });
  const mio = rows.find(e => (user.sub && e.userId === user.sub) || (e.user && norm(e.user.usuario) === norm(user.usuario)) || (e.usuario && norm(e.usuario) === norm(user.usuario)) || norm(e.nombre) === norm(user.nombre));
  return mio?.cajaId ?? null;
}

/** MetodoPago ACTIVO para lo que envia un cliente ('Tarjeta' -> 'Tarjeta de Crédito'). Sin coincidencia devuelve null. */
export async function metodoCatalogo(pay: string): Promise<{ id: string; nombre: string } | null> {
  const rows = await prisma.metodoPago.findMany({ where: { estado: 'Activo' }, orderBy: { id: 'asc' }, select: { id: true, nombre: true } });
  return rows.find(r => r.nombre === pay) ?? rows.find(r => r.nombre.toLowerCase().startsWith(pay.toLowerCase())) ?? null;
}
