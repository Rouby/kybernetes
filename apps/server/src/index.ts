import { HarborDaemon } from './daemon.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const server = new HarborDaemon(PORT);

let isShuttingDown = false;

const SHUTDOWN_TIMEOUT_MS = 5000;

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EADDRINUSE'
  );
}

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Harbor Daemon] Received ${signal}. Initiating graceful shutdown...`);
  const force = setTimeout(() => {
    console.error('[Harbor Daemon] Graceful stop timed out; forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  if (typeof force.unref === 'function') force.unref();
  try {
    await server.stop();
    clearTimeout(force);
    process.exit(0);
  } catch (err) {
    clearTimeout(force);
    console.error('[Harbor Daemon] Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.start().catch((err) => {
  if (isAddrInUse(err)) {
    console.error(
      `[Harbor Daemon] Port ${PORT} is already bound: another daemon or orphan process may be holding it. Free the port and retry.`
    );
  } else {
    console.error('[Harbor Daemon] Fatal error:', err);
  }
  process.exit(1);
});
