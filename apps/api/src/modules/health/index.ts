import type { FastifyPluginAsync } from 'fastify';
import { cfgGet } from '../../lib/sisconfig';
import { estadoInstancia, minClientVersion, version } from '../../lib/instalacion';

export const prefix = ''; // /health (sin prefijo de módulo)

/**
 * Salud + datos mínimos para que un cliente (escritorio, móvil, instalador) sepa a qué servidor se conecta:
 * versión, si ya está activado y el nombre de la institución (el mismo que muestra la pantalla de login).
 */
const plugin: FastifyPluginAsync = async app => {
  app.get('/health', async () => {
    const estado = await estadoInstancia();
    let institucion: string | undefined;
    if (estado === 'activa') { try { institucion = (await cfgGet('perfil'))?.nombre || undefined; } catch { /* sin perfil */ } }
    return { status: 'ok', time: new Date().toISOString(), version: version(), estado, minClientVersion: minClientVersion(), ...(institucion ? { institucion } : {}) };
  });
};
export default plugin;
