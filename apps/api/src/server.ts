import { buildApp } from './app';
import { config } from './config';
import { asegurarIndices } from './lib/db-indices';

asegurarIndices()
  .then(() => buildApp())
  .then(app => app.listen({ port: config.port, host: config.host }))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
