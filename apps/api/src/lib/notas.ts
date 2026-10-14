import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type {
  EstadoDgii, ModalidadFiscal, MotivoNotaDto, NotaBuscarFila, NotaCargoDto, NotaComprobanteDisp, NotaCreditoReq, NotaDebitoReq, NotaDisponible, NotaFila, NotaFiscalDto, NotaLineaDisponible, NotaLineaDto, NotaListaRes, NotaResumen,
} from '@stodia/shared';
import { prisma } from '../db';
import { audit } from './audit';
import { cfgGet } from './sisconfig';
import { digits, gst, SEC_INC } from './personas';
import { fmtCed } from './tutor-datos';
import { partesEnZona, hoyISO, zonaHoraria } from './cxc';
import { cicloActivoRow } from './ciclo';
import { rncValido } from './rnc';
import { nextSeq, nowHM, round2 } from '../fin-utils';
import { cajaDe, SUCURSAL } from './recibos';
import { supervisorOk, supervisorSiempre } from './supervisor';
import { FiscalError, asignarNcf, contextoFiscal, disponibilidad, enSerie, refrescarEstados, transaccionFiscal } from './fiscal';
import { MOTIVO_ANULACION, idMotivo } from './notas-motivos';

/**
 * NOTAS DE CREDITO / DEBITO (Cobros). Servicio UNICO: lo usan los endpoints POST /cobros/notas/credito|debito y la anulacion de recibos (POST /cobros/recibos/:id/anular).
 * Reglas y decisiones de contabilidad documentadas en docs/fiscal-ncf.md §12. Todo efecto (NCF, nota, lineas, reembolsos, cargos reabiertos o creados, inventario, estado del
 * recibo) ocurre en UNA transaccion; el NCF se asigna PRIMERO (serializa en la fila de la secuencia) y se revierte con la nota si algo falla.
 */
type Db = typeof prisma | Prisma.TransactionClient;
const TOL = 0.005;
const MAX_MONTO = 100_000_000;
export type Peticion = Pick<FastifyRequest, 'user' | 'ip'>;

export class NotaError extends FiscalError {
  constructor(statusCode: number, message: string, public code?: string, public extra?: Record<string, unknown>) { super(statusCode, message); this.name = 'NotaError'; }
}
const bad = (m: string) => new NotaError(400, m);
const conflict = (m: string, code?: string) => new NotaError(409, m, code);

/** 409 con enlace a Configuracion › Fiscal cuando no hay secuencia B03/B04/E33/E34 disponible. */
export const ENLACE_FISCAL = '/config?tab=fiscal';
const sinSecuencia = (msg: string) => new NotaError(409, msg, 'SIN_SECUENCIA', { enlace: ENLACE_FISCAL });

// ---------------------------------------------------------------- includes y DTO
const NOTA_INC = {
  lineas: { orderBy: { orden: 'asc' as const }, include: { cobroItem: { select: { alumno: { select: { nombres: true, apellidos: true } } } } } },
  reembolsos: { orderBy: { orden: 'asc' as const }, include: { metodoPago: { select: { nombre: true } } } },
  cajero: { select: { nombre: true } }, caja: { select: { codigo: true } },
  tipoComprobante: { select: { codigo: true, nombre: true } },
  motivo: { select: { codigo: true, nombre: true, codigoDgii: true } },
  ciclo: { select: { nombre: true } },
  recibo: { select: { id: true, ncf: true, monto: true, est: true, hora: true, createdAt: true, modalidad: true, tutor: true, tipoComprobante: { select: { codigo: true, nombre: true } } } },
  venta: { select: { id: true, ncf: true, total: true, createdAt: true } },
  tutor: { select: { nombre: true, cedula: true, email: true } },
  cargos: { orderBy: { orden: 'asc' as const }, select: { id: true, con: true, al: true, vence: true, monto: true, paid: true } },
} as const;
export { NOTA_INC };

