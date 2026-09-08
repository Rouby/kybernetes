/**
 * SimHost: owns one World plus its air authority, one accumulator (20Hz fixed
 * step, 50ms slice, max 4 steps, drop-and-count beyond), three broadcast clocks
 * (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz), and the client session registry
 * (beacon join, resume by userId, hire flow). Transport-agnostic: validated
 * intents go in, snapshot payloads come out through callbacks and getters.
 */

import type { ClientIntent, ManifestBroadcast, Role } from '@kybernetes/protocol';
import {
  type AirAuthorityState,
  FIXED_DT,
  type HireOfferRecord,
  hireAboard,
  roomContainingPoint,
  spawnPawn,
  talkToCaptain,
  tickWorld,
  type World,
  type WorldInput,
} from '@kybernetes/sim-core';
import { routeIntent } from './routers/intentRouter.js';

export interface HostBroadcastClocks {
  snapshotEveryMs: number;
  telemetryEveryMs: number;
  vitalsEveryMs: number;
}

export const DEFAULT_CLOCKS: HostBroadcastClocks = {
  snapshotEveryMs: 100,
  telemetryEveryMs: 500,
  vitalsEveryMs: 200,
};

export interface HostCallbacks {
  onSnapshot: (world: World) => void;
  onTelemetry: (world: World) => void;
  onVitals: (world: World) => void;
}

export interface HostOptions {
  air?: AirAuthorityState;
  stationFrameId?: string;
  rng01?: () => number;
}

export interface HostClient {
  userId: string;
  pawnId: string;
  callsign: string;
  color: string;
}

export interface HostIntentResult {
  notice?: string;
  offer?: HireOfferRecord;
}

export class SimHost {
  private world: World;
  private timer: ReturnType<typeof setInterval> | null = null;
  private accumulatorMs = 0;
  private lastTickMs = 0;
  private pending: WorldInput[] = [];
  private droppedSteps = 0;
  private lastSnapshotMs = 0;
  private lastTelemetryMs = 0;
  private lastVitalsMs = 0;
  private readonly clients = new Map<string, HostClient>();

  constructor(
    initialWorld: World,
    private readonly clocks: HostBroadcastClocks = DEFAULT_CLOCKS,
    private readonly callbacks: HostCallbacks | null = null,
    private readonly options: HostOptions = {}
  ) {
    this.world = initialWorld;
  }

  get currentWorld(): World {
    return this.world;
  }

  get droppedStepCount(): number {
    return this.droppedSteps;
  }

  enqueueInput(input: WorldInput): void {
    this.pending.push(input);
  }

  clientOf(clientId: string): HostClient | undefined {
    return this.clients.get(clientId);
  }

  joinBeacon(
    clientId: string,
    beacon: string,
    callsign: string,
    color: string,
    userId?: string
  ): { pawnId: string; resumed: boolean } | undefined {
    const vessel = Object.values(this.world.vessels).find((entry) => entry.beacon === beacon);
    if (vessel === undefined) return undefined;
    const id = userId ?? clientId;
    const pawnId = `pawn:${id}`;
    this.clients.set(clientId, { userId: id, pawnId, callsign, color });
    if (this.world.pawns[pawnId] !== undefined) return { pawnId, resumed: true };
    const point = stationSpawnPoint(this.world, this.stationFrame());
    if (point === undefined) return undefined;
    this.world = spawnPawn(this.world, {
      id: pawnId,
      owner: id,
      frameId: point.frameId,
      roomId: point.roomId,
      x: point.x,
      y: point.y,
      color,
    });
    return { pawnId, resumed: false };
  }

  leaveClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  handleIntent(clientId: string, intent: ClientIntent): HostIntentResult {
    switch (intent.type) {
      case 'HELLO':
        return this.handleHello(clientId, intent.callsign, intent.color);
      case 'JOIN_BEACON':
        return this.handleJoin(clientId, intent.beacon, intent.userId);
      case 'INPUT':
      case 'DOOR':
      case 'SUIT':
      case 'CONSUME':
      case 'SLEEP':
      case 'FIRE':
        return this.handleKernelIntent(clientId, intent);
      case 'TALK':
        return this.handleTalk(intent.npcId);
      case 'HIRE':
        return this.handleHire(clientId, intent.offerId, intent.job);
      default:
        return { notice: intent.type };
    }
  }

  manifestFor(): ManifestBroadcast['crew'] {
    const crew: { id: string; callsign: string; role: Role; frameId: string }[] = [];
    for (const client of this.clients.values()) {
      const pawn = this.world.pawns[client.pawnId];
      if (pawn === undefined) continue;
      const role = this.world.crew[client.pawnId]?.role;
      crew.push({
        id: client.pawnId,
        callsign: client.callsign,
        role: role === 'captain' || role === undefined ? 'deckhand' : role,
        frameId: pawn.frameId,
      });
    }
    return crew;
  }

  vitalsFor(pawnId: string): { credits: number; clearance: number } {
    const record = this.world.crew[pawnId];
    return { credits: record?.credits ?? 0, clearance: record?.clearance ?? 1 };
  }

