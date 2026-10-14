import { useSyncExternalStore } from 'react';
import type { Rol, ScreenId } from '@stodia/shared';

/** NAV del prototipo (L2342-2350): [id, título, clase de ícono Phosphor]. */
export interface NavGroup { g: string; items: [ScreenId, string, string][] }

/**
 * Pantallas que existen (ruta, permisos RBAC, migas) pero NO se listan en el menú lateral ni en la paleta ⌘K
 * porque dependen de un contexto previo: el Expediente 360 solo se abre eligiendo un alumno en el Directorio.
 */
export const MENU_OCULTO: ReadonlySet<string> = new Set(['expediente']);

export const NAV: NavGroup[] = [
  { g: 'General', items: [['dashboard', 'Dashboard', 'ph-squares-four']] },
  { g: 'Académico', items: [['notas', 'Matriz de Notas', 'ph-table'], ['asistencia', 'Pase de Lista', 'ph-user-check'], ['horarios', 'Horarios', 'ph-calendar-dots'], ['extra', 'Extracurriculares', 'ph-medal']] },
  { g: 'Estudiantes', items: [['directorio', 'Directorio de Alumnos', 'ph-users'], ['expediente', 'Expediente 360', 'ph-identification-card'], ['tutores', 'Tutores', 'ph-users-three'], ['inscripcion', 'Inscripción', 'ph-user-plus']] },
  { g: 'ERP / CxC', items: [['pos', 'Cobros', 'ph-cash-register'], ['planes', 'Planes de Pago', 'ph-calendar-check'], ['kiosko', 'Venta Rápida', 'ph-storefront'], ['inventario', 'Inventario', 'ph-package'], ['becas', 'Becas y Acuerdos', 'ph-hand-coins']] },
  { g: 'Comedor', items: [['comedor', 'Comedor', 'ph-fork-knife'], ['alimentacion', 'Planes de Alimentación', 'ph-bowl-food']] },
  { g: 'Portales', items: [['portal', 'Portal Tutor', 'ph-device-mobile'], ['comunica', 'Comunicaciones', 'ph-megaphone']] },
  { g: 'Informes', items: [['inf-cierre', 'Informes de cierre de año', 'ph-calendar-check'], ['inf-facturacion', 'Informes de facturación', 'ph-receipt'], ['inf-estudiantes', 'Informes de estudiantes', 'ph-graduation-cap'], ['inf-inventario', 'Informes de inventario', 'ph-package'], ['inf-cxc', 'Informes CxC', 'ph-chart-line-up']] },
  { g: 'Sistema', items: [['catalogos', 'Catálogos Maestros', 'ph-database'], ['config', 'Configuración', 'ph-gear-six'], ['auditoria', 'Auditoría', 'ph-shield-check'], ['licencia', 'Licenciamiento', 'ph-seal-check']] },
];

const ALL: ScreenId[] = ['dashboard', 'tutores', 'inventario', 'catalogos', 'comunica', 'kiosko', 'config', 'auditoria', 'extra', 'alimentacion', 'planes', 'directorio', 'notas', 'asistencia', 'horarios', 'expediente', 'inscripcion', 'pos', 'becas', 'comedor', 'portal', 'inf-cierre', 'inf-facturacion', 'inf-estudiantes', 'inf-inventario', 'inf-cxc'];

/** RBAC del prototipo (L2367-2374). 'licencia' no figura en ACCESS del prototipo: aquí solo Super Admin (supuesto). */
export const ACCESS: Record<Rol, ScreenId[]> = {
  'Super Admin': [...ALL, 'licencia'],
  'Director Académico': ['dashboard', 'tutores', 'comunica', 'auditoria', 'extra', 'directorio', 'planes', 'notas', 'asistencia', 'horarios', 'expediente', 'becas', 'alimentacion', 'inf-cierre', 'inf-estudiantes', 'inf-cxc'],
  'Docente': ['extra', 'directorio', 'notas', 'asistencia', 'horarios', 'expediente'],
  'Cajero': ['dashboard', 'tutores', 'kiosko', 'inventario', 'extra', 'directorio', 'planes', 'alimentacion', 'pos', 'becas', 'expediente', 'comedor', 'inscripcion', 'inf-cxc', 'inf-inventario'],
  'Encargado Comedor': ['directorio', 'comedor', 'alimentacion', 'expediente'],
  'Tutor': ['portal'],
};

