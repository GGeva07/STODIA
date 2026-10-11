import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fmt, fmtDoc } from './fin';
import { cajaSync } from './caja';
import { nombreLegal, rncTxt, ciudadTxt, usePerfil } from './perfil';

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
/** file = nombre del PDF descargable; folioTipo (p. ej. 'BOL') = cada página lleva folio + SHA-256 + QR verificable (GET /verificar/:folio). */
export interface PDoc { kind: 'carta' | 'tirilla'; name: string; format: string; sign: string[]; pages: PPage[]; sede?: string; file?: string; folioTipo?: string; porAlumno?: boolean }

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

/**
 * docTirilla del prototipo. Si el recibo trae los datos del comprobante que fija la API (fecha, cajero, caja, sucursal, estado), la tirilla sale SOLO de ellos:
 * asi la de un recibo recien emitido y la reimpresion desde el historial son identicas. Sin ellos (Venta Rapida) usa la caja/cajero/fecha de la sesion.
 */
export function docTirilla(r: { id: string; ncf: string; tutor: string; hora: string; monto: number; items: { con: string; monto: number }[]; pays: { m: string; r?: string; amt: number }[]; change: number; abono?: boolean; saldo?: number; est?: string; nc?: string; fecha?: string; cajero?: string; caja?: string; sucursal?: string;
  tipoComprobante?: { codigo: string; nombre: string; modalidad: string }; clienteRnc?: string; clienteNombre?: string; regimenEspecial?: string; estadoDgii?: string }, cajero = '', fecha = hoyDMY()): PDoc {
  const cj = cajaSync();
  const electronico = r.tipoComprobante?.modalidad === 'ELECTRONICA';
  const caja = r.caja ?? cj.caja, sucursal = r.sucursal ?? cj.sucursal, anulado = r.est === 'Anulado';
  const items = (r.items || []).map(i => [i.con, fmt(i.monto)]);
  const tot: [string, string, boolean?][] = [
    ...(r.pays || []).map(p => [p.m + (p.r ? ' ' + p.r : ''), fmt(p.amt)] as [string, string]),
    [r.abono ? 'ABONO' : 'TOTAL', fmt(r.monto), true],
    ...(r.abono ? [['Saldo pendiente', fmt(r.saldo || 0)] as [string, string]] : []),
    ...(r.change > 0 ? [['Cambio', fmt(r.change)] as [string, string]] : []),
  ];
  return {
    kind: 'tirilla', name: 'Tirilla ' + r.id, file: 'recibo_' + r.id + '.pdf', format: 'Tirilla 80 mm', sign: [], sede: [caja, sucursal ? 'Sucursal ' + sucursal : ''].filter(Boolean).join(' · '),
    pages: [{ title: anulado ? 'Recibo ANULADO' : r.abono ? 'Recibo de abono' : 'Recibo de pago', sub: anulado && r.nc ? 'Nota de crédito ' + r.nc : '', blocks: [
      B.kv([['Recibo', r.id], [electronico ? 'e-NCF' : 'NCF', r.ncf], ...(r.tipoComprobante ? [['Comprobante', `${r.tipoComprobante.nombre} (${r.tipoComprobante.codigo}…)`] as [string, string]] : []), ['Fecha', (r.fecha ?? fecha) + ' ' + r.hora], ['Cajero', r.cajero ?? cajero], ['Tutor', r.tutor],
        ...(r.clienteRnc ? [['RNC/Cédula', fmtDoc(r.clienteRnc)] as [string, string]] : []), ...(r.clienteNombre ? [['Razón social', r.clienteNombre] as [string, string]] : []), ...(r.regimenEspecial ? [['Régimen especial', r.regimenEspecial] as [string, string]] : [])]),
      B.table(['Concepto', 'Monto'], items, ['1fr', 'auto'], ['left', 'right']),
      B.total(tot),
      ...(electronico && r.estadoDgii === 'PendienteEnvio' ? [B.text('e-NCF pendiente de envío a la DGII')] : []),
      B.text('Gracias por su pago. Conserve este comprobante.'),
    ] }],
  };
}

// ---- estado global mínimo (doc abierto + botón ocupado) ----
// El estado y el root viven en globalThis: si el módulo se vuelve a evaluar (HMR en desarrollo mientras se edita este archivo) la copia nueva reutiliza el MISMO
// store y el MISMO root de #print-root; antes cada evaluación reiniciaba `st`/`root` y hacía un createRoot() duplicado sobre el contenedor ya existente.
type St = { busy: string | null; doc: PDoc | null };
const G = globalThis as unknown as { __stodiaPrint?: { st: St; subs: Set<() => void>; root: Root | null } };
const S = (G.__stodiaPrint ??= { st: { busy: null, doc: null }, subs: new Set(), root: null });
const set = (p: Partial<St>) => { S.st = { ...S.st, ...p }; S.subs.forEach(f => f()); };
const sub = (f: () => void) => { S.subs.add(f); return () => { S.subs.delete(f); }; };
const getSt = () => S.st;

