import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Seo from '../../components/Seo';
import ArticleCard, { CategoryChip } from '../../components/blog/ArticleCard';
import { BlockView, FaqList, ReadingProgress, Rich, ShareBar, Toc, useActiveId } from '../../components/blog/ArticleParts';
import BlogCta from '../../components/blog/BlogCta';
import BlogLayout from '../../components/blog/BlogLayout';
import { ARTICLES, fmtDate, getArticle, related } from '../../content/blog';
import { articleLd, plain, slugify } from '../../lib/inline';
import { SITE, absUrl } from '../../lib/site';

const ctx = { site: SITE.url, brand: SITE.legalName, brandUrl: SITE.brandUrl, image: absUrl('/og-image.png') };

function NotFound() {
  return (
    <BlogLayout>
      <Seo title={`Artículo no encontrado | ${SITE.name}`} description="El artículo que buscas no existe o cambió de dirección. Explora los recursos de STODIA para directores de colegios." path="/blog" noindex />
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="font-hand text-6xl font-bold text-accent-dark">404</p>
        <h1 className="font-hand mt-2 text-4xl font-bold leading-tight text-ink sm:text-5xl">No encontramos ese artículo</h1>
        <p className="mt-4 text-lg text-slate-700">Puede que la dirección esté mal escrita o que el artículo haya cambiado de lugar.</p>
        <Link to="/blog" className="btn btn-primary mt-8">Ver todos los recursos <i className="ph ph-arrow-right" aria-hidden="true" /></Link>
        {ARTICLES.length > 0 && (
          <div className="mt-14 text-left">
            <h2 className="font-hand text-3xl font-bold text-ink">Quizá te interese</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">{ARTICLES.slice(0, 2).map(a => <ArticleCard key={a.slug} a={a} headingLevel={3} />)}</div>
          </div>
        )}
      </div>
    </BlogLayout>
  );
}

export default function BlogArticle() {
  const { slug } = useParams();
  const { hash } = useLocation();
  const a = getArticle(slug);
  const body = useRef<HTMLElement>(null);

  const toc = useMemo(() => (a ? a.sections.map(s => ({ id: s.id ?? slugify(s.h2), title: s.h2 })) : []), [a]);
  const active = useActiveId(toc.map(t => t.id));

  // Al cambiar de artículo vuelve arriba; si la URL trae #ancla, baja a ella.
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) { el.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return <NotFound />;

  const path = `/blog/${a.slug}`;
  const rel = related(a, 3);
  const midAt = Math.floor((a.sections.length - 1) / 2);
  const sources = (a.sources ?? []).filter(s => /^https?:\/\//.test(s.url));

  return (
    <BlogLayout>
      <Seo
        title={`${a.title} | ${SITE.name}`.length <= 60 ? `${a.title} | ${SITE.name}` : a.title}
        description={a.description}
        path={path}
        type="article"
        published={a.date}
        modified={a.updated || a.date}
        jsonLd={articleLd(a, ctx)}
      />
      <ReadingProgress target={body} />

      <div className="mx-auto max-w-6xl px-4 pb-4 pt-8 sm:px-6 sm:pt-12">
        <nav aria-label="Migas de pan" className="blog-noprint text-sm text-slate-600">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li><Link to="/" className="underline-offset-4 hover:text-ink hover:underline">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/blog" className="underline-offset-4 hover:text-ink hover:underline">Blog</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="max-w-[60ch] truncate font-medium text-slate-800">{a.title}</li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <CategoryChip category={a.category} />
          <h1 className="font-hand mt-4 text-[2.6rem] font-bold leading-[1.02] text-ink sm:text-6xl">{a.title}</h1>
          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>Publicado el <time dateTime={a.date}>{fmtDate(a.date)}</time></span>
            {a.updated && a.updated !== a.date && <><span aria-hidden="true">·</span><span>Actualizado el <time dateTime={a.updated}>{fmtDate(a.updated)}</time></span></>}
            <span aria-hidden="true">·</span>
            <span>{a.readMinutes} min de lectura</span>
          </p>
          <p className="mt-6 rounded-2xl border-l-4 border-yellow-400 bg-yellow-50 p-5 text-lg font-medium leading-relaxed text-slate-900">
            <span className="sr-only">Resumen: </span><Rich text={a.summary} />
          </p>
        </header>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12">
        <div className="min-w-0">
          <Toc variant="mobile" items={toc} active={active} />
          <article ref={body} className="blog-prose max-w-3xl text-[17px] leading-8 text-slate-700 [&>section>*+*]:mt-5">
            {a.sections.map((s, i) => {
              const id = toc[i].id;
              return (
                <Fragment key={id}>
                  <section aria-labelledby={id} className="mt-12 first:mt-0">
                    <h2 id={id} className="font-hand text-[2.1rem] font-bold leading-[1.05] text-ink sm:text-5xl">{s.h2}</h2>
                    {s.blocks.map((b, bi) => <BlockView key={bi} b={b} />)}
                  </section>
                  {i === midAt && a.sections.length > 1 && <BlogCta variant="inline" />}
                </Fragment>
              );
            })}

            {a.faq && a.faq.length > 0 && (
              <section aria-labelledby="faq-art" className="mt-14">
                <h2 id="faq-art" className="font-hand mb-5 text-[2.1rem] font-bold leading-[1.05] text-ink sm:text-5xl">Preguntas frecuentes</h2>
                <FaqList items={a.faq} />
              </section>
            )}

            {sources.length > 0 && (
              <section aria-labelledby="fuentes" className="mt-14 rounded-2xl bg-slate-100 p-5 sm:p-6">
                <h2 id="fuentes" className="text-lg font-bold text-ink">Fuentes consultadas</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-6 text-[15px] leading-6">
                  {sources.map(s => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-dark underline underline-offset-4 break-words">{s.name}<span className="sr-only"> (se abre en una pestaña nueva)</span></a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-slate-600">Este artículo es informativo y no sustituye la asesoría legal, contable o del Ministerio de Educación (MINERD). Verifica siempre la normativa vigente.</p>
              </section>
            )}
          </article>

          <div className="mt-10 border-t border-slate-200 pt-6"><ShareBar title={plain(a.title)} /></div>
          <BlogCta variant="final" />
        </div>
        <Toc variant="desktop" items={toc} active={active} />
      </div>

      {rel.length > 0 && (
        <section aria-labelledby="relacionados" className="blog-noprint bg-slate-100 px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <h2 id="relacionados" className="font-hand text-4xl font-bold text-ink">Sigue leyendo</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rel.map(r => <ArticleCard key={r.slug} a={r} headingLevel={3} />)}</div>
          </div>
        </section>
      )}
    </BlogLayout>
  );
}
