import { SESSION_RESUMED_ELSEWHERE_CODE } from '@kybernetes/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
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

function waitForSnapshot(ws: WebSocket, timeoutMs = TIMEOUT_MS): Promise<WireMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('timed out waiting for SNAPSHOT or SNAPSHOT_DELTA'));
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (isTaggedMessage(parsed, 'SNAPSHOT') || isTaggedMessage(parsed, 'SNAPSHOT_DELTA')) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(parsed);
      }
    };
    ws.on('message', onMessage);
  });
}

function tapMessages(ws: WebSocket): { seen: WireMessage[]; stop: () => void } {
  const seen: WireMessage[] = [];
  const onMessage = (data: WebSocket.RawData): void => {
    try {
      seen.push(JSON.parse(data.toString()) as WireMessage);
    } catch {
      // Malformed test input never reaches the tap.
    }
  };
  ws.on('message', onMessage);
  return { seen, stop: () => ws.off('message', onMessage) };
}

async function waitForTapped(
  seen: WireMessage[],
  type: string,
  timeoutMs = TIMEOUT_MS
): Promise<WireMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = seen.find((message) => message.type === type);
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function stopSettles(daemon: HarborDaemon, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stop() hung')), timeoutMs);
    daemon.stop().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
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
    const ws = await connect(port);
    sockets.push(ws);
    const tap = tapMessages(ws);
    send(ws, { type: 'HELLO', callsign: 'Rook', color: '#ffffff', clientVersion: 2 });
    send(ws, { type: 'JOIN_BEACON', beacon: 'HESP01', seq: 0, userId: 'e2e-1' });
    const joined = await waitForType(ws, 'JOINED');
    expect(joined.pawnId).toBe('pawn:e2e-1');
    expect(joined.beacon).toBe('HESP01');
    const snapshot = await waitForTapped(tap.seen, 'SNAPSHOT');
    expect(snapshot.v).toBe(2);
    expect(typeof snapshot.tick).toBe('number');
    const manifest = await waitForTapped(tap.seen, 'MANIFEST');
    expect(manifest.beacon).toBe('HESP01');
    const vitals = await waitForTapped(tap.seen, 'VITALS');
    expect(typeof (vitals as { credits?: unknown }).credits).toBe('number');
    const telemetry = await waitForTapped(tap.seen, 'TELEMETRY');
    expect(Array.isArray(telemetry.atmos)).toBe(true);
    expect(Array.isArray(telemetry.flows)).toBe(true);
    tap.stop();
  });

  it('evicts the first socket when the same userId resumes elsewhere', async () => {
    const { port } = await startDaemon();
    const first = await connectAndJoin(port, 'Rook', 'twin-9');
    sockets.push(first);
    await waitForType(first, 'JOINED');
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      first.on('close', (code: number, reason: Buffer) =>
        resolve({ code, reason: reason.toString() })
      );
    });
    const second = await connectAndJoin(port, 'Rook', 'twin-9');
    sockets.push(second);
    const joined = await waitForType(second, 'JOINED');
    expect(joined.pawnId).toBe('pawn:twin-9');
    const { code, reason } = await closed;
    expect(code).toBe(SESSION_RESUMED_ELSEWHERE_CODE);
    expect(reason).toBe('session-resumed-elsewhere');
    expect(first.readyState).not.toBe(WebSocket.OPEN);
    // The surviving holder drives the shared pawn alone.
    send(second, {
      type: 'INPUT',
      seq: 1,
      moveVec: { x: 0, y: 0 },
      facing: 1.5,
      sprint: false,
      sealed: true,
    });
    let facing = Number.NaN;
    for (let i = 0; i < 40 && !(Math.abs(facing - 1.5) < 0.01); i += 1) {
      const snapshot = await waitForSnapshot(second);
      const pawns = snapshot.pawns as { id: string; facing: number }[];
      facing = pawns.find((pawn) => pawn.id === 'pawn:twin-9')?.facing ?? Number.NaN;
    }
    expect(facing).toBeCloseTo(1.5, 2);
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
    const before = await waitForSnapshot(ws);
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
      endX = heroX(await waitForSnapshot(ws));
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

  it('streams full snapshots with deltas and tracks channel stats', async () => {
    const { daemon, port } = await startDaemon();
    const ws = await connectAndJoin(port, 'Delta', 'e2e-delta');
    sockets.push(ws);
    await waitForType(ws, 'JOINED');
    await waitForType(ws, 'SNAPSHOT');
    const delta = await waitForType(ws, 'SNAPSHOT_DELTA');
    expect(delta.v).toBe(2);
    expect(typeof delta.baseTick).toBe('number');
    expect(Array.isArray(delta.pawns)).toBe(true);
    const stats = daemon.getStats();
    expect(stats.snapshotFull).toBeGreaterThanOrEqual(1);
    expect(stats.snapshotDelta).toBeGreaterThanOrEqual(1);
    expect(stats.snapshotBytes).toBeGreaterThan(0);
  });

  it('sends manifest once on join instead of every snapshot', async () => {
    const { port } = await startDaemon();
    const ws = await connect(port);
    sockets.push(ws);
    const tap = tapMessages(ws);
    send(ws, { type: 'HELLO', callsign: 'Quiet', color: '#ffffff', clientVersion: 2 });
    send(ws, { type: 'JOIN_BEACON', beacon: 'HESP01', seq: 0, userId: 'e2e-quiet' });
    await waitForType(ws, 'JOINED');
    await new Promise((resolve) => setTimeout(resolve, 700));
    tap.stop();
    const manifests = tap.seen.filter((message) => message.type === 'MANIFEST');
    expect(manifests.length).toBe(1);
    expect(typeof manifests[0]?.rev).toBe('number');
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

  it('rejects start when the port is held and stays stoppable', async () => {
    const squatter = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve, reject) => {
      squatter.on('listening', resolve);
      squatter.on('error', reject);
    });
    const address = squatter.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const daemon = new HarborDaemon(port);
    await expect(daemon.start()).rejects.toThrow();
    expect(daemon.running).toBe(false);
    await stopSettles(daemon);
    expect(daemon.running).toBe(false);
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
  });

  it('stops with a live joined client and frees the port', async () => {
    const { daemon, port } = await startDaemon();
    const ws = await connectAndJoin(port, 'Stuck', 'e2e-stuck');
    sockets.push(ws);
    await waitForType(ws, 'JOINED');
    expect(daemon.running).toBe(true);
    await stopSettles(daemon);
    expect(daemon.running).toBe(false);
    daemons.splice(daemons.indexOf(daemon), 1);
    const second = new HarborDaemon(port);
    await second.start();
    daemons.push(second);
    expect(second.running).toBe(true);
  });

  it('tolerates repeated start and stop calls', async () => {
    const { daemon } = await startDaemon();
    await daemon.start();
    await daemon.start();
    expect(daemon.running).toBe(true);
    await stopSettles(daemon);
    await stopSettles(daemon);
    expect(daemon.running).toBe(false);
    daemons.splice(daemons.indexOf(daemon), 1);
  });
});