type NotaConDetalle = Prisma.NotaFiscalGetPayload<{ include: typeof NOTA_INC }>;
const dmy = (tz: string, d: Date) => { const p = partesEnZona(tz, d); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`; };
const nombreAlumno = (a: { nombres: string; apellidos: string }) => `${a.nombres.split(' ')[0]} ${a.apellidos.split(' ')[0]}`;
const clasifica = (n: { ncf: string }): ModalidadFiscal => (n.ncf.startsWith('E') ? 'ELECTRONICA' : 'FISICA');

/** UNICO constructor del DTO completo de una nota: emision, consulta, reimpresion y correo usan este. */
export function notaDto(n: NotaConDetalle, tz: string): NotaFiscalDto {
  const credito = n.clase === 'CREDITO';
  const lineas: NotaLineaDto[] = n.lineas.map(l => ({
    concepto: l.concepto, monto: l.monto, efecto: l.efecto as NotaLineaDto['efecto'],
    ...(l.cantidad ? { cantidad: l.cantidad } : {}), ...(l.cobroItem?.alumno ? { alumno: nombreAlumno(l.cobroItem.alumno) } : {}),
    ...(l.cobroItemId ? { cobroItemId: l.cobroItemId } : {}), ...(l.productoId ? { productoId: l.productoId } : {}),
  }));
  const alumnos = [...new Set(n.lineas.map(l => l.cobroItem?.alumno).filter((a): a is { nombres: string; apellidos: string } => !!a).map(nombreAlumno))];
  const reabiertos = n.lineas.filter(l => l.efecto === 'ReabreCargo');
  const doc = n.recibo
    ? { tipo: 'recibo' as const, id: n.recibo.id, ncf: n.recibo.ncf, tipoComprobante: { codigo: n.recibo.tipoComprobante.codigo, nombre: n.recibo.tipoComprobante.nombre, modalidad: n.recibo.modalidad as ModalidadFiscal }, fecha: dmy(tz, n.recibo.createdAt), hora: n.recibo.hora, monto: n.recibo.monto, est: n.recibo.est }
    : { tipo: 'venta' as const, id: n.venta!.id, ncf: n.venta!.ncf, fecha: dmy(tz, n.venta!.createdAt), monto: n.venta!.total };
  return {
    id: n.id, clase: n.clase as NotaFiscalDto['clase'], ncf: n.ncf, tipoComprobante: { codigo: n.tipoComprobante.codigo, nombre: n.tipoComprobante.nombre, modalidad: n.modalidad as ModalidadFiscal },
    estadoDgii: n.estadoDgii as EstadoDgii, estado: 'Emitida', fecha: dmy(tz, n.createdAt), hora: n.hora, cajero: n.cajero?.nombre ?? 'Sistema', caja: n.caja?.codigo ?? '', sucursal: SUCURSAL, ciclo: n.ciclo.nombre, cicloId: n.cicloId,
    monto: n.monto, motivo: { codigo: n.motivo.codigo, nombre: n.motivo.nombre, codigoDgii: n.motivo.codigoDgii }, motivoTexto: n.motivoTexto, fueraDePlazo: n.fueraDePlazo,
    documento: doc,
    cliente: { nombre: n.clienteNombre ?? n.tutor?.nombre ?? 'Consumidor final', ...(n.clienteRnc ? { rnc: n.clienteRnc } : {}), ...(n.tutor?.cedula ? { cedula: fmtCed(n.tutor.cedula) } : {}), ...(n.tutor?.email ? { email: n.tutor.email } : {}) },
    alumnos, lineas, reembolsos: n.reembolsos.map(r => ({ metodo: r.metodoPago.nombre, monto: r.monto, referencia: r.referencia })),
    ...(credito ? {} : { cargos: n.cargos.map((c): NotaCargoDto => ({ id: c.id, con: c.con, al: c.al, vence: c.vence, monto: c.monto, pagado: c.paid })) }),
    ...(credito && n.recibo ? { documentoAnulado: n.recibo.est === 'Anulado' } : {}),
    ...(credito ? { reabiertos: reabiertos.length, montoReabierto: round2(reabiertos.reduce((a, l) => a + l.monto, 0)), unidadesRepuestas: n.lineas.filter(l => l.efecto === 'Devolucion').reduce((a, l) => a + l.cantidad, 0) } : {}),
  };
}

type FilaDb = { id: string; clase: string; ncf: string; modalidad: string; estadoDgii: string; tipoComprobante: { codigo: string; nombre: string }; reciboId: string | null; ventaId: string | null; ncfModificado: string; clienteNombre: string | null; tutor: { nombre: string } | null; monto: number; motivo: { codigo: string; nombre: string }; motivoTexto: string; cajero: { nombre: string } | null; createdAt: Date; hora: string };
export const FILA_SELECT = {
  id: true, clase: true, ncf: true, modalidad: true, estadoDgii: true, tipoComprobante: { select: { codigo: true, nombre: true } }, reciboId: true, ventaId: true, ncfModificado: true, clienteNombre: true, tutor: { select: { nombre: true } },
  monto: true, motivo: { select: { codigo: true, nombre: true } }, motivoTexto: true, cajero: { select: { nombre: true } }, createdAt: true, hora: true,
} as const;
export function notaFila(n: FilaDb, tz: string): NotaFila {
  return {
    id: n.id, clase: n.clase as NotaFila['clase'], ncf: n.ncf, tipoComprobante: { codigo: n.tipoComprobante.codigo, nombre: n.tipoComprobante.nombre, modalidad: n.modalidad as ModalidadFiscal }, estadoDgii: n.estadoDgii as EstadoDgii,
    documento: { tipo: n.reciboId ? 'recibo' : 'venta', id: (n.reciboId ?? n.ventaId)!, ncf: n.ncfModificado }, tutor: n.clienteNombre ?? n.tutor?.nombre ?? 'Consumidor final', monto: n.monto,
    motivo: { codigo: n.motivo.codigo, nombre: n.motivo.nombre }, ...(n.motivoTexto ? { motivoTexto: n.motivoTexto } : {}), cajero: n.cajero?.nombre ?? 'Sistema', fecha: dmy(tz, n.createdAt), hora: n.hora,
  };
}

export const motivosDto = async (): Promise<MotivoNotaDto[]> =>
  (await prisma.motivoNota.findMany({ where: { estado: 'Activo' }, orderBy: { orden: 'asc' } })).map(m => ({ id: m.id, codigo: m.codigo, nombre: m.nombre, origen: m.origen as MotivoNotaDto['origen'], aplica: m.aplica as MotivoNotaDto['aplica'], codigoDgii: m.codigoDgii }));

async function motivoDe(clave: string, clase: 'CREDITO' | 'DEBITO') {
  const m = await prisma.motivoNota.findFirst({ where: { OR: [{ id: String(clave ?? '') }, { codigo: String(clave ?? '') }] } });
  if (!m || m.estado !== 'Activo') throw bad('Selecciona un motivo válido para la nota');
  if (m.aplica !== 'AMBAS' && m.aplica !== clase) throw bad(`El motivo «${m.nombre}» no aplica a una nota de ${clase === 'CREDITO' ? 'crédito' : 'débito'}`);
  return m;
}

// ---------------------------------------------------------------- documentos y disponibilidad
const REC_INC = {
  lineas: { orderBy: { orden: 'asc' as const }, include: { cobroItem: { include: { alumno: { include: SEC_INC }, servicio: { select: { productoId: true } } } } } },
  pagos: { orderBy: { orden: 'asc' as const }, include: { metodoPago: { select: { id: true, nombre: true } } } },
  ciclo: { select: { id: true, nombre: true, estado: true } },
  titular: { select: { id: true, nombre: true, cedula: true, email: true } },
  tipoComprobante: { select: { codigo: true, nombre: true } },
} as const;
type ReciboDoc = Prisma.FinReciboGetPayload<{ include: typeof REC_INC }>;
const VENTA_INC = { lineas: { orderBy: { id: 'asc' as const }, include: { producto: { select: { id: true, stock: true, name: true } } } } } as const;
type VentaDoc = Prisma.FinVentaGetPayload<{ include: typeof VENTA_INC }>;

interface LineaEst { id: number; concepto: string; alumno?: string; alumnoId?: string; bruto: number; monto: number; acreditado: number; restante: number; cobroItemId?: string; tipoCargo?: string; productoId?: string; cantidad?: number; devuelta?: number; unit?: number; inventario?: boolean }
interface Estado {
  tipo: 'recibo' | 'venta'; recibo?: ReciboDoc; venta?: VentaDoc;
  id: string; ncf: string; modalidad: ModalidadFiscal; monto: number; anulado: boolean; cicloId: string; cicloEstado: string; cicloNombre: string; creado: Date;
  lineas: LineaEst[]; acreditado: number; disponible: number;
}
const sumaRows = (rows: { monto: number }[]) => round2(rows.reduce((a, r) => a + r.monto, 0));

/** Estado de acreditacion de un recibo o venta: lineas con lo acreditado y lo restante, total acreditado y disponible. */
export async function estadoDocumento(db: Db, ref: { reciboId?: string | null; ventaId?: string | null }): Promise<Estado> {
  if (ref.reciboId) {
    const r = await db.finRecibo.findUnique({ where: { id: ref.reciboId }, include: REC_INC });
    if (!r) throw new NotaError(404, 'Recibo no encontrado');
    const [porLinea, notas] = await Promise.all([
      db.notaFiscalLinea.groupBy({ by: ['reciboItemId'], where: { nota: { reciboId: r.id, clase: 'CREDITO' }, reciboItemId: { not: null } }, _sum: { monto: true } }),
      db.notaFiscal.aggregate({ where: { reciboId: r.id, clase: 'CREDITO' }, _sum: { monto: true } }),
    ]);
    const cred = new Map(porLinea.map(x => [x.reciboItemId!, x._sum.monto ?? 0]));
    const suma = sumaRows(r.lineas), factor = suma > 0 && r.monto < suma - TOL ? r.monto / suma : 1; // descuento (pronto / exoneracion): la linea vale su parte proporcional del cobro real
    const acreditado = round2(notas._sum.monto ?? 0);
    const lineas: LineaEst[] = r.lineas.map(l => {
      const neto = round2(l.monto * factor), ac = round2(cred.get(l.id) ?? 0), al = l.cobroItem?.alumno;
      return { id: l.id, concepto: l.concepto, ...(al ? { alumno: nombreAlumno(al), alumnoId: al.id } : {}), bruto: l.monto, monto: neto, acreditado: ac, restante: Math.max(0, round2(neto - ac)), ...(l.cobroItemId ? { cobroItemId: l.cobroItemId, tipoCargo: l.cobroItem?.tipo } : {}) };
    });
    return { tipo: 'recibo', recibo: r, id: r.id, ncf: r.ncf, modalidad: r.modalidad as ModalidadFiscal, monto: r.monto, anulado: r.est === 'Anulado', cicloId: r.cicloId, cicloEstado: r.ciclo.estado, cicloNombre: r.ciclo.nombre, creado: r.createdAt, lineas, acreditado, disponible: Math.max(0, round2(r.monto - acreditado)) };
  }
  const v = await db.finVenta.findUnique({ where: { id: ref.ventaId! }, include: VENTA_INC });
  if (!v) throw new NotaError(404, 'Venta no encontrada');
  const [porLinea, notas] = await Promise.all([
    db.notaFiscalLinea.groupBy({ by: ['ventaItemId'], where: { nota: { ventaId: v.id, clase: 'CREDITO' }, ventaItemId: { not: null } }, _sum: { monto: true, cantidad: true } }),
    db.notaFiscal.aggregate({ where: { ventaId: v.id, clase: 'CREDITO' }, _sum: { monto: true } }),
  ]);
  const cred = new Map(porLinea.map(x => [x.ventaItemId!, { monto: x._sum.monto ?? 0, cant: x._sum.cantidad ?? 0 }]));
  const sub = v.lineas.reduce((a, l) => a + l.precio * l.cantidad, 0), gravado = v.lineas.filter(l => l.tax).reduce((a, l) => a + l.precio * l.cantidad, 0);
  const tasa = gravado > 0 ? Math.max(0, (v.total - sub) / gravado) : 0; // ITBIS efectivo de la venta (no se guarda la tasa)
  const acreditado = round2(notas._sum.monto ?? 0);
  const lineas: LineaEst[] = v.lineas.map(l => {
    const unit = round2(l.precio * (l.tax ? 1 + tasa : 1)), bruto = round2(l.precio * l.cantidad * (l.tax ? 1 + tasa : 1)), c = cred.get(l.id), ac = round2(c?.monto ?? 0);
    return { id: l.id, concepto: `${l.cantidad} × ${l.nombre}`, bruto, monto: bruto, acreditado: ac, restante: Math.max(0, round2(bruto - ac)), productoId: l.productoId, cantidad: l.cantidad, devuelta: c?.cant ?? 0, unit, inventario: l.producto.stock != null };
  });
  const ciclo = await cicloActivoRow(db as typeof prisma);
  return { tipo: 'venta', venta: v, id: v.id, ncf: v.ncf, modalidad: v.ncf.startsWith('E') ? 'ELECTRONICA' : 'FISICA', monto: v.total, anulado: false, cicloId: ciclo?.id ?? '', cicloEstado: ciclo?.estado ?? 'Activo', cicloNombre: ciclo?.nombre ?? '', creado: v.createdAt, lineas, acreditado, disponible: Math.max(0, round2(v.total - acreditado)) };
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
async function plazoDe(creado: Date) {
  const tz = await zonaHoraria(), fin = await cfgGet('finanzas'), plazo = Math.max(0, Math.round(Number(fin.notaPlazoDias ?? 30)));
  const dias = Math.max(0, diasEntre(hoyISO(tz, creado), hoyISO(tz)));
  return { tz, plazo, dias, fuera: plazo > 0 && dias > plazo, cicloAnterior: Number(fin.notaCicloAnterior ?? 0) === 1 };
}

/** Motivo (texto) por el que NO se puede emitir una nota sobre el documento; null si se puede. */
function bloqueo(est: Estado, activoId: string | undefined, cicloAnterior: boolean): string | null {
  if (est.tipo === 'recibo' && est.cicloEstado === 'Cerrado') return 'El recibo pertenece a un ciclo lectivo cerrado (solo lectura)';
  if (est.tipo === 'recibo' && est.cicloId !== activoId && !cicloAnterior) return 'El recibo es de un ciclo lectivo anterior: las notas solo se emiten sobre recibos del ciclo activo (se puede permitir en Configuración › Finanzas)';
  return null;
}

const dispComprobante = async (logico: 'NOTA_CREDITO' | 'NOTA_DEBITO', modalidad: ModalidadFiscal): Promise<NotaComprobanteDisp> => {
  const d = (await disponibilidad(prisma, [logico], modalidad))[0];
  return { codigo: d.codigo, modalidad, disponible: d.disponible, restantes: d.restantes, ...(d.disponible ? {} : { motivo: d.motivo }) };
};

const mediosDe = (r: ReciboDoc | undefined) => (r ? r.pagos.map(p => ({ metodo: p.metodoPago.nombre, monto: p.monto })) : []);

/** GET /cobros/recibos/:id/notas-disponible y /cobros/ventas/:id/notas-disponible: lo que se puede acreditar y las lineas acreditables. */
export async function notaDisponible(ref: { reciboId?: string; ventaId?: string }): Promise<NotaDisponible> {
  await refrescarEstados();
  const est = await estadoDocumento(prisma, ref);
  const { tz, plazo, dias, fuera, cicloAnterior } = await plazoDe(est.creado);
  const activo = await cicloActivoRow();
  const bq = bloqueo(est, activo?.id, cicloAnterior);
  const r = est.recibo, v = est.venta;
  let motivoNoCredito: string | undefined;
  if (bq) motivoNoCredito = bq; else if (est.anulado) motivoNoCredito = 'El recibo ya está anulado'; else if (est.disponible <= TOL) motivoNoCredito = est.tipo === 'recibo' ? 'El recibo ya fue acreditado por completo' : 'La venta ya fue devuelta por completo';
  let motivoNoDebito: string | undefined;
  if (est.tipo === 'venta') motivoNoDebito = 'Las notas de débito se emiten sobre recibos de cobros (una venta rápida no tiene cuenta de alumno)'; else if (bq) motivoNoDebito = bq; else if (est.anulado) motivoNoDebito = 'El recibo está anulado: un comprobante anulado no se modifica con una nota de débito';
  const alumnos = new Map<string, string>();
  if (r) {
    for (const l of est.lineas) if (l.alumnoId) alumnos.set(l.alumnoId, l.alumno!);
    if (r.tutorId) for (const a of await prisma.alumno.findMany({ where: { tutorId: r.tutorId, estado: 'Activo' }, select: { id: true, nombres: true, apellidos: true }, orderBy: { id: 'asc' } })) if (!alumnos.has(a.id)) alumnos.set(a.id, nombreAlumno(a));
  }
  const notas = await prisma.notaFiscal.findMany({ where: est.recibo ? { reciboId: est.id } : { ventaId: est.id }, select: FILA_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const mod = est.modalidad;
  return {
    documento: {
      tipo: est.tipo, id: est.id, ncf: est.ncf, monto: est.monto, modalidad: mod, tutor: r?.tutor ?? 'Consumidor final', ...(r?.titular ? { cedula: fmtCed(r.titular.cedula) } : {}), cicloId: est.cicloId,
      alumnos: [...new Set(est.lineas.map(l => l.alumno).filter((x): x is string => !!x))], est: r?.est ?? 'Activo',
      ...(r ? { tipoComprobante: { codigo: r.tipoComprobante.codigo, nombre: r.tipoComprobante.nombre, modalidad: mod } } : {}), fecha: dmy(tz, est.creado), ...(r ? { hora: r.hora } : {}),
    },
    acreditado: est.acreditado, disponible: est.disponible, neto: round2(est.monto - est.acreditado),
    puedeCredito: !motivoNoCredito, puedeDebito: !motivoNoDebito, ...(motivoNoCredito ? { motivoNoCredito } : {}), ...(motivoNoDebito ? { motivoNoDebito } : {}),
    plazoDias: plazo, diasTranscurridos: dias, fueraDePlazo: fuera,
    lineas: est.lineas.map((l): NotaLineaDisponible => ({
      id: l.id, concepto: l.concepto, ...(l.alumno ? { alumno: l.alumno } : {}), monto: l.monto, acreditado: l.acreditado, restante: l.restante,
      ...(l.cobroItemId ? { cobroItemId: l.cobroItemId } : {}), reabrible: !!l.cobroItemId && est.tipo === 'recibo', ...(l.tipoCargo ? { tipoCargo: l.tipoCargo } : {}),
      ...(l.productoId ? { productoId: l.productoId, cantidad: l.cantidad, cantidadDevuelta: l.devuelta, cantidadRestante: Math.max(0, (l.cantidad ?? 0) - (l.devuelta ?? 0)), precioUnit: l.unit, inventario: l.inventario } : {}),
    })),
    notas: notas.map(n => notaFila(n, tz)),
    comprobanteCredito: await dispComprobante('NOTA_CREDITO', mod), comprobanteDebito: await dispComprobante('NOTA_DEBITO', mod),
    alumnosDebito: [...alumnos].map(([id, nombre]) => ({ id, nombre })), mediosCobro: mediosDe(r),
    ...(est.venta && est.venta.doc === 'cf2' ? { requiereCliente: true } : {}),
  };
}

// ---------------------------------------------------------------- reembolsos
interface ReembolsoIn { metodoPagoId: string; monto: number; referencia: string }
async function resolverReembolsos(reqs: NotaCreditoReq['reembolsos'], monto: number): Promise<ReembolsoIn[]> {
  if (!Array.isArray(reqs) || !reqs.length) throw bad('Indica cómo se devuelve el dinero: al menos un medio de pago en el reembolso');
  const catalogo = await prisma.metodoPago.findMany({ where: { estado: 'Activo' } });
  const out: ReembolsoIn[] = [];
  for (const r of reqs) {
    const m = catalogo.find(x => x.nombre === r.metodo);
    if (!m) throw bad(`Medio de pago «${r.metodo}» no configurado o inactivo`);
    const amt = round2(Number(r.monto));
    if (!Number.isFinite(amt) || amt <= 0) throw bad('Cada reembolso debe tener un monto mayor que cero');
    const ref = String(r.referencia ?? '').trim().slice(0, 100);
    if (m.ref && !ref) throw bad(`Falta la referencia del medio de pago (${m.ref})`);
    out.push({ metodoPagoId: m.id, monto: amt, referencia: ref });
  }
  const tot = round2(out.reduce((a, r) => a + r.monto, 0));
  if (Math.abs(tot - monto) > TOL) throw bad(`El dinero devuelto (RD$ ${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}) debe ser igual al monto de la nota (RD$ ${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}): se devuelve todo lo que se acredita`);
  return out;
}

// ---------------------------------------------------------------- nota de credito
interface LineaCalculada { reciboItemId?: number; ventaItemId?: number; cobroItemId?: string; productoId?: string; cantidad: number; concepto: string; monto: number; efecto: 'ReabreCargo' | 'Devolucion' | 'Ajuste'; bruto: number }

function calcularLineas(est: Estado, b: NotaCreditoReq): LineaCalculada[] {
  const out: LineaCalculada[] = [];
  const lineasReq = b.total ? est.lineas.filter(l => l.restante > TOL).map(l => ({ id: l.id, monto: undefined as number | undefined, cantidad: undefined as number | undefined, reabrir: b.reabrirCargos !== false && !!l.cobroItemId })) : (b.lineas ?? []); // anulacion total: los cargos vuelven a la deuda (las lineas historicas sin cargo asociado solo se acreditan)
  if (!lineasReq.length) throw bad('Selecciona al menos una línea para acreditar');
  const vistos = new Set<number>();
  for (const q of lineasReq) {
    const l = est.lineas.find(x => x.id === Number(q.id));
    if (!l) throw bad(est.tipo === 'recibo' ? 'Una de las líneas no pertenece a este recibo' : 'Una de las líneas no pertenece a esta venta');
    if (vistos.has(l.id)) throw bad('Una línea está repetida en la nota');
    vistos.add(l.id);
    if (est.tipo === 'venta') {
      const disp = (l.cantidad ?? 0) - (l.devuelta ?? 0), cant = q.cantidad === undefined ? disp : Number(q.cantidad);
      if (!Number.isInteger(cant) || cant < 1) throw bad(`La cantidad a devolver de «${l.concepto}» debe ser un entero mayor que cero`);
      if (cant > disp) throw bad(`Solo quedan ${disp} unidad(es) de «${l.concepto}» por devolver`);
      const monto = cant === disp ? l.restante : round2((l.unit ?? 0) * cant);
      out.push({ ventaItemId: l.id, productoId: l.productoId, cantidad: cant, concepto: l.concepto.replace(/^\d+ × /, `${cant} × `), monto: Math.min(monto, l.restante), efecto: 'Devolucion', bruto: l.bruto });
      continue;
    }
    const monto = q.monto === undefined || q.monto === null ? l.restante : round2(Number(q.monto));
    if (!Number.isFinite(monto) || monto <= 0) throw bad(`El monto a acreditar de «${l.concepto}» debe ser mayor que cero`);
    if (monto > l.restante + TOL) throw bad(`No se puede acreditar RD$ ${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} de «${l.concepto}»: ${l.acreditado > 0 ? `ya se acreditaron RD$ ${l.acreditado.toLocaleString('en-US', { minimumFractionDigits: 2 })} y ` : ''}solo quedan RD$ ${l.restante.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    const completa = Math.abs(monto - l.restante) <= TOL;
    let efecto: LineaCalculada['efecto'] = 'Ajuste';
    if (q.reabrir) {
      if (!l.cobroItemId) throw bad(`«${l.concepto}» no tiene un cargo asociado: no se puede volver a cobrar (acredítala sin reabrir)`);
      if (!completa) throw bad(`Para volver a cobrar «${l.concepto}» hay que acreditarla completa (RD$ ${l.restante.toLocaleString('en-US', { minimumFractionDigits: 2 })}); un crédito parcial se registra como ajuste sin reabrir el cargo`);
      efecto = 'ReabreCargo';
    }
    out.push({ reciboItemId: l.id, ...(l.cobroItemId ? { cobroItemId: l.cobroItemId } : {}), cantidad: 0, concepto: l.concepto, monto: completa ? l.restante : monto, efecto, bruto: l.bruto });
  }
  return out;
}

