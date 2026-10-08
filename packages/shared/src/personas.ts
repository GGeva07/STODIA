/** Tipos de Directorio, Expediente 360 e Inscripción (grupo Personas). Solo tipos. */
import type { Alumno } from './index';

export type ExpDocEstado = 'Validado' | 'Pendiente' | 'En revisión';
export interface ExpDoc { id: string; n: string; f: string; est: ExpDocEstado }

export interface ExpFicha {
  carnet: string; ingreso: string; geo: string;
  medico: {
    sangre: string; seguro: string; poliza: string; condiciones: string;
    planAlim: string; planAlimExtra: string; emergenciaNombre: string; emergenciaTel: string; alertaDetalle: string;
  };
  conducta: { obs: { icon: 'ph-medal' | 'ph-clock-countdown'; tone: 'ok' | 'warn'; txt: string; fecha: string }[]; record: string };
  hist: { c: string; g: string; prom: string; l: string; btn: string }[];
  tutorLegalId?: string;
  contrato: { ciclo: string; plan: '10' | '4' | '1'; beca: 'none' | 'hermano' | 'academica' | 'empleado'; ctr: string; firmado: string };
}

export interface ExpServicio {
  id: string; kind: 'rec' | 'once'; catKey: string; name: string; icon: string; spec: string; cost: number;
  corte: string; est: string; alert: string; fecha: string; st: '' | 'cobrado' | 'cargado' | 'prog'; mes: string; recibo: string;
}

export interface ExpCatalogoItem {
  k: string; l: string; cat: string; freq: string; mora: string; price: number; rec: boolean; icon: string; spec: string; food?: boolean;
}

export interface ExpPersona { nombre: string; parentesco: string; cedula: string; tel: string }

export interface ExpedienteResp {
  alumno: Alumno;
  tutor: ExpPersona | null;
  legal: ExpPersona | null;
  hermanos: { id: string; nombre: string; curso: string; beca: string }[];
  ficha: ExpFicha;
  docs: ExpDoc[];
  servicios: ExpServicio[];
  cuenta: { id: string; con: string; vence: string; est: string; monto: number; paid: boolean }[];
  becasActivas: string[];
  ref: {
    planes: Record<string, { gross: number; n: number; unit: string }>;
    becas: Record<string, { pct: number; tag: string }>;
    catalogo: ExpCatalogoItem[];
    ciclos: string[];
  };
}

export interface InsCupo { id: string; tanda: string; seccion: string; cap: number; used: number }
export interface InsConfigResp {
  cupos: InsCupo[]; docs: string[]; ciclo: string;
  servicios: { k: string; n: string; price: number }[];
  colegiatura: number; inscripcion: number;
}
export interface InsTutorLookup { found: boolean; id?: string; nombre?: string; info?: string }
export interface InsReq {
  nombre: string; apellido: string; fnac: string; docs: boolean[];
  legalCed: string; legalName: string; finSame: boolean; finCed: string; finName: string;
  tanda: string; grado: string; sec: string; plan: '10' | '4' | '1'; serv: boolean[]; firma: 'digital' | 'fisica';
}
export interface InsResp { code: string; ncf: string; factura: number; cuotas: number }
