/**
 * ServicioAlumno (Fase 2C): el servicio contratado apunta con FK REAL a UN elemento del catalogo (ruta de transporte, plan de alimentacion, actividad
 * extracurricular o producto). La API conserva la clave textual del catalogo (`rt:<id>` / `ali:<id>` / `ext:<id>` / `prd:<id>`) como `catKey`,
 * que aqui se traduce de ida y vuelta. El CHECK CK_ServicioAlumno_catalogo (lib/db-indices) exige exactamente una columna no nula.
 */
export interface FkCatalogo { rutaId: string | null; aliPlanId: string | null; extraId: string | null; productoId: string | null }
const VACIO: FkCatalogo = { rutaId: null, aliPlanId: null, extraId: null, productoId: null };

/** Clave de catalogo («rt:r1») -> columna FK. null si el prefijo no es de ningun catalogo. */
export function fkDeCatKey(k: string): FkCatalogo | null {
  const i = k.indexOf(':'), id = k.slice(i + 1);
  if (i < 0 || !id) return null;
  switch (k.slice(0, i)) {
    case 'rt': return { ...VACIO, rutaId: id };
    case 'ali': return { ...VACIO, aliPlanId: id };
    case 'ext': return { ...VACIO, extraId: id };
    case 'prd': return { ...VACIO, productoId: id };
    default: return null;
  }
}
/** Columna FK -> clave de catalogo. */
export function catKeyDe(s: FkCatalogo): string {
  return s.rutaId ? `rt:${s.rutaId}` : s.aliPlanId ? `ali:${s.aliPlanId}` : s.extraId ? `ext:${s.extraId}` : s.productoId ? `prd:${s.productoId}` : '';
}
