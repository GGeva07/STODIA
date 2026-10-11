import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Alumno, CobroCuenta, ScreenId } from '@stodia/shared';
import { MENU_OCULTO, NAV, canAccess, useAccessVersion } from '../../lib/access';
import { api } from '../../lib/api';
import { autorizarSupervisor } from '../../lib/supervisor';
import { useSession } from '../../lib/session';
import { useLicense } from './License';

export type Tone = 'ok' | 'bad' | 'warn' | 'info';
export interface GuardCfg {
  title: string; desc: string;
  /** Texto exacto que el usuario debe escribir para confirmar. */
  code?: string;
  /** Pide clave de supervisor (se omite para Super Admin, igual que el prototipo). El servidor valida la clave y devuelve un token de un solo uso. */
  pin?: boolean;
  label?: string;
  /** Recibe el token de supervisor (de un solo uso) cuando se pidió clave. */
  onOk: (pin?: string) => void | Promise<void>;
}
export interface CmdItem { type: string; label: string; sub: string; icon: string; mono?: boolean; go: () => void }

interface UiCtx {
  toast: (msg: string, tone?: Tone) => void;
  openGuard: (cfg: GuardCfg) => void;
  /** Registra ítems extra (alumnos, tutores, facturas…) en la paleta Ctrl/Cmd+K mientras el componente esté montado. */
  setCommands: (key: string, items: CmdItem[]) => void;
  openPalette: () => void;
  /** Tanda activa (selector de la barra superior). */
  tanda: string;
  setTanda: (t: string) => void;
  /** Indicador de guardado de la barra superior: markSaving() al editar, markSaved() al confirmar. */
  save: { status: 'idle' | 'saving' | 'saved'; at: string };
  markSaving: () => void;
  markSaved: () => void;
}
const Ctx = createContext<UiCtx | null>(null);

const TONE_ICON: Record<Tone, [string, string]> = {
  ok: ['ph-fill ph-check-circle', '#4ADE80'], bad: ['ph-fill ph-x-circle', '#F87171'],
  warn: ['ph-fill ph-warning', '#FBBF24'], info: ['ph-fill ph-info', '#60A5FA'],
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Hook principal. `const { toast, openGuard } = useUi()`. Toasts: 4 máx., 3.8 s. */
export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUi requiere <UiProvider>');
  return c;
}
export const useToast = () => useUi().toast;

