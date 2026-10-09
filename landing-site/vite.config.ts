import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import seoHtml from './vite-seo.mjs';
import blogSeo from './vite-blog.mjs';
import apiDev from './vite-api.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    plugins: [react(), seoHtml(env.VITE_SITE_URL), blogSeo(env.VITE_SITE_URL), apiDev()],
    server: { port: 5174 },
  };
});
