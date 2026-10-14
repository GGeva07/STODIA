import type { ScreenId } from '@stodia/shared';

/**
 * Pantallas NUEVAS cuyo permiso por defecto vive en el código (la matriz guardada en SisConfig 'access' se creó antes de existir y no las contiene).
 * Regla (idéntica a apps/web/src/lib/access.ts → canAccess): si NINGÚN rol de la matriz guardada incluye la pantalla (nueva, sin asignar) valen estos
 * defaults; en cuanto el Super Admin/Director guarda la matriz con ella, manda lo guardado. No se reescribe la matriz guardada.
 */
export const DEFECTO_NUEVAS: Record<string, ScreenId[]> = {
  'Super Admin': ['inf-cierre', 'inf-facturacion', 'inf-estudiantes', 'inf-inventario', 'inf-cxc'],
  'Director Académico': ['inf-cierre', 'inf-estudiantes', 'inf-cxc'],
  'Cajero': ['inf-cxc', 'inf-inventario'],
};
const NUEVAS = new Set<ScreenId>(Object.values(DEFECTO_NUEVAS).flat());

export function pantallaPermitida(matriz: Record<string, ScreenId[]>, rol: string, screen: ScreenId): boolean {
  if (rol === 'Super Admin') return true;
  if (NUEVAS.has(screen) && !Object.values(matriz).some(l => l?.includes(screen))) return DEFECTO_NUEVAS[rol]?.includes(screen) ?? false;
  return matriz[rol]?.includes(screen) ?? false;
}
