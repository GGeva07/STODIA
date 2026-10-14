/**
 * Sección «Informes» (docs/informes-analisis.md). Contrato común de todos los informes: GET /informes (catálogo),
 * GET /informes/:id (datos), GET /informes/:id/export?formato=xlsx. SOLO TIPOS.
 */
import type { CierreResumen } from './promocion';

/** ScreenId de las 5 entradas del menú «Informes». */
export type InformeGrupo = 'inf-cierre' | 'inf-facturacion' | 'inf-estudiantes' | 'inf-inventario' | 'inf-cxc';

/** Filtros que un informe puede soportar (los fija el registro; la pantalla dibuja solo los soportados). */
export type InformeFiltroId =
  | 'ciclo' | 'desde' | 'hasta' | 'grado' | 'seccion' | 'tutor' | 'soloVencidos'
  | 'metodo' | 'cajero' | 'plan' | 'tipo' | 'motivo'
  /** Etapa 3: resultado del alumno (Informe 2), materia y periodo (3), categoria de cargo o de producto (4, 12), disciplina extracurricular (9, 10), tipo de comprobante NCF (4). */
  | 'resultado' | 'materia' | 'periodo' | 'categoria' | 'disciplina' | 'comprobante';

export interface InformeMeta {
  id: string;
  titulo: string;
  grupo: InformeGrupo;
  descripcion: string;
  filtros: InformeFiltroId[];
  /** 'preparacion' = aún no disponible (se lista deshabilitado). */
  estado: 'listo' | 'preparacion';
  /** Número del informe en docs/informes-analisis.md (1–12). */
  num: number;
}

export type InformeCelda = string | number | null;
/** 'decimal' = número con decimales sin símbolo de moneda (promedios, rotación). */
export type InformeTipoCol = 'texto' | 'moneda' | 'entero' | 'porcentaje' | 'fecha' | 'decimal';
export interface InformeColumna { id: string; titulo: string; tipo: InformeTipoCol }

export interface InformeTabla {
  id: string;
  titulo: string;
  columnas: InformeColumna[];
  /** Filas de la página pedida (o todas con size=all). */
  filas: InformeCelda[][];
  /** Totales del conjunto COMPLETO (alineados con `columnas`; null = sin total). */
  totales?: InformeCelda[];
  /** Filas del conjunto completo. */
  total: number;
  page: number;
  size: number;
  paginable?: boolean;
  /** Detalle expandible, alineado con `filas` (una tabla por fila). */
  detalle?: { titulo: string; columnas: InformeColumna[]; porFila: InformeCelda[][][] };
  /** Texto cuando no hay filas. */
  vacio?: string;
  /** Máximo de filas que el PDF imprime de esta tabla (el Excel lleva todas); el PDF avisa del recorte. Sin valor = todas. */
  pdfMax?: number;
}

export interface InformeResumenItem { id: string; etiqueta: string; valor: number | string; tipo: InformeTipoCol; tono?: 'ok' | 'warn' | 'bad' | 'info' }

export interface InformeResp {
  id: string;
  titulo: string;
  grupo: InformeGrupo;
  ciclo: string;
  /** Filtros aplicados en texto legible (para encabezado de PDF/Excel). */
  filtros: { etiqueta: string; valor: string }[];
  generado: string;
  resumen: InformeResumenItem[];
  tablas: InformeTabla[];
  notas: string[];
  /** Tablas que SOLO viajan en la exportacion (size=all) y se vuelcan como hojas extra de Excel (p. ej. una hoja por seccion); no se muestran en pantalla ni en el PDF. */
  anexos?: InformeTabla[];
}

export interface InformeCatalogos {
  ciclos: { n: string; estado: string }[];
  grados: { id: string; nombre: string }[];
  secciones: { id: string; nombre: string; gradoId: string }[];
  metodos: { id: string; nombre: string }[];
  cajeros: { id: string; nombre: string }[];
  planes: { id: string; nombre: string }[];
  motivos: { id: string; nombre: string }[];
  /** Etapa 3 */
  materias: { id: string; nombre: string }[];
  periodos: { orden: number; nombre: string }[];
  disciplinas: { id: string; nombre: string }[];
  categoriasProducto: { id: string; nombre: string }[];
  categoriasCargo: { id: string; nombre: string }[];
  comprobantes: { id: string; nombre: string }[];
  resultados: { id: string; nombre: string }[];
}

export interface InformeCierreFila {
  ciclo: string;
  estado: string;
  /** null = ciclo cerrado antes de existir el registro de cierres (los totales se calculan al abrirlo). */
  fecha: string | null;
  usuario: string | null;
  facturado: number | null;
  cobrado: number | null;
  pendiente: number | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// ETAPA 2 · Detalle del cierre de año (docs/informes-analisis.md §9). GET /informes/cierre/:ciclo[?tabla=...] y GET /informes/cierre/:ciclo/export.
// ---------------------------------------------------------------------------------------------------------------------

/** Listados del detalle del cierre (`?tabla=`). `deudores` sale del JSON de deuda por alumno guardado en CierreCiclo; el resto, de CierreCicloDetalle. */
export type CierreTablaId = 'cargos' | 'recibos' | 'notas' | 'descuentos' | 'ventas' | 'deudores';

/** Comparación de una cifra de CierreCiclo con la suma de las filas de detalle (`diferencia` = detalle − cifra; ok = |dif| < 0.01). */
export interface CierreCuadre { id: string; etiqueta: string; cifra: number; detalle: number; diferencia: number; ok: boolean }

export interface CierreDetalleAgregado {
  /** Filas guardadas por tipo (cargo, recibo, nota, descuento, venta). */
  filas: Record<string, number>;
  /** Desgloses agregados en SQL (groupBy) sobre CierreCicloDetalle, ya como tablas con totales: ver ids en docs/informes-analisis.md §9. */
  desgloses: Record<string, InformeTabla>;
  /** Por id de cifra (facturado, cobrado, nc, nd, neto, desc, pend, venc, mora, morap, recibos, cargos, deudores). */
  cuadre: Record<string, CierreCuadre>;
  /** Fecha del cierre (dd/mm/aaaa) a la que se calcularon «vencido» y la antigüedad. */
  fechaCierre: string;
  notas: string[];
}

/** Respuesta de GET /informes/cierre/:ciclo: el resumen guardado + el detalle (o `detalleDisponible:false` con el aviso en cierres anteriores a esta función). */
export interface CierreInforme extends CierreResumen {
  detalleDisponible: boolean;
  aviso?: string;
  detalle?: CierreDetalleAgregado;
}
