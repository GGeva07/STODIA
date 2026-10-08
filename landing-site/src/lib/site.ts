const rawUrl = import.meta.env.VITE_SITE_URL || 'https://stodia.com.do';

export const SITE = {
  name: 'STODIA',
  tagline: 'Sistema de gestión escolar para colegios de República Dominicana',
  url: rawUrl.replace(/\/+$/, ''),
  email: 'contact@synsetsolutions.com',
  phone: '829-693-2458',
  legalName: 'SynsetSolutions',
  brandUrl: 'https://synsetsolutions.com',
  rnc: '402-19802374',
  address: 'Santo Domingo, Distrito Nacional, República Dominicana',
} as const;

/** Enlace al sitio original para blog y documentos legales. */
export const absUrl = (path = '/') => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

/** URL completa al login de la aplicación principal; sobreescribible en cada despliegue. */
export const APP_URL = (import.meta.env.VITE_APP_URL || `${SITE.url}/login`).replace(/\/+$/, '');

export const LEGAL_ROUTES = {
  terminos: '/terminos',
  privacidad: '/privacidad',
  cookies: '/cookies',
  arco: '/derechos-arco',
} as const;