/** Cascarón de modal reutilizable (overlay + tarjeta). Cierra con Esc y clic fuera si se pasa onClose. */
export function Modal({ children, onClose, width = 460, z = 80 }: { children: ReactNode; onClose?: () => void; width?: number; z?: number }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 grid place-items-center bg-[rgba(15,23,42,0.55)] p-5" style={{ zIndex: z }} onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" className="max-w-full overflow-hidden rounded-[10px] bg-white shadow-[0_24px_48px_rgba(15,23,42,0.3)]" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

function Guard({ cfg, onClose }: { cfg: GuardCfg; onClose: () => void }) {
  const { user } = useSession();
  const needPin = !!cfg.pin && user?.rol !== 'Super Admin';
  const [text, setText] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const ready = (!cfg.code || text === cfg.code) && (!needPin || pin.length >= 4);
  const ok = async () => {
    if (cfg.code && text !== cfg.code) return setErr('El texto no coincide exactamente.');
    let token: string | undefined;
    if (needPin) {
      try { token = await autorizarSupervisor(pin); } catch (e) { return setErr(e instanceof Error ? e.message : 'Clave de supervisor inválida. Intento registrado en auditoría.'); }
    }
    await cfg.onOk(token);
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start gap-3 p-5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-bad-bg text-xl text-[#DC2626]"><i className="ph ph-shield-warning" /></span>
        <div>
          <div className="text-base font-semibold">{cfg.title}</div>
          <div className="mt-1 text-[13px] leading-normal text-slate-600">{cfg.desc}</div>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-4">
        {cfg.code && (
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            <span>Escribe <span className="self-start rounded bg-bad-bg px-1.5 py-px font-mono text-xs font-semibold text-bad-fg">{cfg.code}</span> para confirmar</span>
            <input value={text} autoFocus onChange={e => { setText(e.target.value.toUpperCase()); setErr(''); }} className={`h-[38px] rounded-md border px-2.5 font-mono text-sm text-ink outline-none ${text && text !== cfg.code ? 'border-[#FCA5A5]' : 'border-slate-300'}`} />
          </label>
        )}
        {needPin && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-warn-bg p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E]"><i className="ph ph-hourglass-medium" />Pending Supervisor Override</div>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#78350F]">Clave de supervisor (Super Admin / Director Financiero)
              <input type="password" value={pin} placeholder="••••" onChange={e => { setPin(e.target.value); setErr(''); }} className="h-[38px] rounded-md border border-[#FCD34D] bg-white px-2.5 font-mono text-sm text-ink outline-none" />
            </label>
            {import.meta.env.DEV && <span className="text-[11px] text-[#92400E]">Demo: clave 1234</span>}
          </div>
        )}
        {err && <div className="text-xs font-medium text-[#DC2626]">{err}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <button onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium">Cancelar</button>
        <button onClick={ok} disabled={!ready} className={`h-9 rounded-md px-3.5 text-[13px] font-semibold text-white ${ready ? 'cursor-pointer bg-[#DC2626]' : 'cursor-not-allowed bg-[#FCA5A5]'}`}>{cfg.label ?? 'Confirmar'}</button>
      </div>
    </Modal>
  );
}

function Palette({ items, onClose }: { items: CmdItem[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const res = useMemo(() => {
    const nq = norm(q.trim()).replace(/\s+/g, '');
    if (!nq) return items.slice(0, 9);
    return items.map(it => {
      const hay = norm(it.label + ' ' + it.sub).replace(/[\s\-·]/g, '');
      let score = 0, last = -1;
      for (const ch of nq) { const j = hay.indexOf(ch, last + 1); if (j < 0) return null; score += j - last; last = j; }
      return { it, score: score + (hay.includes(nq) ? -100 : 0) };
    }).filter((x): x is { it: CmdItem; score: number } => !!x).sort((a, b) => a.score - b.score).map(x => x.it).slice(0, 10);
  }, [q, items]);
  const run = (it: CmdItem) => { onClose(); it.go(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(res.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && res[idx]) { e.preventDefault(); run(res[idx]); }
  };
  return (
    <div onMouseDown={onClose} className="fixed inset-0 z-[95] flex items-start justify-center bg-[rgba(15,23,42,0.45)] pt-[12vh]">
      <div onMouseDown={e => e.stopPropagation()} className="w-[620px] max-w-[92vw] overflow-hidden rounded-[10px] bg-white shadow-[0_24px_48px_rgba(15,23,42,0.3)]">
        <div className="flex h-[52px] items-center gap-2.5 border-b border-slate-200 px-4">
          <i className="ph ph-magnifying-glass text-lg text-slate-500" />
          <input ref={input} value={q} onKeyDown={onKey} onChange={e => { setQ(e.target.value); setIdx(0); }} placeholder="Buscar alumno, tutor, factura o ir a…" className="flex-1 bg-transparent text-[15px] text-ink outline-none" />
          <span className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600">Esc</span>
        </div>
        <div className="max-h-[380px] overflow-auto p-1.5">
          {res.map((c, i) => (
            <div key={c.type + c.label + i} onClick={() => run(c)} onMouseEnter={() => setIdx(i)} className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 ${i === idx ? 'bg-[#EFF6FF]' : ''}`}>
              <i className={`${c.icon} text-lg text-slate-600`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.label}</div>
                <div className={`text-xs text-slate-500 ${c.mono ? 'font-mono' : ''}`}>{c.sub}</div>
              </div>
              <span className="text-[11px] font-medium text-slate-500">{c.type}</span>
            </div>
          ))}
          {!res.length && <div className="p-5 text-[13px] text-slate-500">Sin resultados para «{q}».</div>}
        </div>
        <div className="flex gap-3.5 border-t border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] text-slate-500"><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc cerrar</span></div>
      </div>
    </div>
  );
}

export function UiProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const lic = useLicense();
  const accessV = useAccessVersion();
  const nav = useNavigate();
  const loc = useLocation();
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: Tone }[]>([]);
  const [guard, setGuard] = useState<GuardCfg | null>(null);
  const [palette, setPalette] = useState(false);
  const [tanda, setTandaS] = useState('Matutina');
  const [save, setSave] = useState<{ status: 'idle' | 'saving' | 'saved'; at: string }>({ status: 'idle', at: '' });
  const [extra, setExtra] = useState<Record<string, CmdItem[]>>({});

  const toast = useCallback((msg: string, tone: Tone = 'ok') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, tone }].slice(-4));
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const openGuard = useCallback((cfg: GuardCfg) => setGuard(cfg), []);
  const setCommands = useCallback((key: string, items: CmdItem[]) => setExtra(e => ({ ...e, [key]: items })), []);
  const openPalette = useCallback(() => setPalette(true), []);
  const setTanda = useCallback((t: string) => { setTandaS(t); toast('Tanda activa: ' + t, 'info'); }, [toast]);
  const markSaving = useCallback(() => setSave(s => ({ ...s, status: 'saving' })), []);
  const markSaved = useCallback(() => setSave({ status: 'saved', at: new Date().toLocaleTimeString('es-DO', { hour12: false }) }), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const items = useMemo<CmdItem[]>(() => {
    if (!user) return [];
    const routes = NAV.flatMap(g => g.items.filter(([id]) => !MENU_OCULTO.has(id) && canAccess(user.rol, id) && lic.screenOn(id)).map(([id, label, icon]): CmdItem => ({ type: 'Ruta', label, sub: g.g, icon: 'ph ' + icon, go: () => nav('/' + id) })));
    return routes.concat(Object.values(extra).flat());
  }, [user, lic, nav, extra, accessV]);

  useEffect(() => setPalette(false), [loc.pathname]);

  // Índice de la paleta (L2800-2820 del prototipo): alumnos, tutores y facturas además de las rutas.
  useEffect(() => {
    if (!user) { setExtra(e => ({ ...e, _idx: [] })); return; }
    let live = true;
    const fmtM = (n: number) => 'RD$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const goTo = (id: ScreenId, path: string) => () => (canAccess(user.rol, id) && lic.screenOn(id) ? nav(path) : toast('Tu rol no tiene acceso a esta sección', 'warn'));
    const tutores: CmdItem[] = [
      { type: 'Tutor', label: 'Carlos Mendoza Pérez', sub: '001-0023940-1 · Tutor financiero', icon: 'ph ph-user', mono: true, go: goTo('pos', '/pos') },
      { type: 'Tutor', label: 'María Fernández de Mendoza', sub: '002-0118877-2 · Tutor legal', icon: 'ph ph-user', mono: true, go: goTo('expediente', '/expediente/0412') },
    ];
    Promise.all([
      api.get<Alumno[]>('/directorio').catch(() => [] as Alumno[]),
      api.get<CobroCuenta>('/cobros/cuenta?q=carlos').catch(() => null),
    ]).then(([al, cu]) => {
      if (!live) return;
      const first = ['0412', '0587', '0433'];
      const ord = [...first.map(id => al.find(x => x.id === id)).filter((x): x is Alumno => !!x), ...al.filter(x => !first.includes(x.id))];
      const alumnos: CmdItem[] = ord.slice(0, 40).map(a => ({ type: 'Alumno', label: a.nombres + ' ' + a.apellidos, sub: a.code + ' · ' + a.grado + ' ' + a.sec, icon: 'ph ph-student', mono: true, go: goTo('expediente', '/expediente/' + a.id) }));
      const facturas: CmdItem[] = (cu?.recibos ?? []).map(r => ({ type: 'Factura', label: r.id + ' · ' + r.tutor, sub: r.ncf + ' · ' + fmtM(r.monto), icon: 'ph ph-receipt', mono: true, go: goTo('pos', '/pos') }));
      setExtra(e => ({ ...e, _idx: [...alumnos.slice(0, 3), ...tutores, ...alumnos.slice(3), ...facturas] }));
    });
    return () => { live = false; };
  }, [user, lic, nav, toast]);

  const value = useMemo(() => ({ toast, openGuard, setCommands, openPalette, tanda, setTanda, save, markSaving, markSaved }), [toast, openGuard, setCommands, openPalette, tanda, setTanda, save, markSaving, markSaved]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {palette && <Palette items={items} onClose={() => setPalette(false)} />}
      {guard && <Guard cfg={guard} onClose={() => setGuard(null)} />}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex max-w-[400px] flex-col gap-2" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto animate-[toastIn_0.18s_ease-out] flex items-start gap-2.5 rounded-lg bg-ink px-3.5 py-3 text-[13px] leading-snug text-slate-100 shadow-[0_12px_28px_rgba(15,23,42,0.25)]">
            <i className={`${TONE_ICON[t.tone][0]} flex-none text-lg`} style={{ color: TONE_ICON[t.tone][1] }} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
