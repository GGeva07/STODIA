import type { Article } from './types';

/**
 * Carga automática de todos los artículos src/content/blog/<slug>.ts (cada uno exporta `article`).
 * Se excluyen index.ts, types.ts y los archivos que empiezan por `_` (borradores/pruebas).
 */
const modules = import.meta.glob<{ article?: Article }>(['./*.ts', '!./index.ts', '!./types.ts', '!./_*.ts'], { eager: true });

/** Orden: fecha de publicación descendente. */
export const ARTICLES: Article[] = Object.values(modules)
  .map(m => m.article)
  .filter((a): a is Article => !!a && !!a.slug)
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

export const CATEGORIES: Article['category'][] = ['Administración', 'Finanzas', 'Normativa', 'Tecnología', 'Padres y comunidad', 'Guías'];

export const getArticle = (slug: string | undefined): Article | undefined => ARTICLES.find(a => a.slug === slug);

/** Relacionados: los `related` declarados y, si faltan, los de la misma categoría / más recientes. */
export function related(a: Article, n = 3): Article[] {
  const out: Article[] = [];
  const add = (x?: Article) => { if (x && x.slug !== a.slug && !out.includes(x)) out.push(x); };
  a.related?.forEach(s => add(getArticle(s)));
  ARTICLES.filter(x => x.category === a.category).forEach(add);
  ARTICLES.forEach(add);
  return out.slice(0, n);
}

export const fmtDate = (iso: string, long = true): string =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' });
