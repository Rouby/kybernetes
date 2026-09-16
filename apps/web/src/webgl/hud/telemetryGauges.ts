/** Pure subsystem gauges derived from TELEMETRY room atmospheres. */
import type { RoomAtmosphereSummary } from '@kybernetes/protocol';

export interface SubsystemGauges {
  readonly roomCount: number;
  readonly breachCount: number;
  /** Share of rooms breached or venting (0-100). */
  readonly breachPct: number;
  /** Mean cabin pressure as a share of nominal 101.3 kPa (0-100). */
  readonly atmosPct: number;
}

export function subsystemGauges(
  rooms: Record<string, RoomAtmosphereSummary> | undefined
): SubsystemGauges {
  const list = rooms === undefined ? [] : Object.values(rooms);
  if (list.length === 0) return { roomCount: 0, breachCount: 0, breachPct: 0, atmosPct: 100 };
  const breached = list.filter((room) => room.activeBreaches > 0 || room.isVenting).length;
  const meanKpa = list.reduce((sum, room) => sum + room.pressureKpa, 0) / list.length;
  return {
    roomCount: list.length,
    breachCount: breached,
    breachPct: (breached / list.length) * 100,
    atmosPct: Math.max(0, Math.min(100, (meanKpa / 101.3) * 100)),
  };
}

export interface WatchProgress {
  readonly done: number;
  readonly total: number;
  /** Share of tasks complete (0-1). */
  readonly frac: number;
}

export function watchProgress(tasks: readonly { completed: boolean }[] | undefined): WatchProgress {
  if (tasks === undefined || tasks.length === 0) return { done: 0, total: 0, frac: 0 };
  const done = tasks.filter((task) => task.completed).length;
  return { done, total: tasks.length, frac: done / tasks.length };
}

export interface RingSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly x3: number;
  readonly y3: number;
}

export interface WatchRing {
  readonly filled: readonly RingSegment[];
  readonly empty: readonly RingSegment[];
}

/**
 * Segmented progress ring: pie slices with angular gaps, starting at the top
 * and running clockwise (screen y-down). Filled count rounds the fraction.
 */
export function watchRingSegments(
  cx: number,
  cy: number,
  r: number,
  frac: number,
  segments = 12
): WatchRing {
  const clamped = Math.max(0, Math.min(1, frac));
  const filledCount = Math.round(clamped * segments);
  const step = (Math.PI * 2) / segments;
  const gap = step * 0.18;
  const filled: RingSegment[] = [];
  const empty: RingSegment[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = -Math.PI / 2 + i * step + gap / 2;
    const a1 = -Math.PI / 2 + (i + 1) * step - gap / 2;
    const segment: RingSegment = {
      x1: cx,
      y1: cy,
      x2: cx + Math.cos(a0) * r,
      y2: cy + Math.sin(a0) * r,
      x3: cx + Math.cos(a1) * r,
      y3: cy + Math.sin(a1) * r,
    };
    if (i < filledCount) filled.push(segment);
    else empty.push(segment);
  }
  return { filled, empty };
}