/** Valida el resto de reglas del documento (mismas dentro y fuera de la transaccion). */
async function validarDocumento(est: Estado, motivo: { codigo: string }, b: { motivoTexto?: string }, monto: number, lineas: LineaCalculada[]) {
  const { plazo, dias, fuera, cicloAnterior } = await plazoDe(est.creado);
  const activo = await cicloActivoRow();
  const bq = bloqueo(est, activo?.id, cicloAnterior);
  if (bq) throw conflict(bq);
  if (est.anulado) throw conflict('El recibo ya está anulado');
  if (est.disponible <= TOL) throw conflict(est.tipo === 'recibo' ? 'El recibo ya fue acreditado por completo' : 'La venta ya fue devuelta por completo');
  if (monto > est.disponible + TOL) {
    const m = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    throw new NotaError(est.acreditado > 0 ? 409 : 400, `El acumulado de notas de crédito no puede exceder el ${est.tipo === 'recibo' ? 'recibo' : 'comprobante'}: ${m(est.monto)}${est.acreditado > 0 ? ` (ya acreditado ${m(est.acreditado)}, disponible ${m(est.disponible)})` : ''}, intentas acreditar ${m(monto)}`);
  }
  const texto = String(b.motivoTexto ?? '').trim();
  if (fuera && texto.length < 10) throw bad(`El recibo tiene ${dias} días (el plazo es de ${plazo}): escribe el motivo de la nota (al menos 10 caracteres) para emitirla fuera de plazo`);
  if (motivo.codigo === '02' && texto.length < 3) throw bad('La corrección de texto exige describir el texto corregido');
  if (motivo.codigo === MOTIVO_ANULACION) {
    const completo = est.tipo === 'recibo' && est.acreditado <= TOL && Math.abs(monto - est.disponible) <= TOL && lineas.length === est.lineas.length;
    if (!completo) throw bad('La anulación (motivo 01) acredita el comprobante COMPLETO y sin notas previas: para un crédito parcial usa «Corrección de montos» u otro motivo');
  }
  return { fuera };
}

