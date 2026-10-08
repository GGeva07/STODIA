import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_SITE_URL = 'https://stodia.com.do';
const SITE_EMAIL = 'contact@synsetsolutions.com';
const BRAND_URL = 'https://synsetsolutions.com';

function landingMetadata(siteUrl: string): Plugin {
  return {
    name: 'landing-metadata',
    transformIndexHtml(html) {
      return html
        .replaceAll('__SITE_URL__', siteUrl.replace(/\/+$/, ''))
        .replaceAll('__SITE_EMAIL__', SITE_EMAIL)
        .replaceAll('__BRAND_URL__', BRAND_URL);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  return {
    plugins: [react(), landingMetadata(siteUrl)],
    server: { port: 5174 },
  };
});
