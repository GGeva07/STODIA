import { LEGAL_ROUTES } from './site';

/** Blog / centro de recursos: `/blog` y `/blog/:slug` (públicos, indexables). */
export const BLOG_PATH = '/blog';

/** Rutas públicas (sin sesión): landing, blog y páginas legales. */
export const PUBLIC_PATHS: string[] = ['/', BLOG_PATH, ...Object.values(LEGAL_ROUTES)];

/**
 * ¿La web corre como "app" (Capacitor, PWA instalada o Electron)? En ese caso `/` va directo al login/inicio
 * y no se muestra la landing de marketing.
 */
export function isAppShell(): boolean {
  try {
    const ua = navigator.userAgent;
    return /Electron\//i.test(ua) || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches;
  } catch {
    return false;
  }
}

export function isPublicPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.includes(p) || p === BLOG_PATH || p.startsWith(`${BLOG_PATH}/`);
}
