import { LEGAL_ROUTES } from './site';

export const BLOG_PATH = '/blog';

/** Rutas públicas del sitio: landing, blog y páginas legales. */
export const PUBLIC_PATHS: string[] = ['/', BLOG_PATH, ...Object.values(LEGAL_ROUTES)];

export function isPublicPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.includes(p) || p.startsWith(`${BLOG_PATH}/`);
}
