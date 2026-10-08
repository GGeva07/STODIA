/** Tipos del grupo Finanzas (Cobros, Kiosko, Inventario, Planes de Pago, Becas). Solo tipos. */

export type CobroEstado = 'Vencida' | 'Por vencer' | 'Pendiente';
export interface CobroItem {
  id: string; con: string; al: string; kid: string; vence: string; monto: number;
  est: CobroEstado; tipo: string; abono?: boolean;
}
export interface CobroPagoReq { m: string; a: string; r: string }
export interface CobroPago { m: string; r: string; amt: number }
export interface ReciboFin {
  id: string; ncf: string; tutor: string; hora: string; monto: number; est: 'Activo' | 'Anulado';
  metodo: string; abono: boolean; saldo: number; nc?: string; change: number;
  items: { con: string; monto: number }[]; pays: CobroPago[];
}
export interface CobroCuenta { tutor: string; cedula: string; items: CobroItem[]; recibos: ReciboFin[] }
export interface CobroProcesarReq { ids: string[]; discount: 'none' | 'pronto' | 'exo'; pays: CobroPagoReq[]; pin?: string }

export interface PlanForm {
  name: string; freq: string; n: string; anual: string; desc: string; start: string; dia: string;
  gracia: string; moraTipo: 'pct' | 'fijo' | 'none'; moraVal: string; pronto: string; prontoDia: string;
  estado: 'Activo' | 'Inactivo'; porTanda?: boolean; tm?: Record<string, string>;
}
export interface PlanPagoFin extends PlanForm { id: string; alumnos: number }

export interface BecaFin {
  id: string; periodo: string; est: string; grado: string; tipo: string; regla: string;
  conceptos: string; exp: string; estado: 'Aprobada' | 'Pendiente' | 'Revocada'; aprob: string;
}
export interface BecaNueva {
  est: string; tipo: string; modo: 'pct' | 'fijo'; valor: string; conceptos: string[]; exp: string; periodo: string;
}

export interface ProductoFin { id: string; code: string; name: string; cat: string; price: number; tax: boolean; stock: number | null; icon: string }
export interface Movimiento { id: number; t: string; tipo: 'Entrada' | 'Salida'; name: string; q: string; ref: string }
export interface VentaReq { items: { id: string; q: number }[]; doc: 'cf' | 'cf2'; rnc: string; razon: string; pay: string; recv: string }
export interface VentaRes {
  id: string; ncf: string; total: number; change: number; recv: number; hora: string; cliente: string;
  pay: string; items: { con: string; monto: number }[];
}