  start(nowMs: number, sliceMs = 50): void {
    if (this.timer !== null) return;
    this.lastTickMs = nowMs;
    this.timer = setInterval(() => this.slice(Date.now(), sliceMs), sliceMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pending = [];
    this.accumulatorMs = 0;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  slice(nowMs: number, sliceMs: number): void {
    this.accumulatorMs += Math.min(Math.max(nowMs - this.lastTickMs, 0), sliceMs * 4);
    this.lastTickMs = nowMs;
    this.drainSteps();
    this.fireClocks(nowMs);
  }

  private stationFrame(): string | undefined {
    if (this.options.stationFrameId !== undefined) return this.options.stationFrameId;
    return Object.keys(this.world.stations)[0];
  }

  private rng(): () => number {
    return this.options.rng01 ?? Math.random;
  }

  private handleHello(clientId: string, callsign: string, color: string): HostIntentResult {
    const prior = this.clients.get(clientId);
    const userId = prior?.userId ?? clientId;
    const pawnId = prior?.pawnId ?? `pawn:${userId}`;
    this.clients.set(clientId, { userId, pawnId, callsign, color });
    return {};
  }

  private handleJoin(clientId: string, beacon: string, userId?: string): HostIntentResult {
    const prior = this.clients.get(clientId);
    const joined = this.joinBeacon(
      clientId,
      beacon,
      prior?.callsign ?? clientId,
      prior?.color ?? '#ffffff',
      userId ?? prior?.userId
    );
    return joined === undefined ? { notice: 'unknown-beacon' } : {};
  }

  private handleKernelIntent(clientId: string, intent: ClientIntent): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const routed = routeIntent(this.world, client.pawnId, intent, this.pending);
    this.world = routed.world;
    this.pending = [...routed.movement];
    return routed.notice === undefined ? {} : { notice: routed.notice };
  }

  private handleTalk(npcId: string): HostIntentResult {
    const { world, offer } = talkToCaptain(this.world, npcId, this.rng());
    this.world = world;
    return offer === undefined ? { notice: 'no-offer' } : { offer };
  }

  private handleHire(clientId: string, offerId: string, job: Role): HostIntentResult {
    const client = this.clients.get(clientId);
    if (client === undefined) return { notice: 'not-joined' };
    const offer = this.world.offers[offerId];
    if (offer === undefined) return { notice: 'hire-refused' };
    const { world, hired } = hireAboard(this.world, offer.vesselId, client.pawnId, job, offerId);
    this.world = world;
    return hired ? {} : { notice: 'hire-refused' };
  }

  private drainSteps(): void {
    const stepMs = FIXED_DT * 1000;
    let steps = 0;
    while (this.accumulatorMs >= stepMs) {
      if (steps >= 4) {
        this.droppedSteps += 1;
        this.accumulatorMs = 0;
        return;
      }
      this.stepOnce();
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
  }

  private stepOnce(): void {
    const inputs = this.pending;
    this.pending = [];
    this.world = tickWorld(this.world, FIXED_DT, inputs, this.options.air);
  }

  private fireClocks(nowMs: number): void {
    if (this.callbacks === null) return;
    this.fireSnapshot(nowMs);
    this.fireTelemetry(nowMs);
    this.fireVitals(nowMs);
  }

  private fireSnapshot(nowMs: number): void {
    if (nowMs - this.lastSnapshotMs < this.clocks.snapshotEveryMs) return;
    this.lastSnapshotMs = nowMs;
    this.callbacks?.onSnapshot(this.world);
  }

  private fireTelemetry(nowMs: number): void {
    if (nowMs - this.lastTelemetryMs < this.clocks.telemetryEveryMs) return;
    this.lastTelemetryMs = nowMs;
    this.callbacks?.onTelemetry(this.world);
  }

  private fireVitals(nowMs: number): void {
    if (nowMs - this.lastVitalsMs < this.clocks.vitalsEveryMs) return;
    this.lastVitalsMs = nowMs;
    this.callbacks?.onVitals(this.world);
  }
}

function stationSpawnPoint(
  world: World,
  stationFrameId: string | undefined
): { frameId: string; roomId: string; x: number; y: number } | undefined {
  if (stationFrameId === undefined) return undefined;
  const spawnId = Object.keys(world.spawns)
    .filter((id) => id.startsWith(`${stationFrameId}.`))
    .sort()[0];
  if (spawnId !== undefined) {
    const spawn = world.spawns[spawnId];
    if (spawn !== undefined) {
      const roomId = roomContainingPoint(world, stationFrameId, spawn.x, spawn.y);
      if (roomId !== undefined) return { frameId: stationFrameId, roomId, x: spawn.x, y: spawn.y };
    }
  }
  const room = Object.values(world.rooms)
    .filter((entry) => entry.frameId === stationFrameId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (room === undefined) return undefined;
  return {
    frameId: stationFrameId,
    roomId: room.id,
    x: room.rect.x + room.rect.w / 2,
    y: room.rect.y + room.rect.h / 2,
  };
}
