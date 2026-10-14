/**
 * Escritor mínimo de .xlsx (Office Open XML) sobre fflate: sin dependencias pesadas, sin servidor.
 * `xlsxBlob` escribe UNA hoja (cabecera en negrita, anchos según contenido, cadenas inline; los números puros se guardan como número).
 * `xlsxLibro` escribe VARIAS hojas (informes: resumen + detalle) con celdas numéricas con formato (moneda / entero / porcentaje).
 */
import { zipSync, strToU8 } from 'fflate';

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export type XCelda = string | number | null | undefined;
/** Una hoja: `pre` = filas previas a la cabecera (título, filtros); `fmt` = formato por columna ('moneda' #,##0.00 · 'entero' #,##0 · 'porcentaje' 0.00). */
export interface XHoja { nombre: string; head: string[]; rows: XCelda[][]; pre?: XCelda[][]; fmt?: ('texto' | 'moneda' | 'entero' | 'porcentaje' | 'fecha' | 'decimal')[] }

const ESTILO = { texto: 0, fecha: 0, moneda: 2, entero: 3, porcentaje: 4, decimal: 4 } as const;

function hojaXml(h: XHoja): string {
  const pre = h.pre ?? [];
  const widths = h.head.map((t, c) => Math.min(60, Math.max(8, t.length + 2, ...h.rows.slice(0, 1000).map(r => String(r[c] ?? '').length + 2))));
  const cell = (v: XCelda, r: number, c: number, kind: 'pre' | 'head' | 'row') => {
    if (v === null || v === undefined || v === '') return '';
    const ref = col(c) + (r + 1);
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${kind === 'row' && h.fmt?.[c] && ESTILO[h.fmt[c]] ? ` s="${ESTILO[h.fmt[c]]}"` : ''}><v>${v}</v></c>` : '';
    // Compatibilidad: una cadena numérica pura en una fila de datos se guarda como número (salvo códigos con ceros a la izquierda).
    if (kind === 'row' && /^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${kind === 'head' || (kind === 'pre' && r === 0) ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const filas: [XCelda[], 'pre' | 'head' | 'row'][] = [...pre.map(r => [r, 'pre'] as [XCelda[], 'pre']), [h.head, 'head'], ...h.rows.map(r => [r, 'row'] as [XCelda[], 'row'])];
  const data = filas.map(([r, k], ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, ri, ci, k)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${pre.length + 1}" topLeftCell="A${pre.length + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData></worksheet>`;
}

const nombreHoja = (n: string, usados: Set<string>) => {
  const base = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let nom = base, i = 2;
  while (usados.has(nom.toLowerCase())) { const suf = ` (${i++})`; nom = base.slice(0, 31 - suf.length) + suf; }
  usados.add(nom.toLowerCase());
  return nom;
};

/** Libro con una o varias hojas. */
export function xlsxLibro(hojas: XHoja[]): Blob {
  const usados = new Set<string>(), nombres = hojas.map(h => nombreHoja(h.nombre, usados));
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  };
  hojas.forEach((h, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = hojaXml(h); });
  const z = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
  return new Blob([z as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Una sola hoja (firma original; la usan Directorio, Promoción y Reinscripción). */
export function xlsxBlob(sheet: string, head: string[], rows: string[][]): Blob {
  return xlsxLibro([{ nombre: sheet, head, rows }]);
}
