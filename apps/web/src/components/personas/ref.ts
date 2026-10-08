import { useEffect, useState } from 'react';
import type { AcadCatalogos, ConfigGlobal } from '@stodia/shared';
import { api } from '../../lib/api';

/**
 * Referencias de la institución para Directorio / Expediente / Inscripción: ciclo activo (GET /config) y grados, tandas y
 * secciones (GET /catalogos). Nada de esto va escrito en las pantallas; una instalación vacía devuelve listas vacías.
 */
export interface PersRef { ciclo: string; grados: string[]; tandas: string[]; secciones: string[] }
const vacio: PersRef = { ciclo: '', grados: [], tandas: [], secciones: [] };

let cache: PersRef | null = null;
let pending: Promise<PersRef> | null = null;

function cargar(): Promise<PersRef> {
  pending ??= Promise.all([api.get<ConfigGlobal>('/config'), api.get<AcadCatalogos>('/catalogos')])
    .then(([cfg, cat]) => {
      const act = (t: string) => (cat[t] ?? []).filter(r => r.estado === 'Activo');
      const uniq = (l: string[]) => [...new Set(l.filter(Boolean))];
      const orden = (r: Record<string, unknown>) => Number(r.orden) || 0;
      cache = {
        ciclo: cfg.ciclos.find(c => c.estado === 'Activo')?.n ?? '',
        grados: uniq(act('grados').sort((a, b) => orden(a) - orden(b)).map(g => String(g.grado))),
        tandas: uniq(act('tandas').map(t => String(t.nombre))),
        secciones: uniq(act('secciones').map(s => String(s.seccion))).sort(),
      };
      return cache;
    })
    .catch(() => vacio)
    .finally(() => { pending = null; });
  return pending;
}

export function usePersRef(): PersRef {
  const [r, setR] = useState<PersRef>(cache ?? vacio);
  useEffect(() => { let live = true; void cargar().then(x => live && setR(x)); return () => { live = false; }; }, []);
  return r;
}

/** Opciones de un selector: las del catálogo más el valor actual (si el catálogo ya no lo trae). */
export const opciones = (base: string[], ...extra: string[]) => [...new Set([...base, ...extra.filter(Boolean)])];
