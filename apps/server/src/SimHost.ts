/**
 * SimHost: owns one World, one accumulator (20Hz fixed step, 50ms slice,
 * max 4 steps, drop-and-count beyond), and three broadcast clocks
 * (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz).
 * Replaces per-session GameLoop timers + server.ts god class tick paths.
 */

import { FIXED_DT, tickWorld, type World, type WorldInput } from '@kybernetes/sim-core';

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

  constructor(
    initialWorld: World,
    private readonly clocks: HostBroadcastClocks = DEFAULT_CLOCKS,
    private readonly callbacks: HostCallbacks | null = null
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
    this.world = tickWorld(this.world, FIXED_DT, inputs);
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
