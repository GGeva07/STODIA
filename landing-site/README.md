# STODIA Landing

Landing independiente de React/Vite. No importa código ni requiere dependencias de la app o del workspace STODIA.

## Desarrollo local

Desde esta carpeta, instala dependencias con `npm install`; luego `npm run dev`. Para compilar y previsualizar: `npm run build` y `npm run preview`.

Variables opcionales (archivo `.env.local`):

- `VITE_SITE_URL`: dominio público de esta landing, default `https://stodia.com.do` (canonical, Open Graph, blog y destinos legales).
- `VITE_APP_URL`: URL completa del login de la aplicación principal. Default: `${VITE_SITE_URL}/login`.

## Vercel

Importa el repositorio y configura **Root Directory** como `landing-site`. Para evitar que Vercel use el lockfile pnpm del monorepo, fija **Install Command** a `npm install`; usa **Build Command** `npm run build` y directorio de salida `dist`. No se necesita instalar ni compilar el workspace padre o `apps/web`. Configura `VITE_SITE_URL` si el dominio público difiere del default y `VITE_APP_URL` si la app principal tiene otro host/login.
