import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import ArticleCard from '../../components/blog/ArticleCard';
import BlogLayout from '../../components/blog/BlogLayout';
import { ARTICLES, CATEGORIES } from '../../content/blog';
import { indexLd } from '../../lib/inline';
import { SITE, absUrl } from '../../lib/site';

const PAGE_SIZE = 12;
export const BLOG_TITLE = 'Recursos para directores de colegios en RD';
export const BLOG_DESC = 'Guías, normativa y consejos prácticos para directores y dueños de colegios en República Dominicana: cobros, administración, tecnología y relación con las familias.';

export default function BlogIndex() {
  const [params, setParams] = useSearchParams();
  const cats = useMemo(() => CATEGORIES.filter(c => ARTICLES.some(a => a.category === c)), []);
  const cat = cats.find(c => c === params.get('categoria')) ?? null;
  const filtered = cat ? ARTICLES.filter(a => a.category === cat) : ARTICLES;

  // Destacado: el más reciente, solo en la primera página y sin filtro.
  const page0 = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);
  const hasFeatured = !cat && filtered.length > 1;
  const rest = hasFeatured ? filtered.slice(1) : filtered;
  const pages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const page = Math.min(page0, pages);
  const list = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const featured = hasFeatured && page === 1 ? filtered[0] : null;

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; window.scrollTo(0, 0); }
  }, []);

  const setCat = (c: string | null) => setParams(c ? { categoria: c } : {}, { replace: true });
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (cat) q.set('categoria', cat);
    if (n > 1) q.set('pagina', String(n));
    const s = q.toString();
    return `/blog${s ? `?${s}` : ''}`;
  };

  const chip = (on: boolean) => `inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-semibold transition ${on ? 'bg-ink text-white' : 'bg-white text-slate-800 shadow-[inset_0_0_0_1.5px_#CBD5E1] hover:shadow-[inset_0_0_0_1.5px_#0F172A]'}`;

  return (
    <BlogLayout>
      <Seo
        title={`${BLOG_TITLE} | ${SITE.name}`}
        description={BLOG_DESC}
        path="/blog"
        jsonLd={indexLd(ARTICLES, { site: SITE.url, brand: SITE.legalName, brandUrl: SITE.brandUrl, image: absUrl('/og-image.png') }, BLOG_TITLE, BLOG_DESC)}
      />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <nav aria-label="Migas de pan" className="text-sm text-slate-600">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="underline-offset-4 hover:text-ink hover:underline">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-slate-800">Blog</li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="font-hand text-5xl font-bold leading-[1.02] text-ink sm:text-7xl">Recursos para <span className="marker">directores</span></h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-700">Guías prácticas sobre cobros, administración, normativa y tecnología para dirigir un colegio en República Dominicana, escritas para quien toma las decisiones.</p>
        </header>

        {ARTICLES.length === 0 ? (
          <p className="mt-14 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-700">Estamos preparando los primeros artículos. Vuelve pronto o <Link to="/#demo" className="font-semibold text-accent-dark underline">solicita una demo</Link>.</p>
        ) : (
          <>
            {cats.length > 1 && (
              <nav aria-label="Filtrar por categoría" className="mt-10">
                <ul className="flex flex-wrap gap-2">
                  <li><button type="button" className={chip(!cat)} aria-pressed={!cat} onClick={() => setCat(null)}>Todas</button></li>
                  {cats.map(c => <li key={c}><button type="button" className={chip(cat === c)} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button></li>)}
                </ul>
              </nav>
            )}
            <p role="status" className="sr-only">{filtered.length} {filtered.length === 1 ? 'artículo' : 'artículos'}{cat ? ` en ${cat}` : ''}</p>

            {featured && (
              <section aria-label="Artículo destacado" className="mt-8">
                <ArticleCard a={featured} featured />
              </section>
            )}

            <section aria-label="Artículos" className="mt-8">
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map(a => <li key={a.slug}><ArticleCard a={a} /></li>)}
              </ul>
            </section>

            {pages > 1 && (
              <nav aria-label="Paginación" className="mt-12 flex items-center justify-center gap-3">
                {page > 1 ? <Link to={pageHref(page - 1)} className="btn btn-ghost !min-h-0 !py-2.5 !text-sm" onClick={() => window.scrollTo(0, 0)}>Anterior</Link> : <span />}
                <span className="text-sm text-slate-700" aria-current="page">Página {page} de {pages}</span>
                {page < pages ? <Link to={pageHref(page + 1)} className="btn btn-ghost !min-h-0 !py-2.5 !text-sm" onClick={() => window.scrollTo(0, 0)}>Siguiente</Link> : <span />}
              </nav>
            )}
          </>
        )}
      </div>
    </BlogLayout>
  );
}
