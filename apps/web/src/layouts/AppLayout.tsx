import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LicenseProvider, useLicense } from '../components/system/License';
import { UiProvider, useUi } from '../components/system/UiProvider';
import type { CfgCiclo, ConfigGlobal } from '@stodia/shared';
import { NAV, canAccess, setAccessOverride, useAccessVersion } from '../lib/access';
import { api, getConfig } from '../lib/api';
import { useSession } from '../lib/session';

const ORDEN_CICLO: Record<CfgCiclo['estado'], number> = { Activo: 0, Planificado: 1, Cerrado: 2 };
const mono = "'JetBrains Mono',monospace";

/** Marca + nombre del colegio (cabecera del prototipo). */
function Brand({ institution }: { institution: string }) {
  return (
    <div className="flex w-[268px] flex-none items-center gap-3 max-md:w-auto">
      <img src="/brand/stodia-mark.svg" alt="" className="block h-11 w-auto flex-none" />
      <div className="flex min-w-0 flex-col leading-[1.25]">
        <span className="whitespace-nowrap text-[17px] font-semibold leading-[inherit] text-[#F8FAFC]">{institution}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[14px] leading-[inherit] text-[#94A3B8]"><img src="/brand/stodia-wordmark.svg" alt="STODIA" className="block h-[18px] w-auto flex-none" /><span>· Sistema Escolar</span></span>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { user } = useSession();
  const { screenOn } = useLicense();
  useAccessVersion();
  const [ciclos, setCiclos] = useState<CfgCiclo[]>([]);
  const [ciclo, setCiclo] = useState('');
  useEffect(() => {
    if (!user) return;
    api.get<ConfigGlobal>('/config').then(c => { setCiclos(c.ciclos); setCiclo(c.ciclos.find(x => x.estado === 'Activo')?.n ?? ''); }).catch(() => undefined);
  }, [user]);
  if (!user) return null;
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => canAccess(user.rol, i[0]) && screenOn(i[0])) })).filter(g => g.items.length);
  return (
    <>
      {!collapsed && (
        <div className="px-3 pb-2 pt-3">
          <div className="mb-1 text-[11px] font-medium text-[#64748B]">Ciclo lectivo activo</div>
          <select value={ciclo} onChange={e => setCiclo(e.target.value)} className="h-8 w-full rounded-md border border-[#334155] bg-[#1E293B] px-2 text-[13px] text-[#F1F5F9]">
            {ciclos.length === 0 && <option value="">Sin ciclos configurados</option>}
            {[...ciclos].sort((a, b) => ORDEN_CICLO[a.estado] - ORDEN_CICLO[b.estado] || b.n.localeCompare(a.n)).map(c => (
              <option key={c.n} value={c.n}>{c.n.replace('–', ' – ')}{c.estado === 'Cerrado' ? ' (cerrado)' : c.estado === 'Planificado' ? ' (planificado)' : ''}</option>
            ))}
          </select>
        </div>
      )}
      <nav className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-auto p-2">
        {groups.map(g => (
          <div key={g.g} className="flex flex-col gap-0.5">
            {!collapsed && <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#64748B]">{g.g}</div>}
            {g.items.map(([id, label, icon]) => (
              <NavLink
                key={id}
                to={`/${id}`}
                title={label}
                onClick={onNavigate}
                className={({ isActive }) => `flex h-[34px] cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-[13px] font-medium hover:bg-[#1E293B] ${isActive ? 'bg-[#1E293B] text-[#F8FAFC]' : 'text-[#CBD5E1]'}`}
              >
                {({ isActive }) => (
                  <>
                    <i className={`ph ${icon} flex-none text-lg`} style={{ color: isActive ? '#60A5FA' : '#94A3B8' }} aria-hidden />
                    {!collapsed && <span className="flex-1">{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}

/** Licencia vencida: solo /licencia es operable (prototipo: allowedScreens → ['licencia']). */
function ExpiredGate() {
  const { info } = useLicense();
  const { user } = useSession();
  return (
    <div className="flex max-w-[980px] items-start gap-3.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-5">
      <i className="ph-fill ph-lock-key text-[28px] text-[#DC2626]" />
      <div className="flex flex-col gap-1.5">
        <div className="text-[15px] font-semibold text-[#991B1B]">{info?.estado === 'vencida' && info.vence ? `Licencia vencida el ${info.vence.split('-').reverse().join('/')}` : info?.estado === 'invalida' ? 'Licencia inválida' : 'Sin licencia activa'}</div>
        <div className="max-w-[560px] text-[13px] leading-normal text-[#7F1D1D]">
          El acceso operacional está bloqueado para todos los usuarios de la institución. Contacta a tu ejecutivo de cuenta de STODIA para obtener o renovar la clave de licencia.
        </div>
        {user?.rol === 'Super Admin' && <NavLink to="/licencia" className="mt-1.5 self-start rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white">Ir a Licenciamiento</NavLink>}
      </div>
    </div>
  );
}

const NOTIFS: [string, string, string, string][] = [
  ['ph-warning-circle', '#DC2626', '38 tutores pasaron a mora hoy (gracia de 5 días vencida).', '06:00 · Motor CxC'],
  ['ph-clock', '#D97706', '2 becas esperan aprobación del Director Financiero.', 'Ayer · Becas'],
  ['ph-check-circle', '#16A34A', 'Cierre de caja 01 conciliado.', 'Ayer 17:42'],
];

function SessionTimer() {
  const [end, setEnd] = useState(() => Date.now() + 15 * 60000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const touch = () => setEnd(Date.now() + 15 * 60000);
    window.addEventListener('keydown', touch); window.addEventListener('mousedown', touch);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener('keydown', touch); window.removeEventListener('mousedown', touch); clearInterval(t); };
  }, []);
  const left = Math.max(0, end - now);
  return (
    <span title="La sesión de la terminal POS expira tras 15 min de inactividad" className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
      <i className="ph ph-timer" />Sesión <span className="text-[#E2E8F0]" style={{ fontFamily: mono }}>{String(Math.floor(left / 60000)).padStart(2, '0') + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0')}</span>
    </span>
  );
}

function Shell() {
  const { user, logout } = useSession();
  const { info } = useLicense();
  const { openPalette, tanda, setTanda, save } = useUi();
  const loc = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<'' | 'notif' | 'role'>('');
  const main = useRef<HTMLElement>(null);
  const headerMenus = useRef<HTMLDivElement>(null);
  const institution = getConfig().institutionName || 'Colegio Los Pinos';

  useEffect(() => { if (user) api.get<ConfigGlobal>('/config').then(c => setAccessOverride(c.access)).catch(() => undefined); }, [user]);
  useEffect(() => { setMenu(''); setOpen(false); main.current?.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (headerMenus.current && !headerMenus.current.contains(e.target as Node)) setMenu(''); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(''); };
    window.addEventListener('mousedown', h); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); };
  }, []);

  const screenId = loc.pathname.split('/')[1];
  const grp = NAV.find(g => g.items.some(i => i[0] === screenId));
  const title = grp?.items.find(i => i[0] === screenId)?.[1];
  const ini = (user?.nombre ?? '').split(' ').map(x => x[0]).join('').slice(0, 2);

  return (
    <div className="flex h-full flex-col bg-canvas text-[14px] text-ink">
      <header className="relative z-20 flex h-[68px] flex-none items-center gap-3.5 border-b border-[#1E293B] bg-[#0F172A] px-3.5 text-[#E2E8F0]">
        <button className="text-[#CBD5E1] md:hidden" aria-label="Menú" onClick={() => setOpen(true)}><i className="ph ph-list text-2xl" /></button>
        <Brand institution={institution} />
        <label className="flex items-center gap-1.5 text-xs text-[#94A3B8] max-lg:hidden">Tanda
          <select value={tanda} onChange={e => setTanda(e.target.value)} className="h-[30px] rounded-md border border-[#334155] bg-[#1E293B] px-2 text-[13px] text-[#F1F5F9]">
            <option>Matutina</option><option>Vespertina</option><option>Extendida</option><option>Nocturna</option>
          </select>
        </label>
        <button onClick={openPalette} className="flex h-[34px] min-w-0 max-w-[520px] flex-1 cursor-text items-center gap-2 rounded-md border border-[#334155] bg-[#1E293B] px-2.5 text-[13px] text-[#94A3B8] hover:border-[#475569]" aria-label="Buscar (⌘K)">
          <i className="ph ph-magnifying-glass text-base" />
          <span className="min-w-0 flex-1 truncate text-left">Buscar alumno, tutor, factura…</span>
          <span className="rounded border border-[#475569] px-1.5 py-0.5 text-[11px] font-medium text-[#CBD5E1]" style={{ fontFamily: mono }}>⌘K</span>
        </button>
        <div className="flex-1" />
        {save.status === 'saving' && <span className="flex items-center gap-1.5 text-xs text-[#CBD5E1]"><i className="ph ph-circle-notch" style={{ animation: 'spin08 0.8s linear infinite' }} />Guardando…</span>}
        {save.status === 'saved' && <span className="flex items-center gap-1.5 text-xs text-[#86EFAC]"><i className="ph ph-check-circle" />Cambios guardados · <span style={{ fontFamily: mono }}>{save.at}</span></span>}
        {screenId === 'pos' && <SessionTimer />}
        <div ref={headerMenus} className="flex items-center gap-3.5">
          <button onClick={() => setMenu(m => (m === 'notif' ? '' : 'notif'))} title="Notificaciones" className="relative grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-md bg-transparent text-lg text-[#CBD5E1] hover:bg-[#1E293B]">
            <i className="ph ph-bell" />
            <span className="absolute right-[5px] top-[5px] grid h-4 min-w-4 place-items-center rounded-full bg-[#DC2626] px-1 text-[10px] font-semibold text-white">3</span>
          </button>
          <div className="relative">
            <button onClick={() => setMenu(m => (m === 'role' ? '' : 'role'))} className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-transparent pl-1 pr-2 text-[#E2E8F0] hover:bg-[#1E293B]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#334155] text-[11px] font-semibold text-[#F1F5F9]">{ini}</span>
              <span className="flex flex-col items-start leading-[1.2] max-sm:hidden">
                <span className="text-[13px] font-medium">{user?.nombre}</span>
                <span className="text-[11px] text-[#93C5FD]">Rol: {user?.rol}</span>
              </span>
              <i className="ph ph-caret-down text-[#94A3B8]" />
            </button>
            {menu === 'role' && (
              <div className="absolute right-0 top-[42px] z-40 w-60 rounded-lg border border-slate-200 bg-white p-1.5 text-ink shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">Sesión actual</div>
                <div className="flex h-8 items-center justify-between rounded-md bg-[#EFF6FF] px-2 text-[13px]">{user?.rol}<i className="ph ph-check text-[#2563EB]" /></div>
                <button onClick={() => { setMenu(''); logout(); navigate('/login'); }} className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-slate-100"><i className="ph ph-sign-out text-slate-500" />Cerrar sesión</button>
              </div>
            )}
            {menu === 'notif' && (
              <div className="absolute right-0 top-[42px] z-40 w-80 rounded-lg border border-slate-200 bg-white p-1.5 text-ink shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">Operación</div>
                {NOTIFS.map(([ic, c, t, w]) => (
                  <div key={t} className="flex gap-2.5 p-2">
                    <i className={`ph ${ic} text-[18px]`} style={{ color: c }} />
                    <div className="text-[13px] leading-[1.4]">{t}<div className="text-xs text-slate-500">{w}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden flex-none flex-col overflow-hidden bg-[#0F172A] text-[#CBD5E1] transition-[width] duration-150 ease-in-out md:flex" style={{ width: collapsed ? 64 : 260 }}>
          <Sidebar collapsed={collapsed} />
          <button onClick={() => setCollapsed(c => !c)} className="flex h-11 cursor-pointer items-center gap-2.5 whitespace-nowrap border-t border-[#1E293B] bg-transparent px-5 text-[13px] text-[#94A3B8] hover:text-[#F1F5F9]">
            <i className={`ph ${collapsed ? 'ph-caret-double-right' : 'ph-caret-double-left'} text-base`} />{!collapsed && <span>Colapsar</span>}
          </button>
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-[rgba(15,23,42,0.55)]" />
            <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col bg-[#0F172A] text-[#CBD5E1]" onClick={e => e.stopPropagation()}>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <main ref={main} className="no-scrollbar relative min-w-0 flex-1 overflow-auto px-6 pb-16 pt-3.5">
          {grp && title && (
            <div className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span>Inicio</span><i className="ph ph-caret-right text-[10px]" /><span>{grp.g}</span><i className="ph ph-caret-right text-[10px]" /><span className="font-medium text-ink">{title}</span>
            </div>
          )}
          {info && (info.estado === 'vencida' || info.estado === 'invalida' || info.estado === 'sin_licencia') && loc.pathname !== '/licencia' ? <ExpiredGate /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

export default function AppLayout() {
  return (
    <LicenseProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </LicenseProvider>
  );
}
