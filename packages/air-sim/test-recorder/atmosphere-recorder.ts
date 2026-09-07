import { type AtmosphereSimulation, GasType, type Portal, type Room } from '../src';

export interface RoomRect {
  roomId: string;
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface PortalPosition {
  portalId: string;
  x: number;
  y: number;
  length: number;
  maxArea: number;
  orientation: 'horizontal' | 'vertical';
}

export interface FloorplanLayout {
  scale?: number;
  rooms: RoomRect[];
  portals: PortalPosition[];
}

export interface RoomFrameState {
  id: string;
  pressurePa: number;
  tempK: number;
  totalMoles: number;
  o2Pct: number;
}

export interface PortalFrameState {
  id: string;
  maxArea: number;
  effectiveArea: number;
  openRatio: number;
  velocity: number;
  pressureDifferencePa: number;
}

/** Door/vent changes at absolute simulation times, in seconds from recording start. */
export interface ScheduledPortalEvent {
  atSeconds: number;
  portalId: string;
  openRatio: number; // 0 = closed, 1 = fully open
  label?: string;
}

export interface SimulationFrame {
  time: number;
  rooms: Record<string, RoomFrameState>;
  portals: Record<string, PortalFrameState>;
}

export interface AtmosphereRecording {
  testName: string;
  layout: FloorplanLayout;
  dt: number;
  totalTime: number;
  frames: SimulationFrame[];
  events: ScheduledPortalEvent[];
}

declare module 'vitest' {
  interface TaskMeta {
    atmosphereRecordings?: AtmosphereRecording[];
  }
}

function portalPosition(portal: Portal): PortalPosition {
  const { x, y, width, length: depth } = portal.roomA.config;
  const horizontal = portal.side === 'north' || portal.side === 'south';
  const wallLength = horizontal ? width : depth;
  // Approximate a square aperture for drawing; never shrink a closed door to zero.
  const length = Math.min(portal.width, wallLength);
  const offset = Math.max(
    0,
    Math.min(wallLength - length, wallLength * portal.position - length / 2)
  );
  return {
    portalId: portal.id,
    x: x + (horizontal ? offset : portal.side === 'east' ? width : 0),
    y: y + (horizontal ? (portal.side === 'south' ? depth : 0) : offset),
    length,
    maxArea: portal.maxArea,
    orientation: horizontal ? 'horizontal' : 'vertical',
  };
}

function roomFrame(room: Room): RoomFrameState {
  const total = room.totalMoles;
  return {
    id: room.id,
    pressurePa: room.pressure,
    tempK: room.gas.temperatureK,
    totalMoles: total,
    o2Pct: total > 0 ? (room.gas.moles[GasType.Oxygen] / total) * 100 : 0,
  };
}

function portalFrame(portal: Portal): PortalFrameState {
  return {
    id: portal.id,
    maxArea: portal.maxArea,
    effectiveArea: portal.effectiveArea,
    openRatio: portal.openRatio,
    velocity: portal.velocity,
    pressureDifferencePa: Math.abs(portal.roomA.pressure - (portal.roomB?.pressure ?? 0)),
  };
}

function endTimeForRun(start: number, duration: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0 || start + dt === start) {
    throw new RangeError('Recording dt must be finite, positive and advance simulation time');
  }
  const end = start + duration;
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(end)) {
    throw new RangeError('Recording duration must be finite and nonnegative');
  }
  return end;
}

function resolveEvents(
  sim: AtmosphereSimulation,
  events: readonly ScheduledPortalEvent[],
  start: number,
  end: number
) {
  return events
    .map((event) => {
      if (!Number.isFinite(event.atSeconds) || event.atSeconds < start || event.atSeconds > end) {
        throw new RangeError('Portal event time must fall within this recording run');
      }
      if (!Number.isFinite(event.openRatio) || event.openRatio < 0 || event.openRatio > 1) {
        throw new RangeError('Portal event openRatio must be between 0 and 1');
      }
      const matches = sim.portals.filter((portal) => portal.id === event.portalId);
      if (matches.length !== 1)
        throw new Error(`Portal event requires a unique portal: ${event.portalId}`);
      return { event: { ...event }, portal: matches[0] };
    })
    .sort((a, b) => a.event.atSeconds - b.event.atSeconds);
}

export class SimulationRecorder {
  private readonly frames: SimulationFrame[] = [];
  private readonly events: ScheduledPortalEvent[] = [];
  private currentTime = 0;
  private readonly layout: FloorplanLayout;

  constructor(private readonly sim: AtmosphereSimulation) {
    this.layout = {
      rooms: [...sim.rooms.values()].map(({ id, config }) => ({
        roomId: id,
        x: config.x,
        y: config.y,
        width: config.width,
        length: config.length,
      })),
      portals: sim.portals.map(portalPosition),
    };
  }

  private captureFrame(): void {
    const frame: SimulationFrame = {
      time: this.currentTime,
      rooms: Object.fromEntries(
        [...this.sim.rooms.values()].map((room) => [room.id, roomFrame(room)])
      ),
      portals: Object.fromEntries(
        this.sim.portals.map((portal) => [portal.id, portalFrame(portal)])
      ),
    };
    // Continuing a recording replaces the boundary frame rather than adding another t=0.
    if (this.frames.at(-1)?.time === this.currentTime) this.frames.pop();
    this.frames.push(frame);
  }

  /** Splits steps at event times; changes are captured before physics advances beyond that time. */
  runWithRecording(
    durationSeconds: number,
    dt: number,
    events: readonly ScheduledPortalEvent[] = []
  ): void {
    const end = endTimeForRun(this.currentTime, durationSeconds, dt);
    const pending = resolveEvents(this.sim, events, this.currentTime, end);
    let cursor = this.applyEvents(pending, 0);
    this.captureFrame();
    while (this.currentTime < end) {
      const nextTime = Math.min(
        this.currentTime + dt,
        pending[cursor]?.event.atSeconds ?? end,
        end
      );
      this.sim.step(nextTime - this.currentTime);
      this.currentTime = nextTime;
      cursor = this.applyEvents(pending, cursor);
      this.captureFrame();
    }
  }

  private applyEvents(pending: ReturnType<typeof resolveEvents>, cursor: number): number {
    while (cursor < pending.length && pending[cursor].event.atSeconds <= this.currentTime) {
      const { portal, event } = pending[cursor];
      portal.openRatio = event.openRatio;
      this.events.push(event);
      cursor++;
    }
    return cursor;
  }

  getRecording(testName: string, dt: number): AtmosphereRecording {
    return {
      testName,
      layout: this.layout,
      dt,
      totalTime: this.currentTime,
      frames: [...this.frames],
      events: [...this.events],
    };
  }
}
