# STODIA Landing

Landing independiente de React/Vite. No importa código ni requiere dependencias de la app o del workspace STODIA.

## Desarrollo local

Desde esta carpeta, instala dependencias con `npm install`; luego `npm run dev`. Para compilar y previsualizar: `npm run build` y `npm run preview`.

Variables opcionales (archivo `.env.local`):

- `VITE_SITE_URL`: dominio público de esta landing, default `https://stodia.com.do` (canonical, Open Graph, blog y destinos legales).
- `VITE_APP_URL`: URL completa del login de la aplicación principal. Default: `${VITE_SITE_URL}/login`.

## Vercel

Importa el repositorio. Puedes configurar **Root Directory** como `landing-site` y Vercel usará la configuración de esta carpeta (`npm install`, `npm run build`, salida `dist`). Si dejas como raíz el repositorio, el [vercel.json](../vercel.json) instala y compila solo esta landing mediante `npm --prefix landing-site`; no instala ni compila el workspace pnpm ni `apps/web`. En cualquiera de las dos opciones, configura `VITE_SITE_URL` si el dominio público difiere del default y `VITE_APP_URL` si la app principal tiene otro host/login.
