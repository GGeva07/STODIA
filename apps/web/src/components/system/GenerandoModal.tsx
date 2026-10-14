import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Modal de carga «Generando reporte…» (Informes · etapa 4). Reutilizable y global: un solo almacén externo (sirve también a PrintHost, que vive en otro root de React)
 * y un único <GenerandoHost /> montado en UiProvider, así nunca se apilan dos modales.
 *
 *   const r = await conGenerando({ texto: 'Exportando a Excel…', informe: 'Cuentas por cobrar', cancelable: true }, async signal => { ...await api.get(url, { signal })... });
 *   if (r.ok) usa(r.valor); else if (r.cancelado) ...; else mostrar(r.error);
 *
 * Reglas: aparece solo si la operación tarda más de MOSTRAR_TRAS (300 ms) y, una vez visible, se mantiene al menos MINIMO (500 ms) para no parpadear. Muestra el texto
 * dinámico, el nombre del informe y los segundos transcurridos. Bloquea los clics mientras dura (role="dialog" aria-modal, aria-live="polite", foco atrapado).
 * Si falla, el error se muestra dentro del mismo modal con «Cerrar» y «Reintentar» (el Reintentar vuelve a ejecutar la operación). «Cancelar» aborta la señal (AbortController).
 * Con prefers-reduced-motion la animación pasa a una versión estática.
 */
export const MOSTRAR_TRAS = 300;
export const MINIMO = 500;

export interface GenerandoOpts { texto: string; informe?: string; cancelable?: boolean }
export type GenerandoRes<T> = { ok: true; valor: T } | { ok: false; cancelado?: boolean; error?: string };

interface St { activo: boolean; visible: boolean; texto: string; informe: string; cancelable: boolean; error: string; desde: number }
const VACIO: St = { activo: false, visible: false, texto: '', informe: '', cancelable: false, error: '', desde: 0 };
const G = globalThis as unknown as { __stodiaGenerando?: { st: St; subs: Set<() => void> } };
const S = (G.__stodiaGenerando ??= { st: VACIO, subs: new Set() });
const set = (p: Partial<St>) => { S.st = { ...S.st, ...p }; S.subs.forEach(f => f()); };
const sub = (f: () => void) => { S.subs.add(f); return () => { S.subs.delete(f); }; };
const get = () => S.st;

