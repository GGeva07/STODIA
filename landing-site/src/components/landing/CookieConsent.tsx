import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_ROUTES } from '../../lib/site';

export const CONSENT_KEY = 'stodia.cookie-consent';
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = 'stodia:cookie-consent';
const OPEN_EVENT = 'stodia:open-cookie-preferences';
const OPEN_EVENT_LEGACY = 'stodia:cookie-prefs';
export interface Consent { v: number; date: string; analytics: boolean; marketing: boolean }

export function getConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return c && c.v === CONSENT_VERSION ? c : null;
  } catch { return null; }
}
function saveConsent(analytics: boolean, marketing: boolean): Consent {
  const c: Consent = { v: CONSENT_VERSION, date: new Date().toISOString(), analytics, marketing };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch { /* almacenamiento no disponible */ }
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: c }));
  return c;
}
export const openCookiePreferences = () => window.dispatchEvent(new Event(OPEN_EVENT));

function Switch({ id, checked, disabled, onChange, label, desc }: { id: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void; label: string; desc: string }) {
  return <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-3.5"><div><label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label><p id={`${id}-d`} className="mt-0.5 text-xs leading-snug text-slate-600">{desc}</p></div><button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={`${id}-d`} disabled={disabled} onClick={() => onChange?.(!checked)} className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-slate-400'} ${disabled ? 'opacity-60' : ''}`}><span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} /></button></div>;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!getConsent()) setVisible(true);
    const open = () => {
      trigger.current = document.activeElement as HTMLElement;
      const c = getConsent();
      setAnalytics(c?.analytics ?? false);
      setMarketing(c?.marketing ?? false);
      setConfig(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    window.addEventListener(OPEN_EVENT_LEGACY, open);
    return () => { window.removeEventListener(OPEN_EVENT, open); window.removeEventListener(OPEN_EVENT_LEGACY, open); };
  }, []);
  const close = useCallback(() => { setVisible(false); setConfig(false); trigger.current?.focus?.(); trigger.current = null; }, []);
  const decide = (a: boolean, m: boolean) => { saveConsent(a, m); close(); };
  useEffect(() => {
    if (!visible) return;
    const el = root.current;
    if (config) el?.querySelector<HTMLElement>('[data-cc-title]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && getConsent()) close();
      if (e.key === 'Tab' && config && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, config, close]);
  if (!visible) return null;
  const equal = 'btn !min-h-[44px] !px-5 !py-2.5 !text-sm bg-ink text-white hover:bg-slate-800 flex-1 sm:flex-none';
  return <div ref={root} className="cc-root fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-5" role="dialog" aria-modal={config} aria-labelledby="cc-title" aria-describedby="cc-desc"><div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/25 sm:p-6">
    <h2 id="cc-title" data-cc-title tabIndex={-1} className="text-base font-bold text-ink outline-none"><i className="ph-fill ph-cookie mr-1.5 text-amber-600" aria-hidden="true" />Tu privacidad</h2>
    <p id="cc-desc" className="mt-1.5 text-sm leading-relaxed text-slate-700">Usamos cookies esenciales para que el sitio funcione. Las de analítica y marketing son opcionales y están desactivadas hasta que las aceptes. Hoy esta página no carga ninguna herramienta de terceros. Más información en la <Link to={LEGAL_ROUTES.cookies} className="font-semibold text-accent underline underline-offset-2">política de cookies</Link>.</p>
    {config && <div className="mt-4 space-y-2.5"><Switch id="cc-ess" checked disabled label="Esenciales" desc="Necesarias para la seguridad, la sesión y recordar esta preferencia. Siempre activas." /><Switch id="cc-ana" checked={analytics} onChange={setAnalytics} label="Analítica" desc="Medir de forma agregada cómo se usa el sitio para mejorarlo. Actualmente no hay ninguna activa." /><Switch id="cc-mkt" checked={marketing} onChange={setMarketing} label="Marketing" desc="Personalizar y medir campañas. Actualmente no hay ninguna activa." /></div>}
    <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center"><button type="button" className={equal} onClick={() => decide(true, true)}>Aceptar todo</button><button type="button" className={equal} onClick={() => decide(false, false)}>Rechazar no esenciales</button>{config ? <button type="button" className="btn btn-ghost !min-h-[44px] !px-5 !py-2.5 !text-sm sm:ml-auto" onClick={() => decide(analytics, marketing)}>Guardar selección</button> : <button type="button" className="btn btn-ghost !min-h-[44px] !px-5 !py-2.5 !text-sm sm:ml-auto" onClick={() => { trigger.current = document.activeElement as HTMLElement; setConfig(true); }}>Configurar</button>}</div>
  </div></div>;
}
