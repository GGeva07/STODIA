import type { InformeCelda, InformeColumna, InformeResp, InformeTabla } from '@stodia/shared';
import { B, type PBlock, type PDoc } from './print';
import type { XHoja } from './xlsx';

/** Formatos de celda de los informes (pantalla y PDF). */
export const fmtNum = (n: number, dec = 2) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export function celdaTxt(v: InformeCelda | undefined, c: InformeColumna, moneda = true): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return v;
  if (c.tipo === 'moneda') return (moneda ? 'RD$ ' : '') + fmtNum(v);
  if (c.tipo === 'entero') return fmtNum(v, 0);
  if (c.tipo === 'porcentaje') return fmtNum(v, 1) + ' %';
  if (c.tipo === 'decimal') return fmtNum(v, Number.isInteger(v) ? 0 : v >= 10 ? 1 : 2);
  return String(v);
}
export const valorResumen = (r: InformeResp['resumen'][number]) => (typeof r.valor === 'string' ? r.valor : celdaTxt(r.valor, { id: r.id, titulo: '', tipo: r.tipo }));

/** Filas máximas por tabla en el PDF cuando el informe no fija `pdfMax`: el PDF de miles de filas tarda decenas de segundos y pesa varios MB (html2canvas); el Excel lleva todo. */
export const PDF_MAX_DEF = 75;
const alin = (c: InformeColumna) => (c.tipo === 'texto' || c.tipo === 'fecha' ? 'left' : 'right');

/** Tabla del informe como bloque de PDF: columnas proporcionales a su contenido (las filas del motor son rejillas independientes: las fracciones mantienen la alineación). */
function bloqueTabla(t: InformeTabla): PBlock[] {
  const max = t.pdfMax ?? PDF_MAX_DEF;
  const recortada = t.filas.length > max;
  const filas = [...(recortada ? t.filas.slice(0, max) : t.filas), ...(t.totales ? [t.totales] : [])];
  const pesos = t.columnas.map((c, i) => {
    const max = Math.max(c.titulo.length * 0.75, ...filas.slice(0, 400).map(f => celdaTxt(f[i], c, false).length));
    return Math.min(30, Math.max(5, max)) + (c.tipo === 'texto' ? 2 : 1.5);
  });
  return [
    B.text(t.titulo, true),
    B.table(t.columnas.map(c => c.titulo), filas.map(f => t.columnas.map((c, i) => celdaTxt(f[i], c, false))), pesos.map(w => `minmax(0,${w}fr)`), t.columnas.map(alin)),
    ...(recortada ? [B.text(`Se imprimen las primeras ${max} de ${t.filas.length.toLocaleString('en-US')} filas; el listado completo está en la exportación a Excel.`)] : []),
  ];
}

/** Reporte Carta de un informe con TODAS las filas del filtro (el visor pide `size=all`). Encabezado institucional lo pone el motor; aquí título, filtros, resumen, tablas y notas. */
export function docInforme(r: InformeResp): PDoc {
  const sub = [`Ciclo ${r.ciclo}`, ...r.filtros.filter(f => f.etiqueta !== 'Ciclo').map(f => `${f.etiqueta}: ${f.valor}`), `Generado el ${r.generado}`].join(' · ');
  const blocks: PBlock[] = [
    B.kv(r.resumen.map(x => [x.etiqueta, valorResumen(x)] as [string, string])),
    ...r.tablas.flatMap(t => (t.filas.length || t.totales ? bloqueTabla(t) : [B.text(t.titulo, true), B.text(t.vacio ?? 'Sin datos.')])),
    ...(r.tablas.some(t => t.detalle) ? [B.text('El detalle expandible de cada fila (cargos, líneas) está disponible en la exportación a Excel.')] : []),
    B.text('Notas y definiciones', true),
    ...r.notas.map(n => B.text(n)),
    B.text('Montos en pesos dominicanos (RD$).'),
  ];
  return { kind: 'carta', name: r.titulo, file: `informe_${r.id}_${r.ciclo.replace(/[^0-9A-Za-z]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`, format: 'Carta 8.5 × 11 in', sign: [], pages: [{ title: r.titulo, sub, blocks }] };
}

const fmtCol = (c: InformeColumna) => c.tipo;
/** InformeResp → hojas de Excel: «Resumen», una por tabla y una de detalle por cada tabla expandible. */
export function hojasInforme(r: InformeResp): XHoja[] {
  const pre: InformeCelda[][] = [[r.titulo], [`Ciclo: ${r.ciclo}`], ...r.filtros.filter(x => x.etiqueta !== 'Ciclo').map(x => [`${x.etiqueta}: ${x.valor}`]), [`Generado: ${r.generado}`], []];
  const hojas: XHoja[] = [{
    nombre: 'Resumen', pre, head: ['Indicador', 'Valor'],
    rows: [...r.resumen.map(x => [x.etiqueta, x.valor] as InformeCelda[]), [], ...r.notas.map(n => [n] as InformeCelda[])],
  }];
  for (const t of r.tablas) {
    hojas.push({ nombre: t.titulo, head: t.columnas.map(c => c.titulo), fmt: t.columnas.map(fmtCol), rows: [...t.filas, ...(t.totales ? [t.totales] : [])] });
    if (t.detalle) {
      const d = t.detalle, rows: InformeCelda[][] = [];
      t.filas.forEach((f, i) => { for (const x of d.porFila[i] ?? []) rows.push([f[0] ?? null, f[1] ?? null, ...x]); });
      hojas.push({ nombre: `Det. ${t.titulo}`, head: [t.columnas[0].titulo, t.columnas[1]?.titulo ?? '', ...d.columnas.map(c => c.titulo)], fmt: ['texto', 'texto', ...d.columnas.map(fmtCol)], rows });
    }
  }
  for (const a of r.anexos ?? []) hojas.push({ nombre: a.titulo, head: a.columnas.map(c => c.titulo), fmt: a.columnas.map(fmtCol), rows: [...a.filas, ...(a.totales ? [a.totales] : [])] });
  return hojas;
}
