import { Link } from 'react-router-dom';
import { LEGAL_ROUTES, SITE } from '../../lib/site';
import { openCookiePreferences } from './CookieConsent';

const col = 'text-sm text-slate-300 transition hover:text-white';

export default function Footer() {
  return (
    <footer className="on-dark relative -mt-px bg-[#0A1020] px-4 pb-8 pt-16 text-slate-300 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="STODIA, ir al inicio">
            <img src="/brand/stodia-logo.svg" alt="" width={36} height={36} className="h-9 w-9" loading="lazy" />
            <span className="text-lg font-extrabold tracking-[0.16em] text-white">STODIA</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed">{SITE.tagline}. Una instancia por colegio, autoalojada o gestionada.</p>
        </div>

        <nav aria-label="Producto">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Producto</h2>
          <ul className="mt-4 space-y-2.5">
            <li><a className={col} href="/#modulos">Módulos</a></li>
            <li><a className={col} href="/#beneficios">Beneficios</a></li>
            <li><a className={col} href="/#comunidad">Comunidad</a></li>
            <li><Link className={col} to="/login">Iniciar sesión</Link></li>
          </ul>
        </nav>

        <nav aria-label="Recursos">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Recursos</h2>
          <ul className="mt-4 space-y-2.5">
            <li><Link className={col} to="/blog">Blog para directores</Link></li>
            <li><a className={col} href="/#faq">Preguntas frecuentes</a></li>
            <li><a className={col} href="/#demo">Solicitar una demo</a></li>
            <li><Link className={col} to={LEGAL_ROUTES.arco}>Derechos ARCO (Ley 172-13)</Link></li>
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Legal</h2>
          <ul className="mt-4 space-y-2.5">
            <li><Link className={col} to={LEGAL_ROUTES.terminos}>Términos y condiciones</Link></li>
            <li><Link className={col} to={LEGAL_ROUTES.privacidad}>Política de privacidad</Link></li>
            <li><Link className={col} to={LEGAL_ROUTES.cookies}>Política de cookies</Link></li>
            <li><button type="button" className={`${col} text-left`} onClick={openCookiePreferences}>Preferencias de cookies</button></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Contacto</h2>
          <address className="mt-4 space-y-2.5 text-sm not-italic">
            <p><a className={col} href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
            <p>{SITE.phone}</p>
            <p>{SITE.address}</p>
                      </address>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {SITE.name} · un producto de <a href={SITE.brandUrl} className="underline hover:text-white" target="_blank" rel="noopener">{SITE.legalName}</a> · RNC {SITE.rnc}</p>
        <p>Pensado para colegios de República Dominicana.</p>
      </div>
    </footer>
  );
}