const esUnica = (e: unknown) => { const x = e as { code?: string; message?: string }; return x?.code === 'P2002' || /UNIQUE|duplicate key|2601|2627/i.test(String(x?.message ?? '')); };

async function porClave(clave: string) {
  return prisma.notaFiscal.findUnique({ where: { idempotencyKey: clave }, include: NOTA_INC });
}

/** Emite una nota de credito. Idempotente por `idempotencyKey`. `interno` = reembolsos ya resueltos y supervisor ya validado (anulacion de recibo). */
export async function emitirCredito(req: Peticion & Pick<FastifyRequest, 'user' | 'ip'>, b: NotaCreditoReq, interno?: { reembolsos?: ReembolsoIn[] }): Promise<{ nota: NotaFiscalDto; repetida: boolean }> {
  const tz = await zonaHoraria();
  const clave = String(b.idempotencyKey ?? '').trim();
  if (clave.length < 8 || clave.length > 200) throw bad('Falta la clave de idempotencia de la nota (idempotencyKey)');
  const previa = await porClave(clave);
  if (previa) return { nota: notaDto(previa, tz), repetida: true };
  if (!!b.reciboId === !!b.ventaId) throw bad('Indica el recibo o la venta que se modifica (exactamente uno)');
  const motivo = await motivoDe(b.motivo, 'CREDITO');
  await refrescarEstados();
  const est = await estadoDocumento(prisma, { reciboId: b.reciboId, ventaId: b.ventaId });
  const { cicloAnterior: ca0 } = await plazoDe(est.creado);
  const bq0 = bloqueo(est, (await cicloActivoRow())?.id, ca0);
  if (bq0) throw conflict(bq0);
  if (est.anulado) throw conflict('El recibo ya está anulado');
  if (est.disponible <= TOL) throw conflict(est.tipo === 'recibo' ? 'El recibo ya fue acreditado por completo' : 'La venta ya fue devuelta por completo');
  const lineas = calcularLineas(est, b);
  const monto = round2(lineas.reduce((a, l) => a + l.monto, 0));
  if (monto <= 0) throw bad('El monto de la nota debe ser mayor que cero');
  const { fuera } = await validarDocumento(est, motivo, b, monto, lineas);
  const reembolsos = interno?.reembolsos ?? await resolverReembolsos(b.reembolsos, monto);
  // cliente
  let clienteNombre: string | null, clienteRnc: string | null;
  if (est.recibo) { clienteNombre = est.recibo.clienteNombre ?? est.recibo.tutor; clienteRnc = est.recibo.clienteRnc; }
  else {
    clienteNombre = String(b.clienteNombre ?? '').trim().slice(0, 200) || 'Consumidor final'; clienteRnc = digits(b.clienteRnc ?? '') || null;
    if (est.venta!.doc === 'cf2' && (!clienteRnc || clienteNombre === 'Consumidor final')) throw bad('La venta fue con crédito fiscal: indica el RNC y la razón social del comprador para la nota');
    if (clienteRnc && !rncValido(clienteRnc)) throw bad('El RNC o cédula del cliente debe tener 9 u 11 dígitos');
  }
  // comprobante B04/E34 segun la modalidad del NCF modificado
  const disp = (await disponibilidad(prisma, ['NOTA_CREDITO'], est.modalidad))[0];
  if (!disp.disponible) throw sinSecuencia(disp.motivo!);
  const ctx = await contextoFiscal('NOTA_CREDITO', est.modalidad);
  // supervisor SIEMPRE (token de un solo uso): lo ultimo antes de escribir, para no quemar el token por un error de validacion
  if (!interno) {
    const sup = await supervisorSiempre(req as FastifyRequest, b.pin, 'nota.credito');
    if (!sup.ok) throw new NotaError(sup.status, sup.error, undefined, sup.retryAfter ? { retryAfter: sup.retryAfter } : undefined);
  }
  const id = 'NC-' + String(await nextSeq('notac')).padStart(4, '0');
  const cajaId = await cajaDe(req.user);
  let fiscal!: Awaited<ReturnType<typeof asignarNcf>>;
  let anulado = false, reabiertos = 0;
  try {
    const row = await transaccionFiscal(async tx => {
      fiscal = await asignarNcf(tx, 'NOTA_CREDITO', ctx); // PRIMER paso: serializa en la fila de la secuencia
      // revalidacion DENTRO de la transaccion (otra nota pudo acreditar lo mismo entre la lectura y el bloqueo de la secuencia)
      const ahora = await estadoDocumento(tx, { reciboId: b.reciboId, ventaId: b.ventaId });
      const lineas2 = calcularLineas(ahora, b);
      const monto2 = round2(lineas2.reduce((a, l) => a + l.monto, 0));
      if (Math.abs(monto2 - monto) > TOL || ahora.anulado) throw conflict('El comprobante cambió mientras se emitía la nota (otra nota se emitió a la vez): revisa y vuelve a intentarlo');
      await tx.notaFiscal.create({
        data: {
          id, clase: 'CREDITO', tipoComprobanteId: fiscal.codigo, secuenciaFiscalId: fiscal.secuenciaFiscalId, ncf: fiscal.ncf, modalidad: fiscal.modalidad, estadoDgii: fiscal.estadoDgii,
          reciboId: b.reciboId ?? null, ventaId: b.ventaId ?? null, ncfModificado: est.ncf, tutorId: est.recibo?.tutorId ?? null, clienteNombre, clienteRnc, cicloId: est.recibo ? est.recibo.cicloId : est.cicloId,
          motivoId: motivo.id, motivoTexto: String(b.motivoTexto ?? '').trim().slice(0, 500), monto, fueraDePlazo: fuera, cajeroId: req.user.sub, cajaId, hora: nowHM(), idempotencyKey: clave,
          reembolsos: { create: reembolsos.map((r, orden) => ({ orden, metodoPagoId: r.metodoPagoId, monto: r.monto, referencia: r.referencia })) },
        },
      });
      await tx.notaFiscalLinea.createMany({ data: lineas.map((l, orden) => ({ notaId: id, orden, reciboItemId: l.reciboItemId ?? null, cobroItemId: l.cobroItemId ?? null, ventaItemId: l.ventaItemId ?? null, productoId: l.productoId ?? null, cantidad: l.cantidad, concepto: l.concepto, monto: l.monto, efecto: l.efecto })) });
      const hora = nowHM();
      for (const l of lineas) {
        if (l.efecto === 'ReabreCargo' && l.cobroItemId) {
          const c = await tx.finCobroItem.findUnique({ where: { id: l.cobroItemId } });
          if (!c) continue;
          const otras = await tx.finReciboItem.count({ where: { cobroItemId: c.id, id: { not: l.reciboItemId } } });
          // el cargo vuelve a la deuda por lo que ESA linea cobro (valor del cargo en el recibo); si ya estaba abierto por un abono, se suma
          if (c.paid) await tx.finCobroItem.update({ where: { id: c.id }, data: { paid: false, monto: l.bruto, abono: otras > 0 } });
          else await tx.finCobroItem.update({ where: { id: c.id }, data: { monto: round2(c.monto + l.bruto), abono: true } });
          reabiertos++;
        }
        if (l.efecto === 'Devolucion' && l.productoId) {
          const p = await tx.finProducto.findUnique({ where: { id: l.productoId } });
          if (p && p.stock != null) {
            await tx.finProducto.update({ where: { id: p.id }, data: { stock: p.stock + l.cantidad } });
            await tx.finMovimiento.create({ data: { t: hora, tipo: 'Devolución', productoId: p.id, name: p.name, q: '+' + l.cantidad, ref: id, ventaId: b.ventaId ?? null, cantidad: l.cantidad, stockResultante: p.stock + l.cantidad } });
          }
        }
      }
      if (b.reciboId) {
        const fin = await estadoDocumento(tx, { reciboId: b.reciboId });
        if (fin.disponible <= TOL) { anulado = true; await tx.finRecibo.update({ where: { id: b.reciboId }, data: { est: 'Anulado', ...(fin.recibo!.nc ? {} : { nc: fiscal.ncf }) } }); }
      }
      return tx.notaFiscal.findUniqueOrThrow({ where: { id }, include: NOTA_INC });
    });
    await audit(req.user, 'Insert', { tabla: 'Notas', id, next: `${row.ncf} · crédito RD$ ${monto} sobre ${b.reciboId ?? b.ventaId} (${est.ncf}) · ${motivo.nombre}${anulado ? ' · recibo ANULADO' : ''}${reabiertos ? ` · ${reabiertos} cargo(s) reabiertos` : ''}`, ip: req.ip });
    if (reabiertos) await audit(req.user, 'Update', { tabla: 'Cobros', id: b.reciboId!, prev: 'cargos pagados', next: `${reabiertos} cargo(s) reabiertos por ${id}`, ip: req.ip });
    return { nota: notaDto(row, tz), repetida: false };
  } catch (e) {
    if (esUnica(e)) { const ya = await porClave(clave); if (ya) return { nota: notaDto(ya, tz), repetida: true }; }
    throw e;
  }
}

