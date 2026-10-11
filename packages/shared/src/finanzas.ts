/** Tipos del grupo Finanzas (Cobros, Kiosko, Inventario, Planes de Pago, Becas). Solo tipos. */
import type { EstadoDgii, ModalidadFiscal, TipoLogico } from './sistema';
import type { NotaFila, NotaResumen } from './notas';

export type CobroEstado = 'Vencida' | 'Por vencer' | 'Pendiente';
export interface CobroItem {
  id: string; con: string; al: string; kid: string; vence: string; monto: number;
  est: CobroEstado; tipo: string; abono?: boolean;
  /** Fase 2D: ciclo lectivo del cargo; solo en `deudaAnterior` (cargos pendientes de ciclos cerrados). */
  ciclo?: string;
  /** Nota de debito que creo este cargo (id ND-0001): la UI lo distingue con la etiqueta ND. */
  nd?: string;
}
export interface CobroPagoReq { m: string; a: string; r: string }
export interface CobroPago { m: string; r: string; amt: number }
export interface ReciboFin {
  id: string; ncf: string; tutor: string; hora: string; monto: number; est: 'Activo' | 'Anulado';
  metodo: string; abono: boolean; saldo: number; nc?: string; change: number;
  items: { con: string; monto: number; cobroItemId?: string }[]; pays: CobroPago[];
  /** Datos del comprobante (los fija SIEMPRE la API, lib/recibos.reciboDto): fecha dd/mm/aaaa, cajero («Sistema» si es historico), caja y sucursal, titular, alumnos y tipo de comprobante. */
  fecha?: string; cajero?: string; caja?: string; sucursal?: string; cedula?: string; email?: string; alumnos?: string[]; cicloId?: string;
  /** Comprobante fiscal del recibo: tipo (codigo B01/E31...), nombre, modalidad. */
  tipoComprobante?: { codigo: string; nombre: string; modalidad: ModalidadFiscal };
  /** Datos fiscales del comprador (crédito fiscal / gubernamental / régimen especial / consumo identificado). */
  clienteRnc?: string; clienteNombre?: string; regimenEspecial?: string;
  /** Envío del e-NCF a la DGII (el sistema NO transmite: un e-NCF queda PendienteEnvio). */
  estadoDgii?: EstadoDgii;
  /** Notas de credito/debito que modifican este recibo; `acreditado` = suma de notas de credito y `neto` = monto − acreditado. */
  notas?: NotaResumen[]; acreditado?: number; neto?: number;
  /** Notas de debito cuyos cargos cobro este recibo (el recibo las referencia). */
  notasDebitoCobradas?: { id: string; ncf: string }[];
}
/** Fila del historial de recibos (GET /cobros/recibos). */
export interface ReciboListaFila { id: string; ncf: string; tipoComprobante?: { codigo: string; nombre: string; modalidad: ModalidadFiscal }; estadoDgii?: EstadoDgii; monto: number; est: 'Activo' | 'Anulado'; abono: boolean; nc?: string; tutor: string; cedula?: string; cajero: string; fecha: string; hora: string; acreditado?: number; notas?: number }
export interface ReciboListaRes { rows: ReciboListaFila[]; total: number; suma: number; page: number; size: number }
/** Resultado de POST /cobros/recibos/:id/enviar. */
export interface ReciboEnvioRes { ok: boolean; estado: 'Enviado' | 'Sin correo' | 'Canal no configurado'; destino?: string }
export interface CobroHijo { id: string; kid: string; nombre: string; corto: string; grado: string; sec: string; code: string }
export interface CobroCuenta {
  tutor: string; cedula: string; email?: string; hijos: CobroHijo[]; becas: string[]; items: CobroItem[];
  /** SOLO los recibos de este tutor/cuenta (max 20 recientes). NO es el historial del turno: ese es GET /cobros/turno. */
  recibos: ReciboFin[];
  /** Fase 2D: ciclo de la cuenta mostrada (el elegido en el selector; por defecto el activo). */
  ciclo?: string;
  /** Fase 2D: solo en el ciclo ACTIVO. Cargos pendientes de ciclos CERRADOS del mismo tutor/alumnos, cobrables aqui (el recibo se emite en el ciclo activo; el cargo conserva su ciclo). */
  deudaAnterior?: CobroItem[];
  /** Comprobante habitual de la cuenta (tipo lógico) y datos fiscales del tutor para precargar la tarjeta «Datos fiscales del comprobante». */
  comprobanteHabitual?: TipoLogico | null;
  datosFiscales?: { rnc: string; nombre: string };
  /** Identificación fiscal registrada de la cuenta (RNC propio o cédula, con guiones) para ofrecer «Hacerlo a nombre de la cédula registrada» sin inputs. */
  fiscal?: { tieneIdentificacion: boolean; identificacion: string; nombre: string; esRnc: boolean; razonSocialPropia: boolean };
}
/** GET /cobros/rnc/:rnc — razón social resuelta (fuente 'dgii' solo si la verificación está activada en el servidor). */
export interface RncConsulta { rnc: string; valido: boolean; encontrado: boolean; razonSocial?: string; fuente?: 'tutor' | 'historial' | 'dgii'; estado?: string }
/** Disponibilidad de comprobantes para cobrar (GET /cobros/comprobantes): por tipo lógico, el prefijo que se usará y si hay secuencia disponible. */
export interface CobroComprobante { logico: TipoLogico; codigo: string; nombre: string; modalidad: ModalidadFiscal; disponible: boolean; restantes: number; motivo?: string; requiereRnc: boolean }
export interface CobroComprobantes { tipos: CobroComprobante[]; umbralConsumoIdentificado: number; ecf: boolean }
/**
 * Turno del cajero (GET /cobros/turno): recibos EMITIDOS POR EL USUARIO AUTENTICADO (FinRecibo.cajeroId) el dia de hoy (zona horaria del perfil)
 * dentro de la franja del turno actual (Matutino 00:00-11:59, Vespertino 12:00-17:59, Nocturno 18:00-23:59). Incluye anulados (marcados).
 */
