/**
 * Datos centralizados del sitio público (landing, blog, SEO y páginas legales).
 * `url` se fija al compilar con VITE_SITE_URL (por defecto https://stodia.vercel.app). vite-seo.mjs y vite-blog.mjs
 * leen de aquí (con regex) email, legalName y brandUrl: mantenlos como cadenas simples entre comillas simples.
 */
const rawUrl = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://stodia.vercel.app';

export const SITE = {
  name: 'STODIA',
  tagline: 'Sistema de gestión escolar para colegios de República Dominicana',
  url: rawUrl.replace(/\/+$/, ''),
  email: 'contact@synsetsolutions.com',
  phone: '829-693-2458',
  /** Marca/empresa titular pública. NO mostrar nombres de personas físicas; solo marca + RNC. */
  legalName: 'SynsetSolutions',
  brandUrl: 'https://synsetsolutions.com',
  rnc: '402-19802374',
  address: 'Santo Domingo, Distrito Nacional, República Dominicana',
  /** Identidad LEGAL del proveedor: SOLO en términos, privacidad, cookies y ARCO. */
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

export const absUrl = (path = '/') => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

/** URL completa al login de la aplicación principal; sobreescribible en cada despliegue (VITE_APP_URL). */
export const APP_URL = (import.meta.env.VITE_APP_URL || `${SITE.url}/login`).replace(/\/+$/, '');

export const LEGAL_ROUTES = {
  terminos: '/terminos',
  privacidad: '/privacidad',
  cookies: '/cookies',
  arco: '/derechos-arco',
} as const;
