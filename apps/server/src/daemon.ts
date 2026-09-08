/**
 * Harbor daemon: the live v2 transport. One harbor world stepped by SimHost at
 * 20Hz, protocol v2 on the wire: input-only intents in, ticked snapshots out
 * (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz, plus WATCH/MANIFEST/HIRE_OFFER and
 * NOTICE for direct responses). Malformed and stale packets are dropped with
 * counters; the loop never throws on client input.
 */

import { type ClientIntent, makeHelloMismatch } from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  bindWorldAir,
  buildHarborWorld,
  buildHireOffer,
  buildManifest,
  buildNotice,
  buildSnapshot,
  buildTelemetry,
  buildVitals,
  buildWatch,
  createAirAuthority,
  type World,
} from '@kybernetes/sim-core';
import { WebSocket, WebSocketServer } from 'ws';
import { SimHost } from './SimHost.js';
import {
  createRateState,
  createSeqCursor,
  parsePipeInput,
  type RateState,
  type SeqCursorState,
} from './validatePipe.js';

interface SocketMeta {
  clientId: string;
  rates: RateState;
  seq: SeqCursorState;
}

export class HarborDaemon {
  private wss: WebSocketServer | null = null;
  private readonly host: SimHost;
  private readonly air: AirAuthorityState = createAirAuthority();
  private readonly meta = new Map<WebSocket, SocketMeta>();
  private nextClient = 0;
  private droppedInvalid = 0;
  private droppedLimited = 0;

  constructor(private readonly port: number = 3001) {
    const world = buildHarborWorld();
    bindWorldAir(this.air, world);
    this.host = new SimHost(
      world,
      undefined,
      {
        onSnapshot: (snapshot) => this.broadcastWorld(snapshot),
        onTelemetry: (telemetry) => this.sendAll(this.telemetryFor(telemetry)),
        onVitals: (vitals) => this.sendVitals(vitals),
      },
      { air: this.air, stationFrameId: 'station' }
    );
  }

  get world(): World {
    return this.host.currentWorld;
  }

  get dropCounts(): { invalid: number; limited: number } {
    return { invalid: this.droppedInvalid, limited: this.droppedLimited };
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`[Harbor Daemon] Authority running on ws://localhost:${this.port}`);
        this.host.start(Date.now());
        resolve();
      });
      this.wss.on('connection', (ws: WebSocket) => {
        this.nextClient += 1;
        const clientId = `c${this.nextClient}`;
        this.meta.set(ws, {
          clientId,
          rates: createRateState(Date.now()),
          seq: createSeqCursor(),
        });
        ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(ws, clientId, data.toString());
        });
        ws.on('close', () => {
          this.meta.delete(ws);
          this.host.leaveClient(clientId);
        });
      });
    });
  }

  public async stop(): Promise<void> {
    this.host.stop();
    for (const ws of this.meta.keys()) {
      try {
        ws.terminate();
      } catch {
        // Already gone; port release matters, not farewell handshakes.
      }
    }
    this.meta.clear();
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close((err) => {
          if (err) console.error('[Harbor Daemon] Error closing server:', err);
          this.wss = null;
          console.log('[Harbor Daemon] Stopped cleanly. Port released.');
          resolve();
        });
      });
    }
  }

  private handleMessage(ws: WebSocket, clientId: string, text: string): void {
    const meta = this.meta.get(ws);
    if (meta === undefined) return;
    const outcome = parsePipeInput(text, Date.now(), meta.rates, meta.seq);
    if (outcome.kind === 'invalid') {
      this.droppedInvalid += 1;
      return;
    }
    if (outcome.kind === 'version-mismatch') {
      this.send(ws, makeHelloMismatch(this.host.currentWorld.tick, Date.now(), outcome.received));
      return;
    }
    if (outcome.kind === 'rate-limited' || outcome.kind === 'duplicate') {
      this.droppedLimited += 1;
      return;
    }
    this.routeIntent(ws, clientId, outcome.intent);
  }

  private routeIntent(ws: WebSocket, clientId: string, intent: ClientIntent): void {
    const result = this.host.handleIntent(clientId, intent);
    if (result.offer !== undefined) {
      this.send(ws, buildHireOffer(this.host.currentWorld.tick, Date.now(), result.offer));
    }
    if (result.notice !== undefined) {
      this.send(
        ws,
        buildNotice(this.host.currentWorld.tick, Date.now(), 'info', 'Bridge', result.notice)
      );
    }
  }

  private telemetryFor(world: World): ReturnType<typeof buildTelemetry> {
    return buildTelemetry(
      world,
      Date.now(),
      Object.values(world.atmos).map((room) => ({ ...room }))
    );
  }

  private firstVesselId(world: World): string | undefined {
    return Object.keys(world.vessels)[0];
  }

  private sendAll(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const ws of this.meta.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  private broadcastWorld(world: World): void {
    const nowMs = Date.now();
    this.sendAll(buildSnapshot(world, nowMs));
    const vesselId = this.firstVesselId(world);
    if (vesselId === undefined) return;
    const watch = buildWatch(world, vesselId, nowMs);
    if (watch !== undefined) this.sendAll(watch);
    this.sendAll(buildManifest(world, vesselId, nowMs, this.host.manifestFor()));
  }

  private sendVitals(world: World): void {
    const nowMs = Date.now();
    for (const [ws, meta] of this.meta) {
      const client = this.host.clientOf(meta.clientId);
      if (client === undefined) continue;
      const vitals = this.host.vitalsFor(client.pawnId);
      this.send(ws, buildVitals(world, nowMs, client.pawnId, vitals.credits, vitals.clearance));
    }
  }
}