/** Si el visor lanza al renderizar, React desmonta todo el root y las siguientes impresiones fallan en silencio hasta recargar: este límite lo evita y muestra el error. */
class HostBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('[print] no se pudo renderizar el documento', err); }
  render() {
    if (!this.state.err) return this.props.children;
    const cerrar = () => { this.setState({ err: null }); closePrint(); };
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 120, display: 'grid', placeItems: 'center' }}>
        <div role="alert" style={{ background: '#fff', borderRadius: 8, padding: 20, maxWidth: 420, fontSize: 13 }}>
          <b>No se pudo generar la vista previa de impresión.</b>
          <div style={{ color: '#64748B', margin: '8px 0 14px' }}>{this.state.err.message}</div>
          <button onClick={cerrar} style={{ height: 34, padding: '0 14px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer' }}>Cerrar</button>
        </div>
      </div>
    );
  }
}

function ensureHost() {
  let el = document.getElementById('print-root');
  if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); S.root = null; }
  if (!S.root) S.root = createRoot(el);
  S.root.render(<HostBoundary><PrintHost /></HostBoundary>);
}
// HMR: el root ya montado sigue con el PrintHost de la versión anterior del módulo; se vuelve a renderizar con el nuevo.
if (typeof document !== 'undefined' && S.root) ensureHost();

