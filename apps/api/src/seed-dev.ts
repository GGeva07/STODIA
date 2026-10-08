/** Entrada de desarrollo (`pnpm dev`): activa explícitamente la siembra demo y delega en seed.ts. */
process.env.SEED_DEMO = 'true';
void import('./seed');
