import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Footer from '../landing/Footer';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import '../../pages/landing.css';
import '../../pages/blog/blog.css';

const link = 'rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-ink';

/** Marco común del blog: cabecera compacta, <main> y el mismo pie de la landing. Reutiliza `.landing` (tipografía, foco, botones). */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing blog-root">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className="blog-header sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur print:static print:border-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="STODIA, ir al inicio">
            <img src="/brand/stodia-mark.svg" alt="" width={26} height={48} className="h-12 w-[26px] shrink-0" />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 print:hidden">
            <Link to="/" className={`${link} hidden sm:inline-flex`}>Inicio</Link>
            <Link to="/blog" className={`${link} font-semibold !text-ink`}>Blog</Link>
            <Link to="/#demo" className="btn btn-primary !min-h-0 !px-4 !py-2 !text-sm sm:!px-5 sm:!py-2.5">Solicitar demo</Link>
          </nav>
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="outline-none">{children}</main>
      <div className="print:hidden"><Footer /></div>
    </div>
  );
}
