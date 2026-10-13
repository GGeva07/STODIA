import { buildApp } from './app';
import { config } from './config';
import { asegurarIndices } from './lib/db-indices';
import { programarMoras } from './lib/mora';
import { programarReinscripcion } from './lib/reinscripcion';

asegurarIndices()
  .then(() => buildApp())
  .then(app => app.listen({ port: config.port, host: config.host }).then(() => { programarMoras(app.log); programarReinscripcion(app.log); }))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
