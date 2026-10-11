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
  /** Fase 2D: solo al consultar un ciclo NO activo. Notas por materia y periodo (media de las competencias) y asistencia resumida de ese ciclo. */
  cicloDetalle?: {
    ciclo: string; cerrado: boolean;
    notas: { materia: string; p: (number | null)[]; prom: number | null }[]; promedio: number | null;
    asistencia: { dias: number; presentes: number; tardanzas: number; ausJust: number; ausInjust: number } | null;
  };
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
/** Datos de contacto del tutor que pide el wizard (mismos campos y validaciones que la pantalla Tutores). La responsabilidad la deriva el servidor del rol. */
export interface InsTutorDatos { parentesco: string; tel: string; email: string; rnc: string }
export interface InsTutorLookup { found: boolean; id?: string; nombre?: string; info?: string; /** Datos guardados del tutor existente, para precargarlos. */ datos?: InsTutorDatos }
/** Resultado del buscador de tutores existentes del paso «Tutores» (GET /inscripcion/tutores). Solo lo mínimo para elegir a la familia. */
export interface InsTutorHijo { nombre: string; /** «5to A» (grado y sección vigentes). */ seccion: string }
export interface InsTutorBusq {
  id: string; nombre: string; /** Con guiones (000-0000000-0). */ cedula: string; tel: string; email: string; parentesco: string; rnc: string; tipo: string;
  /** Hijos vinculados (financiero o legal) no retirados. */
  hijos: InsTutorHijo[];
  /** RD$ vencidos de los hijos de los que es tutor financiero (ciclo activo, misma regla de CxC que el resto del sistema). */
  vencido: number;
  /** false = tutor inactivo: se muestra pero no se puede elegir. */
  disponible: boolean;
}
export interface InsTutoresResp {
  rows: InsTutorBusq[]; page: number; size: number; total: number; hayMas: boolean;
  /** Tipo de beca de hermanos del catálogo (si existe y está activo): permite ofrecer «Aplicar beca Plan Hermano». */
  becaHermano: { id: string; nombre: string; pct: number } | null;
}
export interface InsReq {
  nombre: string; apellido: string; fnac: string; docs: boolean[];
  legalCed: string; legalName: string; finSame: boolean; finCed: string; finName: string;
  /** Contacto del tutor legal y del financiero (si son la misma persona, solo se usa `legalDatos`). Si el tutor ya existe se actualiza con estos datos. */
  legalDatos: InsTutorDatos; finDatos: InsTutorDatos;
  /** Tutor ya registrado elegido en el buscador (id de Tutor): prevalece sobre la cédula/nombre. Sin estos campos se sigue el modo por cédula de siempre. */
  tutorLegalId?: string; tutorFinancieroId?: string;
  /** Registra una beca «Plan Hermano» PENDIENTE de aprobación (flujo normal de Becas) para el alumno nuevo; solo si la familia ya tiene hijos. */
  becaHermano?: boolean;
  /** Sección elegida (id de InsCupo); grado/tanda/sec se derivan en el servidor. */
  cupo: string; tanda: string; grado: string; sec: string; plan: string; serv: string[]; firma: 'digital' | 'fisica';
  /** Alergias del alumno (ids del catálogo Alergia; opcional). */
  alergias?: string[];
}
export interface InsResp { code: string; ncf: string; factura: number; cuotas: number; /** Beca Plan Hermano creada (Pendiente de aprobación). */ becaId?: string }
export interface DirCorte { fecha: string; texto: string }

// ---------- Tutores (pantalla «Tutores») ----------
export interface TutorHijoRef { id: string; nombre: string }
export interface TutorRow {
  id: string; nombre: string; cedula: string; parentesco: string; tipo: string; tel: string; email: string; rnc: string;
  /** Usuario del Portal Tutor (vacío = sin acceso). */
  usuario: string; estado: string; alumnos: TutorHijoRef[];
}
export interface TutoresResp { rows: TutorRow[]; page: number; size: number; filtrados: number; total: number }
export interface TutorHijo {
  id: string; code: string; nombre: string; grado: string; sec: string; tanda: string; estado: string;
  vinculo: 'Financiero' | 'Legal' | 'Financiero y legal'; vencido: number; porVencer: number;
}
export interface TutorFicha extends TutorRow {
  hijos: TutorHijo[];
  saldo: { vencido: number; porVencer: number; total: number };
  acceso: { usuario: string; estado: 'Sin acceso' | 'Activo' | 'Inactivo'; cambioPendiente: boolean };
  correoListo: boolean;
}
export interface TutorAccesoResp { usuario: string; password: string; enviado: boolean; aviso: string; creado: boolean }
export interface TutorAlumnoOpt { id: string; code: string; nombre: string; grado: string; sec: string; tutor: string }