// ---------------------------------------------------------------- nota de debito
const ND_VENCE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const fechaDMYValida = (s: string) => { const m = ND_VENCE_RE.exec(s); if (!m) return null; const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export async function emitirDebito(req: Peticion, b: NotaDebitoReq): Promise<{ nota: NotaFiscalDto; repetida: boolean }> {
  const tz = await zonaHoraria();
  const clave = String(b.idempotencyKey ?? '').trim();
  if (clave.length < 8 || clave.length > 200) throw bad('Falta la clave de idempotencia de la nota (idempotencyKey)');
  const previa = await porClave(clave);
  if (previa) return { nota: notaDto(previa, tz), repetida: true };
  if (!b.reciboId) throw bad('Indica el recibo que se modifica con la nota de débito');
  const motivo = await motivoDe(b.motivo, 'DEBITO');
  if (!Array.isArray(b.conceptos) || !b.conceptos.length) throw bad('Indica al menos un concepto a cobrar');
  if (b.conceptos.length > 10) throw bad('Una nota de débito admite hasta 10 conceptos');
  await refrescarEstados();
  const est = await estadoDocumento(prisma, { reciboId: b.reciboId });
  const r = est.recibo!;
  const { cicloAnterior } = await plazoDe(est.creado);
  const activo = await cicloActivoRow();
  if (!activo) throw conflict('No hay un ciclo lectivo activo');
  const bq = bloqueo(est, activo.id, cicloAnterior);
  if (bq) throw conflict(bq);
  if (est.anulado) throw conflict('El recibo está anulado: un comprobante anulado no se modifica con una nota de débito');
  const hoy = hoyISO(tz);
  const conceptos = b.conceptos.map(c => {
    const texto = String(c.concepto ?? '').trim().slice(0, 150), monto = round2(Number(c.monto));
    if (texto.length < 3) throw bad('Cada concepto debe tener una descripción (mínimo 3 caracteres)');
    if (!Number.isFinite(monto) || monto <= 0) throw bad('Una nota de débito solo AUMENTA la deuda: el monto de cada concepto debe ser mayor que cero');
    if (monto > MAX_MONTO) throw bad('El monto de un concepto es demasiado grande');
    const vence = String(c.vence ?? '').trim() || `${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)}`, iso = fechaDMYValida(vence);
    if (!iso) throw bad(`El vencimiento «${vence}» no es una fecha válida (usa dd/mm/aaaa)`);
    if (iso < hoy) throw bad('El vencimiento de un cargo nuevo no puede ser anterior a hoy');
    return { concepto: texto, monto, vence };
  });
  const monto = round2(conceptos.reduce((a, c) => a + c.monto, 0));
  if (monto > MAX_MONTO) throw bad('El monto de la nota es demasiado grande');
  // alumno al que se le cobra
  const duenos = new Map<string, string>();
  for (const l of est.lineas) if (l.alumnoId) duenos.set(l.alumnoId, l.alumno!);
  const delTutor = r.tutorId ? await prisma.alumno.findMany({ where: { tutorId: r.tutorId }, include: SEC_INC, orderBy: { id: 'asc' } }) : [];
  let alumnoId = String(b.alumnoId ?? '').trim();
  if (!alumnoId) { if (duenos.size === 1) alumnoId = [...duenos.keys()][0]; else if (!duenos.size && delTutor.length === 1) alumnoId = delTutor[0].id; else throw bad('Indica a qué alumno se le cobra el cargo de la nota de débito'); }
  const alumno = await prisma.alumno.findUnique({ where: { id: alumnoId }, include: SEC_INC });
  if (!alumno) throw bad('El alumno indicado no existe');
  if (!duenos.has(alumno.id) && alumno.tutorId !== r.tutorId) throw bad('El alumno no pertenece a la cuenta de este recibo');
  const al = `${alumno.nombres.split(' ')[0]} · ${gst(alumno).grado} ${gst(alumno).sec}`;
  const disp = (await disponibilidad(prisma, ['NOTA_DEBITO'], est.modalidad))[0];
  if (!disp.disponible) throw sinSecuencia(disp.motivo!);
  const ctx = await contextoFiscal('NOTA_DEBITO', est.modalidad);
  const sup = await supervisorSiempre(req as FastifyRequest, b.pin, 'nota.debito');
  if (!sup.ok) throw new NotaError(sup.status, sup.error, undefined, sup.retryAfter ? { retryAfter: sup.retryAfter } : undefined);
  const id = 'ND-' + String(await nextSeq('notad')).padStart(4, '0');
  const cajaId = await cajaDe(req.user);
  const ordenBase = Math.max(0, ...(await prisma.finCobroItem.findMany({ where: { alumnoId: alumno.id, cicloId: activo.id }, select: { orden: true }, orderBy: { orden: 'desc' }, take: 1 })).map(x => x.orden)) + 1;
  let fiscal!: Awaited<ReturnType<typeof asignarNcf>>;
  try {
    const row = await transaccionFiscal(async tx => {
      fiscal = await asignarNcf(tx, 'NOTA_DEBITO', ctx);
      await tx.notaFiscal.create({
        data: {
          id, clase: 'DEBITO', tipoComprobanteId: fiscal.codigo, secuenciaFiscalId: fiscal.secuenciaFiscalId, ncf: fiscal.ncf, modalidad: fiscal.modalidad, estadoDgii: fiscal.estadoDgii,
          reciboId: r.id, ncfModificado: r.ncf, tutorId: r.tutorId, clienteNombre: r.clienteNombre ?? r.tutor, clienteRnc: r.clienteRnc, cicloId: activo.id, motivoId: motivo.id,
          motivoTexto: String(b.motivoTexto ?? '').trim().slice(0, 500), monto, fueraDePlazo: false, cajeroId: req.user.sub, cajaId, hora: nowHM(), idempotencyKey: clave,
        },
      });
      for (const [i, c] of conceptos.entries()) {
        const cid = `${id}-${i + 1}`;
        await tx.finCobroItem.create({ data: { id: cid, alumnoId: alumno.id, tutorId: r.tutorId ?? alumno.tutorId, cicloId: activo.id, con: c.concepto, al, vence: c.vence, monto: c.monto, est: fechaDMYValida(c.vence)! < hoy ? 'Vencida' : 'Pendiente', tipo: 'nd', orden: ordenBase + i, notaDebitoId: id } });
        await tx.notaFiscalLinea.create({ data: { notaId: id, orden: i, cobroItemId: cid, cantidad: 0, concepto: c.concepto, monto: c.monto, efecto: 'NuevoCargo' } });
      }
      return tx.notaFiscal.findUniqueOrThrow({ where: { id }, include: NOTA_INC });
    });
    await audit(req.user, 'Insert', { tabla: 'Notas', id, next: `${row.ncf} · débito RD$ ${monto} sobre ${r.id} (${r.ncf}) · ${motivo.nombre} · ${conceptos.length} cargo(s) para ${al}`, ip: req.ip });
    return { nota: notaDto(row, tz), repetida: false };
  } catch (e) {
    if (esUnica(e)) { const ya = await porClave(clave); if (ya) return { nota: notaDto(ya, tz), repetida: true }; }
    throw e;
  }
}

// ---------------------------------------------------------------- anulacion de recibo (servicio unico)
/**
 * ANULAR un recibo = nota de credito TOTAL (motivo 01) con los cargos reabiertos y el dinero devuelto por los mismos medios del cobro. Misma forma de respuesta y PIN que antes.
 * Si el recibo ya tiene notas de credito parciales, la anulacion acredita lo que queda (motivo «Corrección de montos»).
 */
export async function anularRecibo(req: Peticion, reciboId: string, pin: unknown): Promise<{ nota: NotaFiscalDto; repetida: boolean }> {
  const r = await prisma.finRecibo.findUnique({ where: { id: reciboId }, include: { ciclo: { select: { estado: true } }, pagos: { orderBy: { orden: 'asc' } }, lineas: { select: { id: true } } } });
  if (!r) throw new NotaError(404, 'Recibo no encontrado');
  if (r.ciclo.estado === 'Cerrado') throw conflict('El recibo pertenece a un ciclo lectivo cerrado (solo lectura)');
  if (r.est === 'Anulado') throw conflict('Ya está anulado');
  if (!(await supervisorOk(req as FastifyRequest, pin, 'recibo.anular'))) throw new NotaError(403, 'Clave de supervisor inválida'); // misma regla de siempre para anular (el Super Admin no necesita clave)
  const est = await estadoDocumento(prisma, { reciboId });
  const suma = round2(r.pagos.reduce((a, p) => a + p.monto, 0));
  const reemb: ReembolsoIn[] = r.pagos.map(p => ({ metodoPagoId: p.metodoPagoId, monto: round2(suma > 0 ? (p.monto * est.disponible) / suma : 0), referencia: `Anulación de ${r.id}` })).filter(x => x.monto > 0);
  if (reemb.length) reemb[reemb.length - 1].monto = round2(est.disponible - reemb.slice(0, -1).reduce((a, x) => a + x.monto, 0));
  if (!reemb.length) throw conflict('El recibo no tiene pagos registrados: no se puede determinar el medio de la devolución');
  return emitirCredito(req, {
    reciboId, motivo: est.acreditado > TOL ? '03' : MOTIVO_ANULACION, motivoTexto: 'Anulación del recibo ' + r.id, total: true, reabrirCargos: true, reembolsos: [], pin: String(pin ?? ''), idempotencyKey: 'anular:' + reciboId,
  }, { reembolsos: reemb });
}

// ---------------------------------------------------------------- consulta
export const idNotaOk = (id: string) => /^N[CD]-\d{4,}$/.test(id);
export async function notaPorId(id: string): Promise<NotaFiscalDto | null> {
  const n = await prisma.notaFiscal.findUnique({ where: { id }, include: NOTA_INC });
  return n ? notaDto(n, await zonaHoraria()) : null;
}

export async function resumenNotasDe(ids: string[]): Promise<Map<string, NotaResumen[]>> {
  const out = new Map<string, NotaResumen[]>();
  if (!ids.length) return out;
  const tz = await zonaHoraria();
  const rows = await prisma.notaFiscal.findMany({ where: { reciboId: { in: ids } }, select: { id: true, clase: true, ncf: true, monto: true, createdAt: true, reciboId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  for (const n of rows) out.set(n.reciboId!, [...(out.get(n.reciboId!) ?? []), { id: n.id, clase: n.clase as NotaResumen['clase'], ncf: n.ncf, monto: n.monto, fecha: dmy(tz, n.createdAt) }]);
  return out;
}

export interface FiltroNotas { q?: string; tipo?: string; desde?: Date; hasta?: Date; cajeroId?: string; cicloId: string; page: number; size: number }
export async function listarNotas(f: FiltroNotas): Promise<NotaListaRes> {
  const tz = await zonaHoraria();
  const where: Prisma.NotaFiscalWhereInput = { cicloId: f.cicloId };
  if (f.tipo === 'credito') where.clase = 'CREDITO'; else if (f.tipo === 'debito') where.clase = 'DEBITO';
  if (f.desde || f.hasta) where.createdAt = { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lt: f.hasta } : {}) };
  if (f.cajeroId) where.cajeroId = f.cajeroId;
  const term = (f.q ?? '').trim().slice(0, 80), qd = /^[\d\s-]+$/.test(term) ? digits(term) : ''; // la cedula solo se busca si el texto es numerico (un REC-0621 no debe coincidir con cedulas)
  if (term) {
    const or: Prisma.NotaFiscalWhereInput[] = [{ id: { contains: term } }, { ncf: { contains: term } }, { ncfModificado: { contains: term } }, { reciboId: { contains: term } }, { ventaId: { contains: term } }, { clienteNombre: { contains: term } }];
    if (/^\d+$/.test(term)) or.push({ reciboId: { contains: 'REC-' + term.padStart(4, '0') } });
    if (qd.length >= 3) or.push({ tutor: { is: { cedula: { contains: qd } } } });
    where.OR = or;
  }
  const [total, agg, rows] = await Promise.all([
    prisma.notaFiscal.count({ where }),
    prisma.notaFiscal.groupBy({ by: ['clase'], where, _sum: { monto: true } }),
    prisma.notaFiscal.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.size, take: f.size, select: FILA_SELECT }),
  ]);
  const credito = round2(agg.find(x => x.clase === 'CREDITO')?._sum.monto ?? 0), debito = round2(agg.find(x => x.clase === 'DEBITO')?._sum.monto ?? 0);
  return { rows: rows.map(n => notaFila(n, tz)), total, page: f.page, size: f.size, suma: { credito, debito, neto: round2(debito - credito) } };
}

