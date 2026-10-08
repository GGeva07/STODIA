import faqJson from '../../pages/landing/faq.json';
import { SITE } from '../../lib/site';

export interface FaqItem { q: string; a: string; link?: { to: string; label: string } }
/** faq.json es la fuente única (también alimenta el JSON-LD y el <noscript> en build); {{email}} = SITE.email. */
export const FAQ: FaqItem[] = faqJson.map(f => ({ ...f, a: f.a.split('{{email}}').join(SITE.email) }));

/** Módulos reales (nombres tomados de NAV en lib/access.ts y de las apps móvil/escritorio). `c` = tonos [fondo, icono]. */
export interface Mod { id: string; name: string; desc: string; icon: string; c: [string, string] }
const P: Record<string, [string, string]> = {
  blue: ['#DBEAFE', '#1D4ED8'],
  green: ['#DCFCE7', '#15803D'],
  amber: ['#FEF3C7', '#B45309'],
  rose: ['#FFE4E6', '#BE123C'],
  violet: ['#EDE9FE', '#6D28D9'],
  teal: ['#CCFBF1', '#0F766E'],
  orange: ['#FFEDD5', '#C2410C'],
  sky: ['#E0F2FE', '#0369A1'],
};

export const MODULES: Mod[] = [
  { id: 'inscripcion', name: 'Inscripción', desc: 'Admisión y matrícula de estudiantes', icon: 'ph-user-plus', c: P.blue },
  { id: 'notas', name: 'Notas', desc: 'Matriz de calificaciones por curso', icon: 'ph-table', c: P.green },
  { id: 'asistencia', name: 'Asistencia', desc: 'Pase de lista en el salón', icon: 'ph-user-check', c: P.amber },
  { id: 'horarios', name: 'Horarios', desc: 'Calendario de clases y docentes', icon: 'ph-calendar-dots', c: P.violet },
  { id: 'expediente', name: 'Expediente 360', desc: 'Todo sobre cada estudiante', icon: 'ph-identification-card', c: P.rose },
  { id: 'finanzas', name: 'Finanzas', desc: 'Cobros y cuentas por cobrar', icon: 'ph-cash-register', c: P.teal },
  { id: 'planes', name: 'Planes de pago', desc: 'Cuotas y vencimientos', icon: 'ph-calendar-check', c: P.orange },
  { id: 'becas', name: 'Becas', desc: 'Becas y acuerdos de pago', icon: 'ph-hand-coins', c: P.sky },
  { id: 'kiosko', name: 'Kiosko / POS', desc: 'Venta rápida en caja', icon: 'ph-storefront', c: P.blue },
  { id: 'inventario', name: 'Inventario', desc: 'Existencias y productos', icon: 'ph-package', c: P.green },
  { id: 'comedor', name: 'Comedor', desc: 'Control de consumo diario', icon: 'ph-fork-knife', c: P.amber },
  { id: 'alimentacion', name: 'Planes de alimentación', desc: 'Menús y suscripciones', icon: 'ph-bowl-food', c: P.rose },
  { id: 'portal', name: 'Portal de tutores', desc: 'Saldo, pagos y notas en línea', icon: 'ph-users-three', c: P.violet },
  { id: 'comunica', name: 'Comunicación', desc: 'Avisos a familias y personal', icon: 'ph-megaphone', c: P.teal },
  { id: 'catalogos', name: 'Catálogos', desc: 'Datos maestros del colegio', icon: 'ph-database', c: P.orange },
  { id: 'auditoria', name: 'Auditoría', desc: 'Quién hizo qué y cuándo', icon: 'ph-shield-check', c: P.sky },
  { id: 'licencia', name: 'Licencia', desc: 'Plan, cuotas y vigencia', icon: 'ph-seal-check', c: P.blue },
  { id: 'roles', name: 'Roles y permisos', desc: 'Cada quien ve lo suyo', icon: 'ph-lock-key', c: P.green },
  { id: 'movil', name: 'App móvil', desc: 'PWA y Android para tutores y docentes', icon: 'ph-device-mobile', c: P.amber },
  { id: 'escritorio', name: 'Escritorio', desc: 'Aplicación para Windows', icon: 'ph-desktop', c: P.rose },
];

export const NAV_LINKS = [
  { href: '#modulos', label: 'Módulos' },
  { href: '#beneficios', label: 'Beneficios' },
  { href: '#comunidad', label: 'Comunidad' },
  { href: '#faq', label: 'Preguntas' },
] as const;
