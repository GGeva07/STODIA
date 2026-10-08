import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Registra automáticamente cada carpeta de src/modules/<nombre>/index.ts.
 * Contrato del módulo:
 *   export default async function (app) { app.get('/', ...) }   // FastifyPluginAsync
 *   export const prefix = '/otro'   // opcional; por defecto '/<nombre>'
 */
export async function registerModules(app: FastifyInstance) {
  const dir = path.join(__dirname, '..', 'modules');
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of names) {
    if (!['index.ts', 'index.js'].some(f => fs.existsSync(path.join(dir, name, f)))) continue;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(dir, name)) as { default?: FastifyPluginAsync; prefix?: string };
    if (typeof mod.default !== 'function') throw new Error(`modules/${name}/index debe exportar default un plugin Fastify`);
    await app.register(mod.default, { prefix: mod.prefix ?? `/${name}` });
    app.log.info(`módulo registrado: ${name} -> ${mod.prefix ?? '/' + name}`);
  }
}
