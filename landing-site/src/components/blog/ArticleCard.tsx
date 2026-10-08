import { Link } from 'react-router-dom';
import type { Article } from '../../content/blog/types';
import { fmtDate } from '../../content/blog';
import { plain } from '../../lib/inline';

/** Tonos [fondo, texto] por categoría (contraste AA). */
const TONE: Record<Article['category'], [string, string]> = {
  'Administración': ['#DBEAFE', '#1E40AF'],
  'Finanzas': ['#CCFBF1', '#115E59'],
  'Normativa': ['#FEF3C7', '#92400E'],
  'Tecnología': ['#EDE9FE', '#5B21B6'],
  'Padres y comunidad': ['#FFE4E6', '#9F1239'],
  'Guías': ['#DCFCE7', '#166534'],
};

export function CategoryChip({ category }: { category: Article['category'] }) {
  const [bg, fg] = TONE[category] ?? ['#E2E8F0', '#1E293B'];
  return <span className="inline-block rounded-full px-3 py-1 text-xs font-bold" style={{ background: bg, color: fg }}>{category}</span>;
}

export function Meta({ a, className = '' }: { a: Article; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-sm text-slate-600 ${className}`}>
      <time dateTime={a.date}>{fmtDate(a.date)}</time>
      <span aria-hidden="true">·</span>
      <span>{a.readMinutes} min de lectura</span>
    </p>
  );
}

/** Tarjeta de artículo: el título es el enlace y se extiende a toda la tarjeta (un solo foco por tarjeta). */
export default function ArticleCard({ a, featured = false, headingLevel = 2 }: { a: Article; featured?: boolean; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <article className={`group relative flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-within:ring-2 focus-within:ring-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${featured ? 'sm:p-10' : ''}`}>
      <div><CategoryChip category={a.category} /></div>
      <H className={`font-hand mt-4 font-bold leading-[1.05] text-ink ${featured ? 'text-4xl sm:text-5xl' : 'text-3xl'}`}>
        <Link to={`/blog/${a.slug}`} className="after:absolute after:inset-0 after:rounded-3xl focus-visible:!outline-none group-hover:text-accent-dark">{a.title}</Link>
      </H>
      <p className={`mt-3 text-slate-700 ${featured ? 'text-lg leading-relaxed' : 'line-clamp-3 leading-relaxed'}`}>{plain(a.summary)}</p>
      <Meta a={a} className="mt-auto pt-5" />
    </article>
  );
}
