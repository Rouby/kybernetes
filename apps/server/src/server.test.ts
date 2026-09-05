import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { VesselServer } from './server';

const JOIN_CODE = 'TEST01';
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

async function connectAndJoin(port: number, callsign: string): Promise<WebSocket> {
  const ws = await connect(port);
  ws.send(JSON.stringify({ type: 'JOIN_VESSEL', vesselCode: JOIN_CODE, callsign, role: 'wiper' }));
  return ws;
}

describe('VesselServer lifecycle and wire loopback', () => {
  const servers: VesselServer[] = [];
  const sockets: WebSocket[] = [];

  async function startServer(port = 0): Promise<VesselServer> {
    const server = new VesselServer(port);
    await server.start();
    servers.push(server);
    return server;
  }

  afterEach(async () => {
    for (const ws of sockets.splice(0)) {
      try {
        ws.terminate();
      } catch {
        // ignore already-closed sockets
      }
    }
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  it('joins a vessel and streams crew manifest plus spatial snapshot', async () => {
    const server = await startServer();
    const ws = await connectAndJoin(server.getPort(), 'Loopback-1');
    sockets.push(ws);

    const manifest = (await waitForType(ws, 'CREW_MANIFEST')) as {
      crew: { callsign: string }[];
    };
    expect(manifest.crew.map((c) => c.callsign)).toContain('Loopback-1');

    const snapshot = (await waitForType(ws, 'SPATIAL_SNAPSHOT')) as {
      pawns: unknown[];
    };
    expect(snapshot.pawns.length).toBeGreaterThan(0);
  });

  it('survives malformed JSON and still processes a later JOIN', async () => {
    const server = await startServer();
    const ws = await connect(server.getPort());
    sockets.push(ws);

    ws.send('this is not json{{{');
    ws.send(
      JSON.stringify({
        type: 'JOIN_VESSEL',
        vesselCode: JOIN_CODE,
        callsign: 'Loopback-2',
        role: 'wiper',
      })
    );

    const manifest = (await waitForType(ws, 'CREW_MANIFEST')) as {
      crew: { callsign: string }[];
    };
    expect(manifest.crew.map((c) => c.callsign)).toContain('Loopback-2');
  });

  it('TRIGGER_NAVAL_EVENT produces a NAVAL_DAMAGE_EVENT with a stable id', async () => {
    const server = await startServer();
    const ws = await connectAndJoin(server.getPort(), 'Loopback-3');
    sockets.push(ws);
    await waitForType(ws, 'CREW_MANIFEST');

    ws.send(JSON.stringify({ type: 'TRIGGER_NAVAL_EVENT', eventType: 'torpedo_run' }));
    const naval = (await waitForType(ws, 'NAVAL_DAMAGE_EVENT')) as {
      event: { id: string; type: string };
    };
    expect(naval.event.id).toBeTruthy();
    expect(naval.event.type).toBe('torpedo_run');
  });

  it('PLAYER_MOVE replicates the pawn in spatial snapshots', async () => {
    const server = await startServer();
    const ws = await connectAndJoin(server.getPort(), 'Loopback-4');
    sockets.push(ws);
    await waitForType(ws, 'CREW_MANIFEST');

    ws.send(JSON.stringify({ type: 'PLAYER_MOVE', x: 510, y: 350, vx: 0, vy: 0, facingAngle: 0 }));
    const snapshot = (await waitForType(ws, 'SPATIAL_SNAPSHOT')) as {
      pawns: { callsign: string }[];
    };
    expect(snapshot.pawns.some((p) => p.callsign === 'Loopback-4')).toBe(true);
  });

  it('JOIN streams the current docking phase immediately', async () => {
    const server = await startServer();
    const ws = await connectAndJoin(server.getPort(), 'Loopback-5');
    sockets.push(ws);

    const docking = (await waitForType(ws, 'SHIP_DOCKING_UPDATE')) as {
      phase: string;
      shipName: string;
    };
    expect(docking.shipName).toBeTruthy();
    expect(['inbound', 'docked', 'departing', 'in_transit', 'arrived']).toContain(docking.phase);
  });

  it('gauntlet hatches ignore manual toggle while sealed', async () => {
    const server = await startServer();
    const ws = await connectAndJoin(server.getPort(), 'Loopback-6');
    sockets.push(ws);
    await waitForType(ws, 'CREW_MANIFEST');

    ws.send(JSON.stringify({ type: 'TOGGLE_DOOR', doorId: 'gauntlet_ship_door', open: true }));
    const first = (await waitForType(ws, 'TELEMETRY_DELTA')) as {
      boarding: { doors: { id: string; isOpen: boolean }[] };
    };
    const second = (await waitForType(ws, 'TELEMETRY_DELTA')) as {
      boarding: { doors: { id: string; isOpen: boolean }[] };
    };
    const hatch = [...first.boarding.doors, ...second.boarding.doors].find(
      (d) => d.id === 'gauntlet_ship_door'
    );
    expect(hatch).toBeDefined();
    expect(second.boarding.doors.find((d) => d.id === 'gauntlet_ship_door')?.isOpen).toBe(false);
  });

  it('stop() releases the port so a new daemon can bind it', async () => {
    const first = await startServer();
    const port = first.getPort();
    expect(port).toBeGreaterThan(0);
    await first.stop();
    servers.splice(servers.indexOf(first), 1);

    const second = new VesselServer(port);
    await second.start();
    servers.push(second);
    expect(second.getPort()).toBe(port);
  });
});
