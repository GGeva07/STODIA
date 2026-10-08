/**
 * Motor de PDF (opción A, cliente): renderiza el MISMO componente <Paper> de la vista previa fuera de pantalla,
 * lo rasteriza con html2canvas a escala 2 y lo pagina con jsPDF (Carta 8.5x11 in con márgenes de 1 in; tirilla 80 mm x alto variable).
 * Todo va en el bundle (sin CDN) y se carga bajo demanda (import dinámico desde print.tsx).
 * Los saltos de página caen siempre ENTRE filas `.prow` (nunca cortan una fila ni el bloque de firmas).
 * Boletines (doc.folioTipo): folio del servidor + SHA-256 del contenido + QR en el margen inferior. NO es firma digital.
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';
import { zipSync, strToU8 } from 'fflate';
import { api, getConfig } from '../../lib/api';
import { loadPerfil, perfilSync } from './perfil';
import { Paper, type PDoc } from './print';
import { sha256Hex } from './sha256';

const PX_IN = 96;
const SCALE = 2;
const CONTENT_H = 9 * PX_IN; // alto útil de una hoja Carta con márgenes de 1 in

interface Folio { folio: string; hash: string }

/** Renderiza las páginas indicadas del documento en un contenedor fuera de pantalla y devuelve sus nodos (+ limpieza). */
async function montar(doc: PDoc, idx: number[]) {
  await loadPerfil();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;background:#fff;';
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<>{idx.map(pi => <Paper key={pi} doc={doc} pi={pi} bare />)}</>));
  await document.fonts.ready;
  await Promise.all(['400 12px Inter', '600 12px Inter', '700 12px Inter', '400 11px "JetBrains Mono"', '600 11px "JetBrains Mono"'].map(f => document.fonts.load(f, 'Aá1').catch(() => [])));
  await Promise.all(Array.from(host.querySelectorAll('img')).map(i => i.decode().catch(() => undefined)));
  const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  return { nodes, limpiar: () => { root.unmount(); host.remove(); } };
}

/** Alto real de la hoja (px CSS, redondeado hacia arriba: scrollHeight trunca y recortaba el último renglón). */
const alto = (el: HTMLElement) => Math.ceil(el.getBoundingClientRect().height) + 1;

/** Cortes verticales (px CSS) de una hoja Carta: nunca dentro de una fila `.prow`. */
function cortes(el: HTMLElement): number[] {
  const base = el.getBoundingClientRect().top, total = alto(el);
  const cuts = [0];
  let start = 0;
  for (const r of Array.from(el.querySelectorAll('.prow'))) {
    const b = r.getBoundingClientRect(), top = b.top - base, bottom = b.bottom - base;
    if (bottom - start > CONTENT_H + 0.5 && top > start + 1) { start = top; cuts.push(top); }
    while (bottom - start > CONTENT_H + 0.5) { start += CONTENT_H; cuts.push(start); } // fila más alta que la hoja: corte forzado
  }
  cuts.push(total);
  return cuts;
}

const MAX_LOTE = 6 * CONTENT_H; // alto máximo (px CSS) por captura: evita canvas gigantes (límites de Safari/WebView móvil)

interface Calidad { mime: 'image/png' | 'image/jpeg'; fmt: 'PNG' | 'JPEG'; q: number; scale: number }
/** PNG a 2x (≈192 dpi) para documentos cortos; JPEG q0.8 a 1.5x (≈144 dpi) cuando son muchas páginas (mantiene el archivo en tamaño razonable). */
const calidad = (totalPaginas: number): Calidad => (totalPaginas > 12 ? { mime: 'image/jpeg', fmt: 'JPEG', q: 0.8, scale: 1.5 } : { mime: 'image/png', fmt: 'PNG', q: 1, scale: SCALE });

/** Rasteriza una hoja Carta en `cs.length-1` imágenes (una por página PDF), capturando por lotes verticales. */
async function rebanadas(el: HTMLElement, cs: number[], cal: Calidad): Promise<string[]> {
  const out: string[] = [];
  let i = 0;
  while (i < cs.length - 1) {
    let j = i + 1;
    while (j < cs.length - 1 && cs[j + 1] - cs[i] <= MAX_LOTE) j++;
    const y0 = cs[i], y1 = cs[j];
    const canvas = await html2canvas(el, { scale: cal.scale, backgroundColor: '#FFFFFF', useCORS: true, logging: false, x: 0, y: y0, width: el.offsetWidth, height: y1 - y0, scrollX: 0, scrollY: 0, windowWidth: Math.max(el.offsetWidth, 1) });
    for (let k = i; k < j; k++) out.push(recorte(canvas, cs[k] - y0, cs[k + 1] - y0, cal.scale).toDataURL(cal.mime, cal.q));
    i = j;
  }
  return out;
}

function recorte(src: HTMLCanvasElement, y0: number, y1: number, scale: number) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = Math.max(1, Math.round((y1 - y0) * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, Math.round(y0 * scale), src.width, c.height, 0, 0, c.width, c.height);
  return c;
}

const verifUrl = (folio: string) => `${getConfig().apiUrl || window.location.origin}`.replace(/\/$/, '') + '/verificar/' + folio;

