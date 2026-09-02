import { VesselServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const server = new VesselServer(PORT);

server.start().catch((err) => {
  console.error('[Kybernetes Server] Fatal error:', err);
  process.exit(1);
});