let nivel = 0;                 // operaciones en curso (las anidadas reutilizan el mismo modal: nunca se apilan)
let ctl: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendiente: ((accion: 'cerrar' | 'reintentar') => void) | null = null;
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const esAbort = (e: unknown) => (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');

export async function conGenerando<T>(opts: GenerandoOpts, fn: (signal: AbortSignal) => Promise<T>): Promise<GenerandoRes<T>> {
  nivel++;
  const propio = nivel === 1;
  const abort = new AbortController();
  if (propio) ctl = abort;
  else ctl?.signal.addEventListener('abort', () => abort.abort());
  set({ activo: true, texto: opts.texto, informe: opts.informe ?? S.st.informe, cancelable: !!opts.cancelable, error: '', ...(propio ? { visible: false, desde: 0 } : {}) });
  if (propio) timer = setTimeout(() => { if (S.st.activo && !S.st.visible) set({ visible: true, desde: Date.now() }); }, MOSTRAR_TRAS);
  try {
    for (;;) {
      try {
        return { ok: true, valor: await fn(abort.signal) };
      } catch (e) {
        if (abort.signal.aborted || esAbort(e)) return { ok: false, cancelado: true };
        const msg = e instanceof Error ? e.message : 'No se pudo completar la operación';
        if (!propio) return { ok: false, error: msg };
        if (timer) { clearTimeout(timer); timer = null; }
        set({ visible: true, desde: S.st.desde || Date.now(), error: msg });
        const accion = await new Promise<'cerrar' | 'reintentar'>(r => { pendiente = r; });
        pendiente = null;
        if (accion === 'cerrar') return { ok: false, error: msg };
        set({ error: '', desde: Date.now() });
      }
    }
  } finally {
    nivel--;
    if (nivel === 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      ctl = null;
      if (S.st.visible) { const falta = MINIMO - (Date.now() - S.st.desde); if (falta > 0) await esperar(falta); }
      if (nivel === 0) set({ ...VACIO });
    }
  }
}

/** Hook de comodidad: la misma función, para usarla desde componentes. */
export const useGenerando = () => conGenerando;

const css = `
.gen-bar{position:relative;height:6px;border-radius:999px;background:#E2E8F0;overflow:hidden}
.gen-bar::after{content:'';position:absolute;inset:0 auto 0 0;width:40%;border-radius:999px;background:#2563EB;animation:gen-slide 1.2s ease-in-out infinite}
.gen-dot{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#2563EB;animation:gen-bounce 1s ease-in-out infinite}
.gen-dot:nth-child(2){animation-delay:.15s}.gen-dot:nth-child(3){animation-delay:.3s}
.gen-spin{width:22px;height:22px;border-radius:50%;border:3px solid #BFDBFE;border-top-color:#2563EB;animation:spin .8s linear infinite}
@keyframes gen-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@keyframes gen-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-5px);opacity:1}}
@media (prefers-reduced-motion: reduce){.gen-bar::after{animation:none;width:55%}.gen-dot{animation:none;opacity:.8}.gen-spin{animation:none;border-top-color:#BFDBFE;border-right-color:#2563EB}}
`;

/** Una sola instancia, montada en UiProvider. z-index 130: por encima del visor de impresión (#print-root, 120) y de los modales (80–95). */
export function GenerandoHost() {
  const s = useSyncExternalStore(sub, get);
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);
  const seg = useRef<HTMLSpanElement>(null);
  const visible = s.visible;

  useEffect(() => {
    if (!visible) return;
    previo.current = document.activeElement;
    (caja.current?.querySelector<HTMLElement>('button') ?? caja.current)?.focus();
    return () => { (previo.current as HTMLElement | null)?.focus?.(); };
  }, [visible]);

  // Segundos transcurridos (se actualiza sin re-render del árbol).
  useEffect(() => {
    if (!visible || s.error) return;
    const t = setInterval(() => { if (seg.current) seg.current.textContent = String(Math.max(0, Math.floor((Date.now() - get().desde) / 1000))); }, 500);
    return () => clearInterval(t);
  }, [visible, s.error, s.desde]);

  useEffect(() => {
    if (!visible) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (get().error) pendiente?.('cerrar'); else if (get().cancelable) ctl?.abort(); return; }
      if (e.key !== 'Tab' || !caja.current) return;
      const f = [...caja.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!f.length) { e.preventDefault(); caja.current.focus(); return; }
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1)].focus();
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [visible]);

  if (!visible) return null;
  const titulo = s.error ? 'No se pudo completar' : s.texto;
  const btn = 'inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-ink hover:bg-slate-100';
  const btnP = 'inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-dark';
  return (
    <div className="fixed inset-0 grid place-items-center bg-[rgba(15,23,42,0.55)] p-5" style={{ zIndex: 130 }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <style>{css}</style>
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby="gen-titulo" aria-describedby="gen-desc" tabIndex={-1} className="w-[380px] max-w-full rounded-[10px] bg-white p-5 shadow-[0_24px_48px_rgba(15,23,42,0.3)] outline-none">
        <div className="flex items-center gap-3">
          {s.error ? <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-bad-bg text-xl text-[#DC2626]"><i className="ph ph-warning-circle" /></span> : <span className="gen-spin flex-none" aria-hidden="true" />}
          <div className="min-w-0" aria-live="polite" role="status">
            <div id="gen-titulo" className="text-[15px] font-semibold">{titulo}{!s.error && <span aria-hidden="true" className="ml-1.5 align-middle"><i className="gen-dot" /><i className="gen-dot" /><i className="gen-dot" /></span>}</div>
            <div id="gen-desc" className="mt-0.5 break-words text-[13px] text-slate-600">
              {s.error ? s.error : <>{s.informe ? <span className="font-medium text-slate-700">{s.informe}</span> : null}{s.informe ? ' · ' : ''}Esto puede tardar unos segundos · <span ref={seg}>0</span> s</>}
            </div>
          </div>
        </div>
        {!s.error && <div className="gen-bar mt-4" aria-hidden="true" />}
        <div className="mt-4 flex justify-end gap-2">
          {s.error ? (
            <>
              <button type="button" className={btn} onClick={() => pendiente?.('cerrar')}>Cerrar</button>
              <button type="button" className={btnP} onClick={() => pendiente?.('reintentar')}><i className="ph ph-arrow-clockwise" />Reintentar</button>
            </>
          ) : s.cancelable ? <button type="button" className={btn} onClick={() => ctl?.abort()}>Cancelar</button> : null}
        </div>
      </div>
    </div>
  );
}
