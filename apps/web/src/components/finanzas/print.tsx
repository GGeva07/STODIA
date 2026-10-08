import { useEffect, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fmt } from './fin';

/**
 * Documento imprimible del prototipo: modelo de bloques (B.kv/text/total/table), vista previa de
 * impresión (#print-root) y botón con estado «Generando…» (runPrint, 650 ms).
 * Cualquier pantalla puede usar `runPrint(key, doc)` + `usePrintBusy()`; el visor se monta solo.
 */
const MONO = "'JetBrains Mono',monospace";
export const hoyDMY = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };

export type PBlock =
  | { isKv: true; rows: { k: string; v: string }[] }
  | { isText: true; t: string; fw: string; fs: string; mt: string; tt: string }
  | { isTotal: true; rows: { k: string; v: string; fs: string; fw: string }[] }
  | { isTable: true; cols: string; head: { l: string; al: string }[]; rows: { cells: { v: string; al: string; ff: string }[] }[] };
export interface PPage { title: string; sub: string; blocks: PBlock[] }
export interface PDoc { kind: 'carta' | 'tirilla'; name: string; format: string; sign: string[]; pages: PPage[] }

export const B = {
  kv: (rows: [string, string][]): PBlock => ({ isKv: true, rows: rows.map(([k, v]) => ({ k, v })) }),
  text: (t: string, bold?: boolean): PBlock => ({ isText: true, t, fw: bold ? '700' : '400', fs: bold ? '13px' : 'inherit', mt: bold ? '16px' : '10px', tt: bold ? 'uppercase' : 'none' }),
  total: (rows: [string, string, boolean?][]): PBlock => ({ isTotal: true, rows: rows.map(([k, v, big]) => ({ k, v, fs: big ? '14px' : '12px', fw: big ? '700' : '400' })) }),
  table: (head: string[], rows: string[][], widths: string[], aligns: string[]): PBlock => ({
    isTable: true, cols: widths.join(' '),
    head: head.map((l, i) => ({ l, al: aligns[i] || 'left' })),
    rows: rows.map(r => ({ cells: r.map((v, i) => ({ v, al: aligns[i] || 'left', ff: aligns[i] === 'right' || aligns[i] === 'center' ? MONO : 'inherit' })) })),
  }),
};

/** docTirilla del prototipo. */
export function docTirilla(r: { id: string; ncf: string; tutor: string; hora: string; monto: number; items: { con: string; monto: number }[]; pays: { m: string; r?: string; amt: number }[]; change: number; abono?: boolean; saldo?: number }, cajero = 'Ana Rosario', fecha = hoyDMY()): PDoc {
  const items = (r.items || []).map(i => [i.con, fmt(i.monto)]);
  const tot: [string, string, boolean?][] = [
    ...(r.pays || []).map(p => [p.m + (p.r ? ' ' + p.r : ''), fmt(p.amt)] as [string, string]),
    [r.abono ? 'ABONO' : 'TOTAL', fmt(r.monto), true],
    ...(r.abono ? [['Saldo pendiente', fmt(r.saldo || 0)] as [string, string]] : []),
    ...(r.change > 0 ? [['Cambio', fmt(r.change)] as [string, string]] : []),
  ];
  return {
    kind: 'tirilla', name: 'Tirilla ' + r.id, format: 'Tirilla 80 mm', sign: [],
    pages: [{ title: r.abono ? 'Recibo de abono' : 'Recibo de pago', sub: '', blocks: [
      B.kv([['Recibo', r.id], ['NCF', r.ncf], ['Fecha', fecha + ' ' + r.hora], ['Cajero', cajero], ['Tutor', r.tutor]]),
      B.table(['Concepto', 'Monto'], items, ['1fr', 'auto'], ['left', 'right']),
      B.total(tot),
      B.text('Gracias por su pago. Conserve este comprobante.'),
    ] }],
  };
}

// ---- estado global mínimo (doc abierto + botón ocupado) ----
type St = { busy: string | null; doc: PDoc | null };
let st: St = { busy: null, doc: null };
const subs = new Set<() => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach(f => f()); };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
let root: Root | null = null;

function ensureHost() {
  if (root) return;
  let el = document.getElementById('print-root');
  if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
  root = createRoot(el);
  root.render(<PrintHost />);
}

/** Muestra «Generando…» 650 ms y abre la vista previa (runPrint del prototipo). */
export function runPrint(key: string, doc: PDoc | null | undefined) {
  if (!doc || st.busy) return;
  ensureHost();
  set({ busy: key });
  setTimeout(() => set({ busy: null, doc }), 650);
}
export const closePrint = () => set({ doc: null });

/** Estado del botón de impresión (pbtn del prototipo): etiqueta, icono y animación. */
export function usePrintBusy() {
  const s = useSyncExternalStore(sub, () => st);
  return (key: string, label: string, icon: string) => {
    const b = s.busy === key;
    return { label: b ? 'Generando…' : label, icon: b ? 'ph ph-circle-notch' : icon, spin: b ? 'spin 0.8s linear infinite' : 'none' };
  };
}

