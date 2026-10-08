import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (isProd && (!s || s.startsWith('change-me') || s.startsWith('dev-only') || s.length < 16)) {
    throw new Error('JWT_SECRET debe definirse (>=16 caracteres, no el de ejemplo) en producción');
  }
  return s || 'dev-only-secret-change-me';
}

/** Orígenes que usa la app móvil (Capacitor Android/iOS); siempre permitidos si hay lista explícita. */
const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

/**
 * CORS: dev = cualquier origen. Producción = solo CORS_ORIGIN (lista separada por comas) + orígenes de la app móvil.
 * Sin CORS_ORIGIN en producción queda solo lo móvil (la web por el mismo origen / proxy /api no necesita CORS).
 */
function corsOrigin(): boolean | string[] {
  const list = (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (list.includes('*')) {
    if (isProd) throw new Error("CORS_ORIGIN='*' no está permitido en producción: indica el origen de la web (p. ej. http://192.168.1.10:8080)");
    return true;
  }
  if (!isProd && !list.length) return true;
  return [...new Set([...list, ...MOBILE_ORIGINS])];
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: jwtSecret(),
  /** true SOLO con SEED_DEMO=true explícito (dev lo activa en .env y scripts). Sin él: instalación real, sin cuentas demo. */
  seedDemo: process.env.SEED_DEMO === 'true',
  /** Contraseña inicial de los usuarios demo (solo SEED_DEMO=true). */
  seedPassword: process.env.SEED_PASSWORD || (isProd ? '' : 'stodia123'),
  corsOrigin: corsOrigin(),
};
