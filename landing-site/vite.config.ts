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
        .replace(/__SITE_URL__/g, siteUrl.replace(/\/+$/, ''))
        .replace(/__SITE_EMAIL__/g, SITE_EMAIL)
        .replace(/__BRAND_URL__/g, BRAND_URL);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  return {
    plugins: [react(), landingMetadata(siteUrl)],
    server: { port: 5174 },
  };
});