function PrintHost() {
  const s = useSyncExternalStore(sub, () => st);
  const doc = s.doc;
  useEffect(() => {
    if (!doc) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closePrint(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [doc]);
  if (!doc) return null;
  const carta = doc.kind === 'carta';
  const count = doc.pages.length + (doc.pages.length === 1 ? ' página' : ' páginas');
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#CBD5E1', zIndex: 120, display: 'flex', flexDirection: 'column' }}>
      <div className="no-print" style={{ flex: 'none', height: 56, background: '#0F172A', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        <i className="ph ph-printer" style={{ fontSize: 20 }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Vista previa de impresión</span>
        <span style={{ color: '#94A3B8', fontSize: 12 }}>{doc.name} · {doc.format} · {count}</span>
        <span style={{ flex: 1 }} />
        <button onClick={closePrint} className="hover:bg-slate-800" style={{ height: 34, padding: '0 14px', borderRadius: 6, background: 'transparent', color: '#F8FAFC', border: '1px solid #475569', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cerrar</button>
        <button onClick={() => window.print()} className="hover:bg-accent-dark" style={{ height: 34, padding: '0 16px', borderRadius: 6, background: '#2563EB', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><i className="ph ph-printer" />Imprimir</button>
      </div>
      <div className="sheet" style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        {doc.pages.map((pg, pi) => (
          <div key={pi} className={'paper ' + doc.kind} style={{
            background: '#FFFFFF', color: '#000000', boxSizing: 'border-box', width: carta ? '8.5in' : '80mm', padding: carta ? '1in' : '5mm',
            boxShadow: '0 8px 24px rgba(15,23,42,0.2)', flex: 'none', fontFamily: carta ? 'Inter,system-ui,sans-serif' : MONO, fontSize: carta ? 12 : 11, lineHeight: 1.45,
            pageBreakAfter: pi < doc.pages.length - 1 ? 'always' : 'auto',
          }}>
            {carta && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '2px solid #000000', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/brand/stodia-logo.svg" alt="" style={{ width: 44, height: 44 }} /><div style={{ lineHeight: 1.25 }}><div style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: 13 }}>STODIA</div><div style={{ fontSize: 10 }}>Sistema Escolar Integral</div></div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'right' }}><div style={{ lineHeight: 1.25 }}><div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>COLEGIO LOS PINOS, SRL</div><div style={{ fontSize: 10 }}>RNC 1-31-55678-2 · Santo Domingo, D.N.</div></div><div style={{ width: 44, height: 44, border: '2px solid #000000', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15 }}>LP</div></div>
              </div>
            )}
            {!carta && (
              <div style={{ textAlign: 'center', lineHeight: 1.35, paddingBottom: 6, borderBottom: '1px dashed #000000', marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 13 }}>COLEGIO LOS PINOS, SRL</div><div>RNC 1-31-55678-2</div><div>Caja 02 · Sucursal Principal</div></div>
            )}
            <div style={{ textAlign: carta ? 'left' : 'center', fontWeight: 700, fontSize: carta ? 18 : 12, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{pg.title}</div>
            <div style={{ textAlign: carta ? 'left' : 'center', fontSize: 11, marginBottom: 14 }}>{pg.sub}</div>
            {pg.blocks.map((b, bi) => {
              if ('isKv' in b) return <div key={bi} style={{ marginBottom: 12 }}>{b.rows.map((r, i) => <div key={i} className="prow" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}><span>{r.k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{r.v}</span></div>)}</div>;
              if ('isText' in b) return <div key={bi} className="prow" style={{ margin: `${b.mt} 0 8px`, textAlign: 'justify', fontWeight: b.fw, fontSize: b.fs, textTransform: b.tt as 'none' | 'uppercase', letterSpacing: '0.04em' }}>{b.t}</div>;
              if ('isTable' in b) return (
                <div key={bi} style={{ marginBottom: 12, borderTop: '1px solid #000000' }}>
                  <div className="prow" style={{ display: 'grid', gridTemplateColumns: b.cols, gap: 8, padding: '4px 0', borderBottom: '1px solid #000000', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{b.head.map((h, i) => <span key={i} style={{ textAlign: h.al as 'left' }}>{h.l}</span>)}</div>
                  {b.rows.map((tr, ri) => <div key={ri} className="prow" style={{ display: 'grid', gridTemplateColumns: b.cols, gap: 8, padding: '3px 0', borderBottom: '1px solid #999999', fontSize: 11 }}>{tr.cells.map((c, ci) => <span key={ci} style={{ textAlign: c.al as 'left', fontFamily: c.ff }}>{c.v}</span>)}</div>)}
                </div>
              );
              return <div key={bi} style={{ margin: '8px 0 12px', paddingTop: 6, borderTop: '1px solid #000000' }}>{b.rows.map((r, i) => <div key={i} className="prow" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', fontSize: r.fs, fontWeight: r.fw as '400' }}><span>{r.k}</span><span style={{ fontFamily: MONO }}>{r.v}</span></div>)}</div>;
            })}
            {doc.sign.length > 0 && (
              <>
                <div className="prow" style={{ display: 'flex', justifyContent: 'space-around', gap: 40, marginTop: 64 }}>{doc.sign.map((l, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px solid #000000', paddingTop: 4, fontSize: 11 }}>{l}</div></div>)}</div>
                <div style={{ marginTop: 18, fontSize: 9, textAlign: 'center' }}>Documento generado por STODIA · {hoyDMY()}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
