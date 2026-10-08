import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_URL } from '../../lib/site';
import { NAV_LINKS } from './data';

export default function Header({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('a,button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('a,button') ?? []);
      const all = btn.current ? [btn.current, ...items] : items;
      const idx = all.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); all[all.length - 1]?.focus(); }
      else if (!e.shiftKey && idx === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const close = () => setOpen(false);
  const linkCls = 'rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-ink';
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled || open ? 'border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md' : 'border-b border-transparent bg-transparent'}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6 ${scrolled ? 'h-14' : 'h-[68px]'}`}>
        <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="STODIA, ir al inicio" onClick={close}>
          <img src="/brand/stodia-logo.svg" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-lg font-extrabold tracking-[0.16em] text-ink">STODIA</span>
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(l => <a key={l.href} href={l.href} className={linkCls}>{l.label}</a>)}
          <Link to="/blog" className={linkCls}>Blog</Link>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a href={APP_URL} className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-100">Iniciar sesión</a>
          <a href="#demo" className="btn btn-primary !min-h-0 !px-5 !py-2.5 !text-sm">Solicitar demo</a>
        </div>
        <button ref={btn} type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-slate-100 lg:hidden" aria-expanded={open} aria-controls="menu-movil" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(o => !o)}>
          <i className={`ph ${open ? 'ph-x' : 'ph-list'} text-2xl`} aria-hidden="true" />
        </button>
      </div>
      <div id="menu-movil" ref={menu} hidden={!open} className="border-t border-slate-200 bg-white px-4 pb-5 pt-3 lg:hidden">
        <nav aria-label="Principal (móvil)" className="flex flex-col">
          {NAV_LINKS.map(l => <a key={l.href} href={l.href} onClick={close} className="rounded-xl px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">{l.label}</a>)}
          <Link to="/blog" onClick={close} className="rounded-xl px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Blog</Link>
        </nav>
        <div className="mt-3 grid gap-2">
          <a href={APP_URL} onClick={close} className="btn btn-ghost">Iniciar sesión</a>
          <a href="#demo" onClick={close} className="btn btn-primary">Solicitar demo</a>
        </div>
      </div>
    </header>
  );
}
