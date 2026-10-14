/**
 * CATEGORIA de un cargo / linea de recibo (Informes etapa 3: 4 «Facturas por concepto», 12 «Inventario y tienda», cierre del año). Funciones PURAS (sin base de datos):
 * las usan la extension de Prisma de db.ts (categoria de FinCobroItem al crear), lib/recibos.lineasData (categoria de FinReciboItem), el detalle del cierre y el backfill.
 *   colegiatura | inscripcion | reinscripcion | materiales | servicio | articulo | mora | otro
 * Regla: el `tipo` del cargo (col, mat, mora, com, tra, srv, reins, nd) manda; el texto del concepto solo desempata dentro de 'mat' (inscripcion / reinscripcion / materiales)
 * y de 'srv' (articulo de tienda vs servicio). Un cargo 'srv' de ServicioAlumno.productoId es SIEMPRE 'articulo' (quien lo crea lo fija explicitamente).
 */
export type CategoriaCargo = 'colegiatura' | 'inscripcion' | 'reinscripcion' | 'materiales' | 'servicio' | 'articulo' | 'mora' | 'otro';
export const CATEGORIAS: { id: CategoriaCargo; nombre: string }[] = [
  { id: 'colegiatura', nombre: 'Colegiatura' }, { id: 'inscripcion', nombre: 'Inscripción' }, { id: 'reinscripcion', nombre: 'Reinscripción' }, { id: 'materiales', nombre: 'Materiales' },
  { id: 'servicio', nombre: 'Servicios (comedor, transporte, actividades)' }, { id: 'articulo', nombre: 'Artículos (uniformes, libros, útiles)' }, { id: 'mora', nombre: 'Mora' }, { id: 'otro', nombre: 'Otros' },
];
export const nombreCategoria = (id: string) => CATEGORIAS.find(c => c.id === id)?.nombre ?? id;

const RE_ARTICULO = /kiosko|uniforme|camisa|pantal|falda|polo|su[eé]ter|libro|[uú]til|art[ií]culo|mochila|zapato|cuaderno|papeler/;

/** Categoria de un cargo: deriva de FinCobroItem.tipo (col, mat, mora, com, tra, srv, reins, nd) y de su concepto. */
export function categoriaCargo(tipo: string, concepto: string): CategoriaCargo {
  const c = (concepto ?? '').toLowerCase();
  switch (tipo) {
    case 'col': return 'colegiatura';
    case 'mora': return 'mora';
    case 'reins': return 'reinscripcion';
    case 'mat':
      if (/reinscri/.test(c)) return 'reinscripcion';
      if (/inscri/.test(c)) return 'inscripcion';
      return 'materiales';
    case 'com': case 'tra': return 'servicio';
    case 'srv': return RE_ARTICULO.test(c) ? 'articulo' : 'servicio';
    default: return 'otro';
  }
}

/** Categoria de una linea de recibo SIN cargo asociado (lineas historicas): solo se puede deducir del texto del concepto. */
export function categoriaPorConcepto(concepto: string): CategoriaCargo {
  const c = (concepto ?? '').toLowerCase();
  if (/mora|recargo/.test(c)) return 'mora';
  if (/reinscri/.test(c)) return 'reinscripcion';
  if (/inscri/.test(c)) return 'inscripcion';
  if (/colegiatura|mensualidad|cuota \d|pago [uú]nico/.test(c)) return 'colegiatura';
  if (/materiales/.test(c)) return 'materiales';
  if (RE_ARTICULO.test(c)) return 'articulo';
  if (/comedor|almuerzo|alimentaci|transporte|ruta|actividad|taller|extracurricular|f[uú]tbol|ballet|m[uú]sica|ajedrez/.test(c)) return 'servicio';
  return 'otro';
}
