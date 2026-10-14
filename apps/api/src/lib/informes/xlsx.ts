import { deflateRawSync } from 'node:zlib';
import type { InformeCelda, InformeResp, InformeTipoCol } from '@stodia/shared';

/**
 * Escritor mínimo de .xlsx (Office Open XML, varias hojas) sin dependencias: ZIP con deflate de node:zlib. Cabecera en negrita, anchos según contenido,
 * números reales con formato (moneda #,##0.00 / entero #,##0 / porcentaje 0.00). Mismo formato que apps/web/src/components/finanzas/xlsx.ts.
 */
export interface Hoja { nombre: string; cabecera: string[]; tipos?: InformeTipoCol[]; filas: InformeCelda[][]; preambulo?: InformeCelda[][] }

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colL = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(files: [string, string][]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let off = 0;
  for (const [name, text] of files) {
    const nb = Buffer.from(name), raw = Buffer.from(text, 'utf8'), def = deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, def); centrals.push(ch, nb);
    off += 30 + nb.length + def.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

const ESTILO: Record<InformeTipoCol, number> = { texto: 0, fecha: 0, moneda: 2, entero: 3, porcentaje: 4, decimal: 4 };

function hojaXml(h: Hoja): string {
  const pre = h.preambulo ?? [];
  const todas: { celdas: InformeCelda[]; cab?: boolean; est?: number[] }[] = [
    ...pre.map(c => ({ celdas: c })),
    { celdas: h.cabecera, cab: true },
    ...h.filas.map(c => ({ celdas: c, est: (h.tipos ?? []).map(t => ESTILO[t]) })),
  ];
  const anchos = h.cabecera.map((c, i) => Math.min(60, Math.max(8, c.length + 2, ...h.filas.slice(0, 500).map(r => String(r[i] ?? '').length + 2))));
  const data = todas.map((r, ri) => `<row r="${ri + 1}">${r.celdas.map((v, ci) => {
    const ref = colL(ci) + (ri + 1);
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${r.est?.[ci] ? ` s="${r.est[ci]}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${r.cab ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const frozen = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${pre.length + 1}" topLeftCell="A${pre.length + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData></worksheet>`;
}

const nombreHoja = (n: string, usados: Set<string>) => {
  const base = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let nom = base, i = 2;
  while (usados.has(nom.toLowerCase())) { const suf = ` (${i++})`; nom = base.slice(0, 31 - suf.length) + suf; }
  usados.add(nom.toLowerCase());
  return nom;
};

export function xlsxBuffer(hojas: Hoja[]): Buffer {
  const usados = new Set<string>(), nombres = hojas.map(h => nombreHoja(h.nombre, usados));
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`],
    ...hojas.map((h, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
  ];
  return zip(files);
}

/** InformeResp → hojas: «Resumen» (título, filtros, indicadores, notas), una hoja por tabla y una de detalle por cada tabla con filas expandibles. */
export function hojasDeInforme(r: InformeResp): Hoja[] {
  const pre: InformeCelda[][] = [[r.titulo], [`Ciclo: ${r.ciclo}`], ...r.filtros.filter(x => x.etiqueta !== 'Ciclo').map(x => [`${x.etiqueta}: ${x.valor}`]), [`Generado: ${r.generado}`], []];
  const hojas: Hoja[] = [{
    nombre: 'Resumen', preambulo: pre, cabecera: ['Indicador', 'Valor'], tipos: ['texto', 'texto'],
    filas: [...r.resumen.map(x => [x.etiqueta, x.valor] as InformeCelda[]), [], ...r.notas.map(n => [n] as InformeCelda[])],
  }];
  for (const t of r.tablas) {
    const tipos = t.columnas.map(c => c.tipo);
    hojas.push({ nombre: t.titulo, cabecera: t.columnas.map(c => c.titulo), tipos, filas: [...t.filas, ...(t.totales ? [t.totales] : [])] });
    if (t.detalle) {
      const d = t.detalle;
      const filas: InformeCelda[][] = [];
      t.filas.forEach((f, i) => { for (const x of d.porFila[i] ?? []) filas.push([f[0] ?? null, f[1] ?? null, ...x]); });
      hojas.push({ nombre: `Det. ${t.titulo}`, cabecera: [t.columnas[0].titulo, t.columnas[1]?.titulo ?? '', ...d.columnas.map(c => c.titulo)], tipos: ['texto', 'texto', ...d.columnas.map(c => c.tipo)], filas });
    }
  }
  // Anexos (solo exportación): una hoja por tabla (p. ej. matriz alumno × materia por sección).
  for (const a of r.anexos ?? []) hojas.push({ nombre: a.titulo, cabecera: a.columnas.map(c => c.titulo), tipos: a.columnas.map(c => c.tipo), filas: [...a.filas, ...(a.totales ? [a.totales] : [])] });
  return hojas;
}