/** USERS del prototipo; solo para pistas de login en desarrollo. El login real va contra la API. */
export const DEMO_USERS: { usuario: string; nombre: string; rol: Rol }[] = !import.meta.env.DEV ? [] : [
  { usuario: 'usr_palmanzar', nombre: 'Pedro Almánzar', rol: 'Super Admin' },
  { usuario: 'usr_cvidal', nombre: 'Carmen Vidal', rol: 'Director Académico' },
  { usuario: 'usr_ralmonte', nombre: 'Rafael Almonte', rol: 'Docente' },
  { usuario: 'usr_arosario', nombre: 'Ana Rosario', rol: 'Cajero' },
  { usuario: 'usr_jtejada', nombre: 'Julio Tejada', rol: 'Encargado Comedor' },
  { usuario: 'c.mendoza', nombre: 'Carlos Mendoza', rol: 'Tutor' },
];

/** Matriz RBAC guardada en el servidor (Configuración › Roles y permisos). Vacía = se usa ACCESS base. Super Admin siempre conserva todo. */
let override: Record<string, ScreenId[]> = {};
let version = 0;
const listeners = new Set<() => void>();
export function setAccessOverride(m: Record<string, ScreenId[]> | null | undefined) {
  override = m ?? {};
  version++;
  listeners.forEach(l => l());
}
/** Re-renderiza al cambiar la matriz: úsalo en componentes que llaman canAccess. */
export const useAccessVersion = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version);

/** Papelería abierta al público (GET /config). null = aún no se sabe: no se oculta nada hasta conocerlo (la API igual rechaza la venta si está cerrada). */
let papeleria: boolean | null = null;
export function setPapeleriaAbierta(v: boolean | null | undefined) {
  papeleria = v ?? null;
  version++;
  listeners.forEach(l => l());
}

/**
 * Pantallas NUEVAS (Informes): una matriz guardada antes de existir no las contiene. Si NINGÚN rol de la matriz guardada incluye la pantalla
 * (nueva, sin asignar) valen los defaults del código (ACCESS); en cuanto alguien guarda la matriz con ella, manda lo guardado. Mismo criterio en el
 * servidor (apps/api/src/lib/acceso-nuevas.ts → plugins/auth.ts requireScreen).
 */
export const PANTALLAS_NUEVAS: ReadonlySet<ScreenId> = new Set<ScreenId>(['inf-cierre', 'inf-facturacion', 'inf-estudiantes', 'inf-inventario', 'inf-cxc']);
const sinAsignar = (m: Record<string, ScreenId[]>, id: ScreenId) => PANTALLAS_NUEVAS.has(id) && !Object.values(m).some(l => l?.includes(id));
/** Matriz con los defaults de las pantallas nuevas aún sin asignar (para mostrarla y editarla en Roles y permisos). */
export function conPantallasNuevas(m: Record<string, ScreenId[]>): Record<string, ScreenId[]> {
  const out: Record<string, ScreenId[]> = Object.fromEntries(Object.entries(m).map(([r, l]) => [r, [...l]]));
  for (const id of PANTALLAS_NUEVAS) if (sinAsignar(m, id)) for (const r of Object.keys(out)) if (ACCESS[r as Rol]?.includes(id) && !out[r].includes(id)) out[r].push(id);
  if (out['Super Admin']) for (const id of PANTALLAS_NUEVAS) if (!out['Super Admin'].includes(id)) out['Super Admin'].push(id); // el Super Admin siempre conserva todo
  return out;
}
const permitido = (rol: Rol, id: ScreenId) => {
  if (rol === 'Super Admin') return ACCESS['Super Admin'].includes(id);
  if (sinAsignar(override, id)) return ACCESS[rol]?.includes(id) ?? false;
  return (override[rol] ?? ACCESS[rol])?.includes(id) ?? false;
};
export const canAccess = (rol: Rol, id: ScreenId) => !(id === 'kiosko' && papeleria === false) && permitido(rol, id);

export const screenTitle = (id: ScreenId) => NAV.flatMap(g => g.items).find(i => i[0] === id)?.[1] ?? id;

/** Ruta inicial tras el login. */
export function homeFor(rol: Rol): string {
  if (rol === 'Tutor') return '/m/tutor';
  const first = NAV.flatMap(g => g.items).find(i => canAccess(rol, i[0]));
  return first ? `/${first[0]}` : '/sin-acceso';
}