function pieVerificacion(pdf: jsPDF, f: Folio) {
  const url = verifUrl(f.folio);
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), size = 0.62, mod = size / n, x0 = 8.5 - 1 - size, y0 = 10.1;
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) pdf.rect(x0 + c * mod, y0 + r * mod, mod + 0.002, mod + 0.002, 'F');
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
  pdf.text('Código de verificación (no es firma digital)', 1, 10.18);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
  pdf.text('Folio: ' + f.folio, 1, 10.32);
  pdf.text('SHA-256: ' + f.hash.slice(0, 32), 1, 10.45);
  pdf.text('            ' + f.hash.slice(32), 1, 10.57);
  pdf.text('Verifique el folio en: ' + url, 1, 10.7);
}


/** Contenido canónico de una página (para el hash): institución + título + bloques + firmas. */
const contenidoPagina = (doc: PDoc, pi: number) => JSON.stringify({ inst: perfilSync()?.nombre ?? '', rnc: perfilSync()?.rnc ?? '', doc: doc.name, kind: doc.kind, p: doc.pages[pi], sign: doc.sign });

async function pedirFolios(doc: PDoc, idx: number[]): Promise<Folio[]> {
  const items = await Promise.all(idx.map(async pi => ({ hash: await sha256Hex(contenidoPagina(doc, pi)), detalle: `${doc.name} · ${doc.pages[pi].sub}`.slice(0, 200) })));
  const res = await api.post<{ folio: string }[]>('/documentos/folios', { tipo: doc.folioTipo, items }).catch(() => { throw new Error('No se pudo registrar el folio de verificación: revisa la conexión con el servidor'); });
  return res.map((r, i) => ({ folio: r.folio, hash: items[i].hash }));
}


/** Dibuja una hoja del documento en el jsPDF (crea el PDF con la primera). Carta: N páginas de 8.5x11 in; tirilla: 1 página 80 mm x alto variable. */
async function agregarHoja(pdf: jsPDF | null, doc: PDoc, pi: number, folio: Folio | null, cal: Calidad): Promise<jsPDF> {
  const { nodes, limpiar } = await montar(doc, [pi]);
  try {
    const el = nodes[0];
    if (doc.kind === 'carta') {
      const cs = cortes(el), imgs = await rebanadas(el, cs, cal);
      imgs.forEach((src, i) => {
        if (!pdf) pdf = new jsPDF({ unit: 'in', format: [8.5, 11], orientation: 'portrait', compress: true });
        else pdf.addPage([8.5, 11], 'portrait');
        pdf.addImage(src, cal.fmt, 1, 1, el.offsetWidth / PX_IN, (cs[i + 1] - cs[i]) / PX_IN, undefined, 'FAST');
        if (folio) pieVerificacion(pdf, folio);
      });
    } else {
      const h = alto(el), wmm = 80, hmm = (h / PX_IN) * 25.4;
      const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: '#FFFFFF', useCORS: true, logging: false, width: el.offsetWidth, height: h, scrollX: 0, scrollY: 0 });
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [wmm, hmm], orientation: 'portrait', compress: true });
      else pdf.addPage([wmm, hmm], 'portrait');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, wmm, hmm, undefined, 'FAST');
    }
    return pdf!;
  } finally { limpiar(); }
}

/** PDF completo del documento (todas las páginas en un solo archivo). Se monta y captura una hoja a la vez (coste lineal). */
export async function generarPdf(doc: PDoc): Promise<Blob> {
  const idx = doc.pages.map((_, i) => i);
  const folios = doc.folioTipo ? await pedirFolios(doc, idx) : null;
  const cal = calidad(doc.kind === 'carta' ? doc.pages.length : 1);
  let pdf: jsPDF | null = null;
  for (const pi of idx) pdf = await agregarHoja(pdf, doc, pi, folios ? folios[pi] : null, cal);
  pdf!.setProperties({ title: doc.name, subject: doc.pages[0].title, creator: 'STODIA', author: perfilSync()?.nombre ?? 'STODIA' });
  return pdf!.output('blob');
}

const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Un PDF por página (p. ej. un boletín por alumno), empaquetados en un ZIP; cada uno con su propio folio. */
export async function generarZipPorPagina(doc: PDoc): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const idx = doc.pages.map((_, i) => i);
  const folios = doc.folioTipo ? await pedirFolios(doc, idx) : null; // un solo viaje al servidor
  for (const pi of idx) {
    const una: PDoc = { ...doc, pages: [doc.pages[pi]] };
    const pdf = await agregarHoja(null, una, 0, folios ? folios[pi] : null, calidad(1));
    pdf.setProperties({ title: doc.name + ' · ' + doc.pages[pi].sub, creator: 'STODIA' });
    const nom = doc.pages[pi].blocks.map(b => ('isKv' in b ? b.rows.find(r => /estudiante|alumno/i.test(r.k))?.v : undefined)).find(Boolean) ?? 'pagina_' + (pi + 1);
    files[`${String(pi + 1).padStart(3, '0')}_${safe(nom)}.pdf`] = new Uint8Array(pdf.output('arraybuffer'));
  }
  if (folios) files['folios.csv'] = strToU8('﻿folio,sha256\r\n' + folios.map(f => `${f.folio},${f.hash}`).join('\r\n'));
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}
