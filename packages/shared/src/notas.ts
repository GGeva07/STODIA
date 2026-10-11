/** Tipos de las NOTAS DE CREDITO / DEBITO (Cobros). Solo tipos. Ver docs/fiscal-ncf.md §10. */
import type { EstadoDgii, ModalidadFiscal } from './sistema';

export type NotaClase = 'CREDITO' | 'DEBITO';
export type NotaEfecto = 'ReabreCargo' | 'Devolucion' | 'Ajuste' | 'NuevoCargo';
export interface MotivoNotaDto { id: string; codigo: string; nombre: string; origen: 'DGII' | 'Operativo'; aplica: 'CREDITO' | 'DEBITO' | 'AMBAS'; codigoDgii: string }
export interface NotaComprobante { codigo: string; nombre: string; modalidad: ModalidadFiscal }
/** Resumen de una nota dentro de un recibo (badge «Con nota de crédito RD$ X»). */
export interface NotaResumen { id: string; clase: NotaClase; ncf: string; monto: number; fecha: string }
/** Fila del listado de notas (GET /cobros/notas): respuesta minima. */
export interface NotaFila {
  id: string; clase: NotaClase; ncf: string; tipoComprobante: NotaComprobante; estadoDgii: EstadoDgii;
  documento: { tipo: 'recibo' | 'venta'; id: string; ncf: string };
  tutor: string; monto: number; motivo: { codigo: string; nombre: string }; motivoTexto?: string; cajero: string; fecha: string; hora: string;
}
export interface NotaListaRes { rows: NotaFila[]; total: number; page: number; size: number; suma: { credito: number; debito: number; neto: number } }
export interface NotaLineaDto { concepto: string; monto: number; efecto: NotaEfecto; cantidad?: number; alumno?: string; cobroItemId?: string; productoId?: string }
export interface NotaReembolsoDto { metodo: string; monto: number; referencia: string }
export interface NotaCargoDto { id: string; con: string; al: string; vence: string; monto: number; pagado: boolean }
export interface NotaDocumento { tipo: 'recibo' | 'venta'; id: string; ncf: string; tipoComprobante?: NotaComprobante; fecha?: string; hora?: string; monto: number; est?: string }
/** DTO COMPLETO de una nota (UNICO: lo devuelven la emision y la consulta; lo muestran el modal, la tirilla y la carta). */
export interface NotaFiscalDto {
  id: string; clase: NotaClase; ncf: string; tipoComprobante: NotaComprobante; estadoDgii: EstadoDgii; estado: 'Emitida';
  fecha: string; hora: string; cajero: string; caja: string; sucursal: string; ciclo: string; cicloId: string;
  monto: number; motivo: { codigo: string; nombre: string; codigoDgii: string }; motivoTexto: string; fueraDePlazo: boolean;
  /** Documento afectado (comprobante modificado). */
  documento: NotaDocumento;
  cliente: { nombre: string; rnc?: string; cedula?: string; email?: string };
  alumnos: string[];
  lineas: NotaLineaDto[]; reembolsos: NotaReembolsoDto[];
  /** Solo notas de debito: cargos que creo (aparecen en Cobros como pendientes). */
  cargos?: NotaCargoDto[];
  /** Solo notas de credito: el documento quedo completamente acreditado (recibo «Anulado»). */
  documentoAnulado?: boolean;
  /** Resumen de efectos: cargos reabiertos y su monto, unidades repuestas al inventario. */
  reabiertos?: number; montoReabierto?: number; unidadesRepuestas?: number;
}
/** Linea acreditable de un comprobante (GET /cobros/recibos/:id/notas-disponible y /cobros/ventas/:id/notas-disponible). */
export interface NotaLineaDisponible {
  /** FinReciboItem.id (recibo) o FinVentaItem.id (venta). */
  id: number; concepto: string; alumno?: string; monto: number; acreditado: number; restante: number;
  cobroItemId?: string; reabrible: boolean; tipoCargo?: string;
  /** Solo venta: producto, cantidad vendida / ya devuelta / restante y precio unitario con ITBIS. */
  productoId?: string; cantidad?: number; cantidadDevuelta?: number; cantidadRestante?: number; precioUnit?: number; inventario?: boolean;
}
export interface NotaComprobanteDisp { codigo: string; modalidad: ModalidadFiscal; disponible: boolean; restantes: number; motivo?: string }
export interface NotaDisponible {
  documento: NotaDocumento & { modalidad: ModalidadFiscal; tutor: string; cedula?: string; cicloId: string; alumnos: string[] };
  /** Suma de notas de credito emitidas, lo que aun se puede acreditar y el neto (monto − acreditado). */
  acreditado: number; disponible: number; neto: number;
  /** ¿Se puede emitir cada clase? `motivo*` explica por que no. */
  puedeCredito: boolean; puedeDebito: boolean; motivoNoCredito?: string; motivoNoDebito?: string;
  plazoDias: number; diasTranscurridos: number; fueraDePlazo: boolean;
  lineas: NotaLineaDisponible[];
  notas: NotaFila[];
  /** Comprobante que se usaria (B04/E34 y B03/E33 segun la modalidad del NCF modificado) y si hay secuencia disponible. */
  comprobanteCredito: NotaComprobanteDisp;
  comprobanteDebito: NotaComprobanteDisp;
  /** Alumnos del recibo / del tutor (para elegir a quien se le cobra el cargo de una nota de debito). */
  alumnosDebito: { id: string; nombre: string }[];
  /** Medios con que se cobro (para sugerir el reembolso por los mismos medios). */
  mediosCobro: { metodo: string; monto: number }[];
  /** Venta del kiosko con crédito fiscal: la API no guarda el RNC del comprador, la nota debe recibirlo. */
  requiereCliente?: boolean;
}
export interface NotaCreditoLineaReq { id: number; monto?: number; cantidad?: number; reabrir?: boolean }
export interface NotaCreditoReq {
  reciboId?: string; ventaId?: string; motivo: string; motivoTexto?: string;
  /** true = acreditar TODO lo disponible (anulacion total). Si es true se ignora `lineas`. */
  total?: boolean;
  /** Con `total`: ¿los cargos vuelven a la deuda? (por defecto true). En `lineas` se decide por linea (`reabrir`). */
  reabrirCargos?: boolean;
  lineas?: NotaCreditoLineaReq[];
  reembolsos: { metodo: string; monto: number; referencia?: string }[];
  /** Token de supervisor de un solo uso (POST /auth/supervisor) o la clave. */
  pin: string;
  /** Clave de idempotencia: reenviar la misma = misma nota (doble clic). */
  idempotencyKey: string;
  clienteNombre?: string; clienteRnc?: string;
}
export interface NotaDebitoReq {
  reciboId: string; motivo: string; motivoTexto?: string; alumnoId?: string;
  conceptos: { concepto: string; monto: number; vence?: string }[];
  pin: string; idempotencyKey: string;
}
export interface NotaBuscarFila { tipo: 'recibo' | 'venta'; id: string; ncf: string; tutor: string; cedula?: string; monto: number; acreditado: number; est: string; fecha: string; hora: string }
