import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { HarborDaemon } from './daemon.js';

const TIMEOUT_MS = 10_000;

type WireMessage = Record<string, unknown>;

function isTaggedMessage(value: unknown, type: string): value is WireMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type;
}

function waitForType(ws: WebSocket, type: string, timeoutMs = TIMEOUT_MS): Promise<WireMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (isTaggedMessage(parsed, type)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(parsed);
      }
    };
    ws.on('message', onMessage);
  });
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timer = setTimeout(() => reject(new Error('connect timeout')), TIMEOUT_MS);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function send(ws: WebSocket, message: Record<string, unknown>): void {
  ws.send(JSON.stringify({ v: 2, ...message }));
}

async function connectAndJoin(port: number, callsign: string, userId: string): Promise<WebSocket> {
  const ws = await connect(port);
  send(ws, { type: 'HELLO', callsign, color: '#ffffff', clientVersion: 2 });
  send(ws, { type: 'JOIN_BEACON', beacon: 'HESP01', seq: 0, userId });
  return ws;
}

describe('HarborDaemon v2 transport', () => {
  const daemons: HarborDaemon[] = [];
  const sockets: WebSocket[] = [];

  async function startDaemon(port = 0): Promise<{ daemon: HarborDaemon; port: number }> {
    const daemon = new HarborDaemon(port);
    await daemon.start();
    daemons.push(daemon);
    const address = (daemon as unknown as { wss: { address(): { port: number } } }).wss.address();
    return { daemon, port: address.port };
  }

  afterEach(async () => {
    for (const ws of sockets.splice(0)) {
      try {
        ws.terminate();
      } catch {
        // Already gone.
      }
    }
    for (const daemon of daemons.splice(0)) {
      await daemon.stop();
    }
  });

  it('serves ticked v2 snapshots after beacon join', async () => {
    const { port } = await startDaemon();
    const ws = await connectAndJoin(port, 'Rook', 'e2e-1');
    sockets.push(ws);
    const joined = await waitForType(ws, 'JOINED');
    expect(joined.pawnId).toBe('pawn:e2e-1');
    expect(joined.beacon).toBe('HESP01');
    const snapshot = await waitForType(ws, 'SNAPSHOT');
    expect(snapshot.v).toBe(2);
    expect(typeof snapshot.tick).toBe('number');
    const manifest = await waitForType(ws, 'MANIFEST');
    expect(manifest.beacon).toBe('HESP01');
    const vitals = await waitForType(ws, 'VITALS');
    expect(typeof (vitals as { credits?: unknown }).credits).toBe('number');
    await waitForType(ws, 'TELEMETRY');
  });

  it('runs talk to hire to departure over the socket', async () => {
    const { port } = await startDaemon();
    const ws = await connectAndJoin(port, 'Sable', 'e2e-2');
    sockets.push(ws);
    send(ws, { type: 'TALK', seq: 1, npcId: 'captain:ship' });
    const offer = await waitForType(ws, 'HIRE_OFFER');
    const jobs = offer.jobs as string[];
    expect(jobs).toHaveLength(2);
    send(ws, { type: 'HIRE', seq: 2, offerId: offer.offerId as string, job: jobs[0] as string });
    const manifest = await waitForType(ws, 'MANIFEST');
    const crew = manifest.crew as { callsign: string; role: string }[];
    expect(crew.find((entry) => entry.callsign === 'Sable')?.role).toBe(jobs[0]);
  });

  it('moves pawns on input and drops malformed packets safely', async () => {
    const { daemon, port } = await startDaemon();
    const ws = await connectAndJoin(port, 'Drift', 'e2e-3');
    sockets.push(ws);
    const heroX = (message: WireMessage): number =>
      (message.pawns as { color: string; x: number }[]).find((pawn) => pawn.color === '#ffffff')
        ?.x ?? Number.NaN;
    const before = await waitForType(ws, 'SNAPSHOT');
    const startX = heroX(before);
    for (let seq = 1; seq <= 10; seq += 1) {
      send(ws, {
        type: 'INPUT',
        seq,
        moveVec: { x: 1, y: 0 },
        facing: 0,
        sprint: false,
        sealed: false,
      });
    }
    ws.send('this is not json{{{');
    send(ws, { type: 'JOIN_VESSEL', vesselCode: 'HESP01' });
    let endX = startX;
    for (let i = 0; i < 20 && !(endX > startX); i += 1) {
      endX = heroX(await waitForType(ws, 'SNAPSHOT'));
    }
    expect(endX).toBeGreaterThan(startX);
    expect(daemon.dropCounts.invalid).toBeGreaterThan(0);
    expect(daemon.world.tick).toBeGreaterThan(0);
  });

  it('rejects stale protocol versions with a mismatch notice', async () => {
    const { port } = await startDaemon();
    const ws = await connect(port);
    sockets.push(ws);
    ws.send(JSON.stringify({ v: 1, type: 'INPUT', seq: 0 }));
    const mismatch = await waitForType(ws, 'HELLO_MISMATCH');
    expect(mismatch.expectedVersion).toBe(2);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('releases the port on stop so a new daemon can bind it', async () => {
    const first = await startDaemon();
    await first.daemon.stop();
    daemons.splice(daemons.indexOf(first.daemon), 1);
    const second = new HarborDaemon(first.port);
    await second.start();
    daemons.push(second);
    const ws = await connectAndJoin(first.port, 'Rook', 'e2e-4');
    sockets.push(ws);
    await waitForType(ws, 'SNAPSHOT');
  });
});
