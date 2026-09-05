import { VesselServer } from './server.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const server = new VesselServer(PORT);

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Kybernetes Server] Received ${signal}. Initiating graceful shutdown...`);
  try {
    await server.stop();
    process.exit(0);
  } catch (err) {
    console.error('[Kybernetes Server] Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.start().catch((err) => {
  console.error('[Kybernetes Server] Fatal error:', err);
  process.exit(1);
});