export interface CobroTurno {
  turno: 'Matutino' | 'Vespertino' | 'Nocturno'; caja: string; sucursal: string; desde: string; hasta: string;
  /** ASC por hora de emision. */
  recibos: ReciboFin[];
  /** porMetodo = cobrado NETO por medio de pago (cobros de los recibos del turno − reembolsos de notas de credito emitidas en el turno); `netoActivo` = Cobrado neto. */
  resumen: { emitidos: number; anulados: number; netoActivo: number; porMetodo: Record<string, number>; bruto?: number; devoluciones?: number; devolucionesPorMetodo?: Record<string, number> };
  /** Notas de credito/debito emitidas por este cajero en la franja del turno (seccion Devoluciones / Notas del cuadre). */
  notas?: NotaFila[];
}
export interface CobroProcesarReq { ids: string[]; discount: 'none' | 'pronto' | 'exo'; pays: CobroPagoReq[]; pin?: string; cedula?: string; intencionId?: string;
  /** Tipo LÓGICO del comprobante (el servidor decide B01/E31 según la modalidad configurada). Por defecto CONSUMO. */
  tipoComprobante?: TipoLogico; clienteRnc?: string; clienteNombre?: string; regimenEspecial?: string;
  /** Guardar este tipo como comprobante habitual de la cuenta. */
  habitual?: boolean }
/** Medio de pago configurado (Catálogo metodosPago): ref = etiqueta de la referencia que exige, o null si no exige. */
export interface CobroMetodo { nombre: string; ref: string | null }

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
  /** Alumno beneficiario (Alumno.id); si falta se resuelve por la etiqueta `est` (debe ser unica). */
  alumnoId?: string;
  est: string; tipo: string; modo: 'pct' | 'fijo'; valor: string; conceptos: string[]; exp: string; periodo: string;
}

export interface ProductoFin { id: string; code: string; name: string; cat: string; price: number; tax: boolean; stock: number | null; icon: string }
export interface Movimiento { id: number; t: string; tipo: 'Entrada' | 'Salida' | 'Devolución'; name: string; q: string; ref: string }
export interface VentaReq { items: { id: string; q: number }[]; doc: 'cf' | 'cf2'; rnc: string; razon: string; pay: string; recv: string }
export interface VentaRes {
  id: string; ncf: string; total: number; change: number; recv: number; hora: string; cliente: string;
  pay: string; items: { con: string; monto: number }[];
}