/** Iniciales del logo del encabezado («Colegio Los Pinos, SRL» → LP): ignora el tipo de centro y la forma societaria. */
export function inicialesDe(nombre: string) {
  const ws = nombre.split(',')[0].split(/\s+/).filter(Boolean);
  const rest = ws.filter(w => !/^(colegio|escuela|instituto|liceo|centro|academia|polit[eé]cnico|fundaci[oó]n|de|del|la|el|y)$/i.test(w));
  return (rest.length ? rest : ws).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/** Muestra «Generando…» 650 ms y abre la vista previa (runPrint del prototipo). */
export function runPrint(key: string, doc: PDoc | null | undefined) {
  if (!doc || S.st.busy) return;
  ensureHost();
  set({ busy: key });
  setTimeout(() => set({ busy: null, doc }), 650);
}
export const closePrint = () => set({ doc: null });

/** Estado del botón de impresión (pbtn del prototipo): etiqueta, icono y animación. */
export function usePrintBusy() {
  const s = useSyncExternalStore(sub, getSt);
  return (key: string, label: string, icon: string) => {
    const b = s.busy === key;
    return { label: b ? 'Generando…' : label, icon: b ? 'ph ph-circle-notch' : icon, spin: b ? 'spin 0.8s linear infinite' : 'none' };
  };
}

/** Una hoja del documento (vista previa y origen del PDF). bare = sin sombra y, en Carta, sin margen de 1in (el PDF lo pone al paginar). */
export function Paper({ doc, pi, bare }: { doc: PDoc; pi: number; bare?: boolean }) {
  const perfil = usePerfil();
  const legal = nombreLegal(perfil).toUpperCase(), rnc = rncTxt(perfil), ciudad = ciudadTxt(perfil);
  const iniciales = inicialesDe(perfil?.nombre ?? '');
  const carta = doc.kind === 'carta';
  const pg = doc.pages[pi];
  return (
    <div className={'paper ' + doc.kind} data-pdf-page style={{
      background: '#FFFFFF', color: '#000000', boxSizing: 'border-box', width: carta ? (bare ? '6.5in' : '8.5in') : '80mm', padding: carta ? (bare ? 0 : '1in') : '5mm',
      boxShadow: bare ? 'none' : '0 8px 24px rgba(15,23,42,0.2)', flex: 'none', fontFamily: carta ? 'Inter,system-ui,sans-serif' : MONO, fontSize: carta ? 12 : 11, lineHeight: 1.45,
      pageBreakAfter: pi < doc.pages.length - 1 ? 'always' : 'auto',
    }}>
      {carta && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '2px solid #000000', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/brand/stodia-mark.svg" alt="" style={{ height: 44, width: "auto" }} /><div style={{ lineHeight: 1.25 }}><img src="/brand/stodia-wordmark.svg" alt="STODIA" style={{ height: 22, width: "auto", display: "block" }} /><div style={{ fontSize: 10 }}>Sistema Escolar Integral</div></div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'right' }}><div style={{ lineHeight: 1.25 }}><div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>{legal}</div><div style={{ fontSize: 10 }}>{rnc ? 'RNC ' + rnc : ''}{ciudad ? ' · ' + ciudad : ''}</div></div><div style={{ width: 44, height: 44, border: '2px solid #000000', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15 }}>{iniciales}</div></div>
        </div>
      )}
      {!carta && (
        <div style={{ textAlign: 'center', lineHeight: 1.35, paddingBottom: 6, borderBottom: '1px dashed #000000', marginBottom: 8 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{legal}</div><div>{rnc ? 'RNC ' + rnc : ''}</div><div>{doc.sede}</div></div>
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
        <div className="prow">
          <div style={{ display: 'flex', justifyContent: 'space-around', gap: 40, marginTop: 64 }}>{doc.sign.map((l, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px solid #000000', paddingTop: 4, fontSize: 11 }}>{l}</div></div>)}</div>
          <div style={{ marginTop: 18, fontSize: 9, textAlign: 'center' }}>Documento generado por STODIA · {hoyDMY()}</div>
        </div>
      )}
    </div>
  );
}

// ---- Descarga de PDF real (motor cliente html2canvas + jsPDF, cargado bajo demanda: ver pdfEngine.tsx) ----
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
export const nombreArchivo = (doc: PDoc) => doc.file ?? slug(doc.name) + '_' + new Date().toISOString().slice(0, 10) + '.pdf';

export function guardarBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Genera y descarga el PDF de un documento (sin abrir la vista previa). Devuelve el nombre del archivo. */
export async function descargarPdf(doc: PDoc, opts: { porAlumno?: boolean } = {}): Promise<string> {
  const { generarPdf, generarZipPorPagina } = await import('./pdfEngine');
  if (opts.porAlumno) {
    const n = nombreArchivo(doc).replace(/\.pdf$/, '') + '.zip';
    guardarBlob(await generarZipPorPagina(doc), n);
    return n;
  }
  const n = nombreArchivo(doc);
  guardarBlob(await generarPdf(doc), n);
  return n;
}

function PrintHost() {
  const s = useSyncExternalStore(sub, getSt);
  const doc = s.doc;
  const [pdfBusy, setPdfBusy] = useState<'pdf' | 'zip' | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!doc) return;
    setMsg(null);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closePrint(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [doc]);
  if (!doc) return null;
  const count = doc.pages.length + (doc.pages.length === 1 ? ' página' : ' páginas');
  const bajar = async (porAlumno: boolean) => {
    setPdfBusy(porAlumno ? 'zip' : 'pdf'); setMsg(null);
    try { setMsg({ t: 'Descargado · ' + await descargarPdf(doc, { porAlumno }), ok: true }); } catch (e) { setMsg({ t: e instanceof Error ? e.message : 'No se pudo generar el PDF', ok: false }); }
    setPdfBusy(null);
  };
  const btn = { height: 34, padding: '0 14px', borderRadius: 6, background: 'transparent', color: '#F8FAFC', border: '1px solid #475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } as const;
  const spin = (on: boolean) => ({ animation: on ? 'spin 0.8s linear infinite' : 'none' });
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#CBD5E1', zIndex: 120, display: 'flex', flexDirection: 'column' }}>
      <div className="no-print" style={{ flex: 'none', height: 56, background: '#0F172A', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        <i className="ph ph-printer" style={{ fontSize: 20 }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Vista previa de impresión</span>
        <span style={{ color: '#94A3B8', fontSize: 12 }}>{doc.name} · {doc.format} · {count}</span>
        {msg && <span role="status" style={{ color: msg.ok ? '#4ADE80' : '#F87171', fontSize: 12 }}>{msg.t}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={closePrint} className="hover:bg-slate-800" style={btn}>Cerrar</button>
        {doc.porAlumno && doc.pages.length > 1 && (
          <button onClick={() => bajar(true)} disabled={!!pdfBusy} className="hover:bg-slate-800" style={btn}><i className={pdfBusy === 'zip' ? 'ph ph-circle-notch' : 'ph ph-file-zip'} style={spin(pdfBusy === 'zip')} />{pdfBusy === 'zip' ? 'Generando…' : 'Un PDF por alumno (ZIP)'}</button>
        )}
        <button onClick={() => bajar(false)} disabled={!!pdfBusy} className="hover:bg-slate-800" style={btn}><i className={pdfBusy === 'pdf' ? 'ph ph-circle-notch' : 'ph ph-file-pdf'} style={spin(pdfBusy === 'pdf')} />{pdfBusy === 'pdf' ? 'Generando…' : 'Descargar PDF'}</button>
        <button onClick={() => window.print()} className="hover:bg-accent-dark" style={{ height: 34, padding: '0 16px', borderRadius: 6, background: '#2563EB', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><i className="ph ph-printer" />Imprimir</button>
      </div>
      <div className="sheet" style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        {doc.pages.map((_, pi) => <Paper key={pi} doc={doc} pi={pi} />)}
      </div>
    </div>
  );
}
