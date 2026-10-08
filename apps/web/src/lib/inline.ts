/**
 * Mini-parser de texto en línea para los artículos del blog (sin dependencias y sin HTML crudo).
 * Sintaxis soportada:
 *   [[slug|texto]]        enlace interno a /blog/slug
 *   [texto](https://...)  enlace externo (solo http/https)
 *   **texto**             negrita
 * Lo demás es texto plano (React lo escapa; el build lo escapa con esc()).
 * Este archivo lo importan tanto la app como el plugin de build (vite-blog.mjs), por eso no tiene imports.
 */
export type Inline =
  | { k: 'text'; v: string }
  | { k: 'int'; slug: string; v: string }
  | { k: 'ext'; href: string; v: string }
  | { k: 'b'; v: string };

const RE = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;

export function parseInline(src: string, exists: (slug: string) => boolean = () => true): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ k: 'text', v: src.slice(last, i) });
    if (m[1] !== undefined) out.push(exists(m[1]) ? { k: 'int', slug: m[1], v: m[2] } : { k: 'text', v: m[2] });
    else if (m[4] !== undefined) out.push({ k: 'ext', href: m[4], v: m[3] });
    else out.push({ k: 'b', v: m[5] });
    last = i + m[0].length;
  }
  if (last < src.length) out.push({ k: 'text', v: src.slice(last) });
  return out;
}

/** Texto plano sin marcas (para descripciones, JSON-LD y búsqueda). */
export const plain = (src: string): string => parseInline(src).map(t => t.v).join('');

/** id de ancla: minúsculas, sin tildes, guiones. */
export const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* ---------- JSON-LD (compartido por la SPA y por el prerender del build; sin imports de runtime) ---------- */

export interface LdCtx { site: string; brand: string; brandUrl: string; image: string }
interface LdArticle {
  slug: string; title: string; description: string; date: string; updated?: string; category: string;
  keywords: string[]; faq?: { q: string; a: string }[];
}

const org = (c: LdCtx) => ({ '@type': 'Organization', name: c.brand, url: c.brandUrl });
const crumbs = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

export function articleLd(a: LdArticle, c: LdCtx): object[] {
  const url = `${c.site}/blog/${a.slug}`;
  const out: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.title,
      description: a.description,
      datePublished: a.date,
      dateModified: a.updated || a.date,
      author: org(c),
      publisher: org(c),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'es-DO',
      image: c.image,
      articleSection: a.category,
      keywords: a.keywords.join(', '),
    },
    crumbs([['Inicio', `${c.site}/`], ['Blog', `${c.site}/blog`], [a.title, url]]),
  ];
  if (a.faq?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: a.faq.map(f => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
    });
  }
  return out;
}

export function indexLd(list: LdArticle[], c: LdCtx, title: string, description: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: `${c.site}/blog`,
      inLanguage: 'es-DO',
      isPartOf: { '@type': 'Blog', name: 'Blog de STODIA', url: `${c.site}/blog`, publisher: org(c) },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: list.slice(0, 50).map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${c.site}/blog/${a.slug}`, name: a.title })),
      },
    },
    crumbs([['Inicio', `${c.site}/`], ['Blog', `${c.site}/blog`]]),
  ];
}
