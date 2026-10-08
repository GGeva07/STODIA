/**
 * Datos centralizados de la empresa / sitio público (landing, SEO y páginas legales).
 * Los valores entre corchetes (si quedara alguno) son PLACEHOLDERS: deben reemplazarse antes de publicar.
 *
 * `url` se fija al compilar con VITE_SITE_URL (por defecto https://stodia.vercel.app, placeholder). El build reescribe el
 * dominio en index.html (canonical, og:*, JSON-LD), robots.txt y sitemap.xml. El correo también se lee de aquí
 * (vite-seo.mjs) para el JSON-LD y el <noscript> de index.html.
 */
const rawUrl = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://stodia.vercel.app';

export const SITE = {
  name: 'STODIA',
  tagline: 'Sistema de gestión escolar para colegios de República Dominicana',
  /** Dominio público (sin barra final). Placeholder documentado: https://stodia.vercel.app */
  url: rawUrl.replace(/\/+$/, ''),
  email: 'contact@synsetsolutions.com',
  phone: '829-693-2458',
  /** Marca/empresa titular pública. NO mostrar nombres de personas físicas; solo marca + RNC. */
  legalName: 'SynsetSolutions',
  /** Sitio de la marca titular. */
  brandUrl: 'https://synsetsolutions.com',
  rnc: '402-19802374',
  address: 'Santo Domingo, Distrito Nacional, República Dominicana',
  /**
   * Identidad LEGAL real del proveedor. Se usa SOLO en documentos legales (términos, privacidad, cookies, ARCO).
   * En el resto del sitio se usa la marca (legalName/brandUrl/email/phone de arriba).
   */
  legal: {
    name: 'Francisco Daniel Castro Borrome',
    tradeName: 'SynsetSolutions',
    rnc: '402-19802374',
    email: 'fcastrodev1@gmail.com',
    phone: '809-321-6900',
    address: 'Santo Domingo, Distrito Nacional, República Dominicana',
  },
  /** Fecha de última actualización de textos legales (ISO). */
  updated: '2026-10-07',
  locale: 'es-DO',
} as const;

/** URL absoluta a partir de una ruta. */
export const absUrl = (path = '/') => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

export const LEGAL_ROUTES = {
  terminos: '/terminos',
  privacidad: '/privacidad',
  cookies: '/cookies',
  arco: '/derechos-arco',
} as const;
