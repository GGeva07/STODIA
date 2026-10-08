/** Documento oficial tamaño Carta (docDir/docNotif/docEstado/docContrato/docNoAdeudo del prototipo): abre la vista previa de impresión. */
import { B, runPrint, type PBlock } from '../finanzas/print';

export type Block =
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'table'; head: string[]; rows: string[][]; right?: number[]; widths?: string[]; aligns?: string[] }
  | { t: 'total'; rows: [string, string, boolean?][] }
  | { t: 'text'; s: string; bold?: boolean };
export interface Page { title: string; sub: string; blocks: Block[] }

function block(b: Block): PBlock {
  if (b.t === 'kv') return B.kv(b.rows);
  if (b.t === 'text') return B.text(b.s, b.bold);
  if (b.t === 'total') return B.total(b.rows);
  const aligns = b.aligns ?? b.head.map((_, i) => ((b.right ?? []).includes(i) ? 'right' : 'left'));
  const widths = b.widths ?? b.head.map(() => '1fr');
  return B.table(b.head, b.rows, widths, aligns);
}

/** key = botón que muestra «Generando…» (usePrintBusy); name = título del documento en la vista previa. */
export function printCarta(pages: Page[], sign: string[] = [], name = 'Documento', key = 'print') {
  runPrint(key, { kind: 'carta', name, format: 'Carta 8.5 × 11 in', sign, pages: pages.map(p => ({ title: p.title, sub: p.sub, blocks: p.blocks.map(block) })) });
}

/** Descarga CSV (UTF-8 con BOM, abre directo en Excel). */
export function downloadCsv(name: string, head: string[], rows: string[][]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
