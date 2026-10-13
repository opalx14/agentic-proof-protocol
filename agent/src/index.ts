import { buildServer } from './server.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app } = buildServer(config);

app.listen({ port: config.PORT, host: config.HOST })
  .then((address) => {
    console.log(`Agentic Proof agent service listening at ${address}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
