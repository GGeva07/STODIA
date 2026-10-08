import { useEffect } from 'react';
import { SITE, absUrl } from '../lib/site';

export const DEFAULT_TITLE = 'STODIA: software de gestión escolar para colegios de RD';
export const DEFAULT_DESC =
  'Sistema de gestión escolar para colegios de República Dominicana: inscripción, notas, asistencia, cobros, comedor y portal de tutores. En tu servidor o alojado por nosotros, tú eliges.';

function upsert(selector: string, create: () => HTMLElement, set: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  set(el);
}
const meta = (attr: 'name' | 'property', key: string, content: string) =>
  upsert(`meta[${attr}="${key}"]`, () => { const m = document.createElement('meta'); m.setAttribute(attr, key); return m; }, el => el.setAttribute('content', content));

export interface SeoProps {
  title: string;
  description: string;
  /** Ruta canónica (p. ej. "/terminos"). */
  path: string;
  image?: string;
  /** noindex para rutas privadas o de la app. */
  noindex?: boolean;
  /** Si es true conserva el JSON-LD estático de la landing (SoftwareApplication y FAQ); en otras rutas se retira. */
  landing?: boolean;
  /** og:type (por defecto "website"; los artículos del blog usan "article"). */
  type?: 'website' | 'article';
  /** Solo type="article": article:published_time / article:modified_time (ISO yyyy-mm-dd). */
  published?: string;
  modified?: string;
  /** Objetos JSON-LD adicionales (se sustituyen en cada cambio de ruta). */
  jsonLd?: object[];
}

/** Aplica title/meta/canonical/OG/Twitter sin dependencias. No renderiza nada. */
export function applySeo({ title, description, path, image, noindex, landing, type = 'website', published, modified, jsonLd }: SeoProps) {
  const url = absUrl(path === '/' ? '/' : path);
  const img = image ?? absUrl('/og-image.png');
  document.title = title;
  meta('name', 'description', description);
  meta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large');
  upsert('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, el => el.setAttribute('href', url));
  upsert('link[rel="alternate"][hreflang="es-DO"]', () => { const l = document.createElement('link'); l.rel = 'alternate'; l.setAttribute('hreflang', 'es-DO'); return l; }, el => el.setAttribute('href', url));
  document.head.querySelector('link[rel="alternate"][hreflang="x-default"]')?.setAttribute('href', url);
  meta('property', 'og:type', type);
  meta('property', 'og:site_name', SITE.name);
  meta('property', 'og:locale', 'es_DO');
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', url);
  meta('property', 'og:image', img);
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  meta('name', 'twitter:image', img);
  // article:* solo en artículos; en el resto se retiran para no arrastrarlos entre rutas.
  document.head.querySelectorAll('meta[property^="article:"]').forEach(n => n.remove());
  if (type === 'article') {
    if (published) meta('property', 'article:published_time', published);
    if (modified) meta('property', 'article:modified_time', modified);
    meta('property', 'article:publisher', SITE.brandUrl);
  }
  // JSON-LD extra (data-seo-ld): sustituye al de la ruta anterior y al prerenderizado en el build.
  document.head.querySelectorAll('script[data-seo-ld]').forEach(n => n.remove());
  for (const obj of jsonLd ?? []) {
    const sc = document.createElement('script');
    sc.type = 'application/ld+json';
    sc.setAttribute('data-seo-ld', '');
    sc.textContent = JSON.stringify(obj);
    document.head.appendChild(sc);
  }
  // JSON-LD de producto/FAQ solo describe la landing; en el resto de rutas públicas no aplica.
  if (!landing) document.head.querySelectorAll('#ld-app, #ld-faq').forEach(n => n.remove());
}

export default function Seo(props: SeoProps) {
  const { title, description, path, image, noindex, landing, type, published, modified, jsonLd } = props;
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    applySeo({ title, description, path, image, noindex, landing, type, published, modified, jsonLd: ld ? JSON.parse(ld) : undefined });
  }, [title, description, path, image, noindex, landing, type, published, modified, ld]);
  return null;
}
