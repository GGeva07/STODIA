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
  /** Solo artículos de inventario (`prd:`): unidades disponibles; null/ausente = ilimitado o servicio. */
  stock?: number | null;
}

export interface ExpPersona { nombre: string; parentesco: string; cedula: string; tel: string }

/** Plan de pago visto desde el expediente/inscripción (cuota ya calculada para la tanda del alumno). */
export interface PersPlan {
  name: string; gross: number; n: number; unit: string; freq: number; desc: number; total: number;
  dia: number; gracia: number; mora: string; detalle: string;
}

/** Nota fiscal que afecta un cargo de la cuenta. `reabierto` = la NC lo devolvió a la deuda («volver a cobrar»). `acreditado` = devolución definitiva (el cargo sigue pagado). */
export interface ExpCuentaNota { nota: string; ncf: string; clase: 'CREDITO' | 'DEBITO'; recibo: string | null; reabierto: boolean; acreditado: boolean; montoAcreditado: number }
export interface ExpCuentaItem { id: string; con: string; vence: string; est: string; monto: number; paid: boolean; nc?: ExpCuentaNota }
export interface ExpNotaMov { id: string; ncf: string; clase: 'CREDITO' | 'DEBITO'; recibo: string | null; fecha: string; monto: number; motivo: string; efecto: string; lineas: { concepto: string; monto: number; efecto: string }[] }

export interface ExpedienteResp {
  alumno: Alumno;
  tutor: ExpPersona | null;
  legal: ExpPersona | null;
  hermanos: { id: string; nombre: string; curso: string; beca: string }[];
  ficha: ExpFicha;
  docs: ExpDoc[];
  servicios: ExpServicio[];
  cuenta: ExpCuentaItem[];
  /** Movimientos de notas de crédito/débito que afectan esta cuenta (más recientes primero). */
  notas?: ExpNotaMov[];
  becasActivas: string[];
  /** Solicitudes de beca Pendientes de aprobación (Becas y Convenios): NO descuentan hasta que el Director las apruebe. */
  becasPendientes?: string[];
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
    /** Día de cobro por defecto de las suscripciones (día de corte de la institución). */
    diaCorte?: number;
    avisos: string[];
  };
}

export interface InsCupo { id: string; grado: string; tanda: string; seccion: string; cap: number; used: number }
export interface InsPlan {
  id: string; name: string; n: number; freq: number; desc: number; dia: number; gracia: number; mora: string; detalle: string;
  /** Monto anual bruto por tanda ('*' = todas). */
  anual: Record<string, number>;
  /** Cuota de inscripcion que aplica con este plan segun la modalidad configurada, y de donde sale ('fija' global, 'plan' propia, 'respaldo' = modo plan sin monto en el plan: se usa la global). */
  inscripcion: number; inscripcionOrigen: 'fija' | 'plan' | 'respaldo';
  /** Cuota de materiales del plan si esta activada (0 = no se agrega). Se carga como cargo aparte en el primer vencimiento. */
  materiales: number;
}
export interface InsConfigResp {
  cupos: InsCupo[]; docs: string[]; ciclo: string;
  /** Ciclos donde se puede inscribir (el activo y los planificados = inscripcion anticipada); `ciclo` es el destino al que corresponde esta configuracion. */
  ciclosDestino?: { n: string; estado: 'Activo' | 'Planificado' }[]; anticipada?: boolean;
  planes: InsPlan[];
  grados: { id: string; label: string }[];
  tandas: string[];
  servicios: { k: string; n: string; price: number }[];
  /** Cuota de inscripcion FIJA global (finanzas.inscripcion) y la modalidad vigente. */
  inscripcion: number; inscripcionModo: 'fija' | 'plan';
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
  /** Ciclo destino (nombre «2027–2028»): el activo por defecto o un ciclo PLANIFICADO (pre-inscripcion); nunca uno cerrado. */
  ciclo?: string;
  cupo: string; tanda: string; grado: string; sec: string; plan: string; serv: string[]; firma: 'digital' | 'fisica';
  /** Alergias del alumno (ids del catálogo Alergia; opcional). */
  alergias?: string[];
}
/** Persona (tutor) tal como queda registrada al inscribir; alimenta el documento «Contrato de servicios educativos e inscripción». */
export interface InsContratoTutor { nombre: string; cedula: string; parentesco: string; tel: string; email: string; rnc: string }
/** Datos que el servidor ya resolvió al inscribir (cartera real, tutores vinculados, regla del plan) para generar el contrato sin recalcular nada en el cliente. */
export interface InsContrato {
  alumnoId: string; ctr: string; ciclo: string; fecha: string;
  tutorLegal: InsContratoTutor; tutorFinanciero: InsContratoTutor;
  /** Calendario de vencimientos del plan (colegiatura) más la cuota de materiales si aplica. `enFactura` = la cuota única va en la factura inicial. */
  calendario: { con: string; vence: string; monto: number; enFactura?: boolean }[];
  servicios: { n: string; price: number }[];
  plan: { name: string; n: number; freq: number; desc: number; dia: number; gracia: number; mora: string; pronto: number; prontoDias: number; total: number };
}
export interface InsResp { code: string; ncf: string; factura: number; cuotas: number; /** Datos para generar el contrato (ver InsContrato). */ contrato?: InsContrato; /** Cuota de materiales cargada como cargo aparte (0/ausente = no aplica). */ materiales?: number; /** Cuota de inscripcion cobrada en la factura. */ inscripcion?: number; /** Beca Plan Hermano creada (Pendiente de aprobación). */ becaId?: string }
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
