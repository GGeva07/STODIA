import { buildApp } from './app';
import { config } from './config';

buildApp()
  .then(app => app.listen({ port: config.port, host: config.host }))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
