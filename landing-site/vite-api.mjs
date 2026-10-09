/**
 * Plugin de desarrollo: monta api/solicitar-demo.ts en el dev server de Vite (POST /api/solicitar-demo),
 * reutilizando la MISMA función que corre en Vercel (sin duplicar lógica). Solo `vite` (serve).
 * Las variables SMTP_*, DEMO_*, ALLOWED_ORIGINS y SMTP_DRY_RUN se leen de .env.local / .env (o del entorno).
 */
import { loadEnv } from 'vite';

const ROUTE = '/api/solicitar-demo';

export default function apiDev() {
  return {
    name: 'stodia-api-dev',
    apply: 'serve',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, ['SMTP_', 'DEMO_', 'ALLOWED_ORIGINS', 'VITE_SITE_URL']);
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path !== ROUTE) return next();
        try {
          const mod = await server.ssrLoadModule('/api/solicitar-demo.ts');
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(`[api] ${err instanceof Error ? err.message : 'error'}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
          }
          res.end(JSON.stringify({ error: 'internal', message: 'Error interno del servidor de desarrollo.' }));
        }
      });
    },
  };
}