export async function buscarDocumentos(q: string, cicloId: string): Promise<NotaBuscarFila[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const tz = await zonaHoraria(), qd = /^[\d\s-]+$/.test(term) ? digits(term) : '';
  const orR: Prisma.FinReciboWhereInput[] = [{ id: { contains: term } }, { ncf: { contains: term } }, { tutor: { contains: term } }];
  if (/^\d+$/.test(term)) orR.push({ id: { contains: 'REC-' + term.padStart(4, '0') } });
  if (qd.length >= 3) orR.push({ titular: { is: { cedula: { contains: qd } } } });
  const orV: Prisma.FinVentaWhereInput[] = [{ id: { contains: term } }, { ncf: { contains: term } }];
  if (/^\d+$/.test(term)) orV.push({ id: { contains: 'VTA-' + term.padStart(4, '0') } });
  const [recs, ventas] = await Promise.all([
    prisma.finRecibo.findMany({ where: { cicloId, OR: orR }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true, ncf: true, tutor: true, monto: true, est: true, hora: true, createdAt: true, titular: { select: { cedula: true } } } }),
    /^(vta|e?b?\d)/i.test(term) || term.length >= 3 ? prisma.finVenta.findMany({ where: { OR: orV }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6, select: { id: true, ncf: true, total: true, createdAt: true } }) : Promise.resolve([]),
  ]);
  const ac = await prisma.notaFiscal.groupBy({ by: ['reciboId', 'ventaId'], where: { clase: 'CREDITO', OR: [{ reciboId: { in: recs.map(r => r.id) } }, { ventaId: { in: ventas.map(v => v.id) } }] }, _sum: { monto: true } });
  const mapa = new Map(ac.map(x => [x.reciboId ?? x.ventaId!, round2(x._sum.monto ?? 0)]));
  return [
    ...recs.map((r): NotaBuscarFila => ({ tipo: 'recibo', id: r.id, ncf: r.ncf, tutor: r.tutor, ...(r.titular ? { cedula: fmtCed(r.titular.cedula) } : {}), monto: r.monto, acreditado: mapa.get(r.id) ?? 0, est: r.est, fecha: dmy(tz, r.createdAt), hora: r.hora })),
    ...ventas.map((v): NotaBuscarFila => ({ tipo: 'venta', id: v.id, ncf: v.ncf, tutor: 'Venta rápida (kiosko)', monto: v.total, acreditado: mapa.get(v.id) ?? 0, est: 'Activo', fecha: dmy(tz, v.createdAt), hora: '' })),
  ];
}

// ---------------------------------------------------------------- reportes (Dashboard, cuadre)
export interface ReembolsoFila { monto: number; metodo: string; efectivo: boolean; createdAt: Date; cajeroId: string | null }
/** Reembolsos de notas de credito emitidas en [desde, hasta) por medio de pago. `cicloId` limita a las notas de ese ciclo. */
export async function reembolsosEnRango(desde: Date, hasta: Date, f?: { cajeroId?: string; cicloId?: string }): Promise<ReembolsoFila[]> {
  const rows = await prisma.notaFiscalReembolso.findMany({
    where: { nota: { clase: 'CREDITO', createdAt: { gte: desde, lt: hasta }, ...(f?.cajeroId ? { cajeroId: f.cajeroId } : {}), ...(f?.cicloId ? { cicloId: f.cicloId } : {}) } },
    select: { monto: true, metodoPago: { select: { nombre: true } }, nota: { select: { createdAt: true, cajeroId: true } } },
  });
  return rows.map(r => ({ monto: r.monto, metodo: r.metodoPago.nombre, efectivo: r.metodoPago.nombre === 'Efectivo', createdAt: r.nota.createdAt, cajeroId: r.nota.cajeroId }));
}

export { enSerie, idMotivo, clasifica };
