import type { FastifyPluginAsync } from 'fastify';

export const prefix = ''; // /health (sin prefijo de módulo)

const plugin: FastifyPluginAsync = async app => {
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
};
export default plugin;
