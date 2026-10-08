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
  /** plan = id del Plan de Pago (FinPlan; vacío = sin plan); beca = clave del catálogo de becas ('none' = sin beca). */
  contrato: { ciclo: string; plan: string; beca: string; ctr: string; firmado: string };
}

export interface ExpServicio {
  id: string; kind: 'rec' | 'once'; catKey: string; name: string; icon: string; spec: string; cost: number;
  corte: string; est: string; alert: string; fecha: string; st: '' | 'cobrado' | 'cargado' | 'prog'; mes: string; recibo: string;
}

export interface ExpCatalogoItem {
  k: string; l: string; cat: string; freq: string; mora: string; price: number; rec: boolean; icon: string; spec: string; food?: boolean;
}

export interface ExpPersona { nombre: string; parentesco: string; cedula: string; tel: string }

/** Plan de pago visto desde el expediente/inscripción (cuota ya calculada para la tanda del alumno). */
export interface PersPlan {
  name: string; gross: number; n: number; unit: string; freq: number; desc: number; total: number;
  dia: number; gracia: number; mora: string; detalle: string;
}

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
    planes: Record<string, PersPlan>;
    becas: Record<string, { nombre: string; pct: number; tag: string; aprobacion: boolean }>;
    catalogo: ExpCatalogoItem[];
    ciclos: string[];
    /** Meses del ciclo activo en orden (8,9,…,5) y año en que empieza. */
    meses: number[]; anio0: number;
    /** Hoy (aaaa-mm-dd, zona de la institución) y mes actual. */
    hoy: string; mesActual: number;
    /** Fin del ciclo (aaaa-mm-dd) para limitar las bajas. */
    finCiclo: string;
    avisos: string[];
  };
}

export interface InsCupo { id: string; grado: string; tanda: string; seccion: string; cap: number; used: number }
export interface InsPlan {
  id: string; name: string; n: number; freq: number; desc: number; dia: number; gracia: number; mora: string; detalle: string;
  /** Monto anual bruto por tanda ('*' = todas). */
  anual: Record<string, number>;
}
export interface InsConfigResp {
  cupos: InsCupo[]; docs: string[]; ciclo: string;
  planes: InsPlan[];
  grados: { id: string; label: string }[];
  tandas: string[];
  servicios: { k: string; n: string; price: number }[];
  inscripcion: number;
  avisos: string[];
}
export interface InsTutorLookup { found: boolean; id?: string; nombre?: string; info?: string }
export interface InsReq {
  nombre: string; apellido: string; fnac: string; docs: boolean[];
  legalCed: string; legalName: string; finSame: boolean; finCed: string; finName: string;
  /** Sección elegida (id de InsCupo); grado/tanda/sec se derivan en el servidor. */
  cupo: string; tanda: string; grado: string; sec: string; plan: string; serv: string[]; firma: 'digital' | 'fisica';
}
export interface InsResp { code: string; ncf: string; factura: number; cuotas: number }
export interface DirCorte { fecha: string; texto: string }
