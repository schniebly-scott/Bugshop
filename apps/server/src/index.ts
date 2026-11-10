import { loadEnv } from './env.ts';
import { createGameServer } from './app.ts';

const env = loadEnv();
const server = createGameServer(env);
await server.listen(env.PORT, env.HOST);
console.log(`Bugshop server listening on ${env.HOST}:${env.PORT} (allowed origins: ${env.ALLOWED_ORIGINS.join(', ')})`);
