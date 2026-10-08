import { useSyncExternalStore } from 'react';
import type { Rol, ScreenId } from '@stodia/shared';

/** NAV del prototipo (L2342-2350): [id, título, clase de ícono Phosphor]. */
export interface NavGroup { g: string; items: [ScreenId, string, string][] }

export const NAV: NavGroup[] = [
  { g: 'General', items: [['dashboard', 'Dashboard', 'ph-squares-four']] },
  { g: 'Académico', items: [['notas', 'Matriz de Notas', 'ph-table'], ['asistencia', 'Pase de Lista', 'ph-user-check'], ['horarios', 'Horarios', 'ph-calendar-dots'], ['extra', 'Extracurriculares', 'ph-medal']] },
  { g: 'Estudiantes', items: [['directorio', 'Directorio de Alumnos', 'ph-users'], ['expediente', 'Expediente 360', 'ph-identification-card'], ['tutores', 'Tutores', 'ph-users-three'], ['inscripcion', 'Inscripción', 'ph-user-plus']] },
  { g: 'ERP / CxC', items: [['pos', 'Cobros', 'ph-cash-register'], ['planes', 'Planes de Pago', 'ph-calendar-check'], ['kiosko', 'Venta Rápida', 'ph-storefront'], ['inventario', 'Inventario', 'ph-package'], ['becas', 'Becas y Acuerdos', 'ph-hand-coins']] },
  { g: 'Comedor', items: [['comedor', 'Comedor', 'ph-fork-knife'], ['alimentacion', 'Planes de Alimentación', 'ph-bowl-food']] },
  { g: 'Portales', items: [['portal', 'Portal Tutor', 'ph-device-mobile'], ['comunica', 'Comunicaciones', 'ph-megaphone']] },
  { g: 'Sistema', items: [['catalogos', 'Catálogos Maestros', 'ph-database'], ['config', 'Configuración', 'ph-gear-six'], ['auditoria', 'Auditoría', 'ph-shield-check'], ['licencia', 'Licenciamiento', 'ph-seal-check']] },
];

const ALL: ScreenId[] = ['dashboard', 'tutores', 'inventario', 'catalogos', 'comunica', 'kiosko', 'config', 'auditoria', 'extra', 'alimentacion', 'planes', 'directorio', 'notas', 'asistencia', 'horarios', 'expediente', 'inscripcion', 'pos', 'becas', 'comedor', 'portal'];

/** RBAC del prototipo (L2367-2374). 'licencia' no figura en ACCESS del prototipo: aquí solo Super Admin (supuesto). */
export const ACCESS: Record<Rol, ScreenId[]> = {
  'Super Admin': [...ALL, 'licencia'],
  'Director Académico': ['dashboard', 'tutores', 'comunica', 'auditoria', 'extra', 'directorio', 'planes', 'notas', 'asistencia', 'horarios', 'expediente', 'becas'],
  'Docente': ['extra', 'directorio', 'notas', 'asistencia', 'horarios', 'expediente'],
  'Cajero': ['dashboard', 'tutores', 'kiosko', 'inventario', 'extra', 'directorio', 'planes', 'alimentacion', 'pos', 'becas', 'expediente', 'comedor', 'inscripcion'],
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

export const canAccess = (rol: Rol, id: ScreenId) => (rol === 'Super Admin' ? ACCESS['Super Admin'] : override[rol] ?? ACCESS[rol])?.includes(id) ?? false;

export const screenTitle = (id: ScreenId) => NAV.flatMap(g => g.items).find(i => i[0] === id)?.[1] ?? id;

/** Ruta inicial tras el login. */
export function homeFor(rol: Rol): string {
  if (rol === 'Tutor') return '/m/tutor';
  const first = NAV.flatMap(g => g.items).find(i => canAccess(rol, i[0]));
  return first ? `/${first[0]}` : '/sin-acceso';
}
