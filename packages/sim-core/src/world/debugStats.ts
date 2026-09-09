/**
 * Observer debug stats: pure TPS + link-quality math for SERVER_STATS.
 * The host/daemon own clocks and sockets; this module only buckets
 * samples so the math is unit-covered. No DOM, no Node.
 */

export interface TickSample {
  readonly atMs: number;
  readonly durationMs: number;
}

export const TPS_TARGET = 20;
export const STATS_WINDOW_MS = 5000;

export function pushTickSample(
  samples: readonly TickSample[],
  sample: TickSample
): readonly TickSample[] {
  const cutoff = sample.atMs - STATS_WINDOW_MS;
  const kept = samples.filter((entry) => entry.atMs >= cutoff);
  return [...kept.slice(-99), sample];
}

export function tpsOf(samples: readonly TickSample[], nowMs: number): number {
  const cutoff = nowMs - STATS_WINDOW_MS;
  const inWindow = samples.filter((entry) => entry.atMs >= cutoff);
  if (inWindow.length < 2) return 0;
  const spanS = Math.max(0.001, (nowMs - inWindow[0].atMs) / 1000);
  return Math.round((inWindow.length / spanS) * 10) / 10;
}

export function tickMsAvgOf(samples: readonly TickSample[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((total, entry) => total + entry.durationMs, 0);
  return Math.round((sum / samples.length) * 100) / 100;
}

export interface PawnLinkInput {
  readonly pawnId: string;
  readonly callsign: string;
  readonly frameId: string;
  readonly roomHint: string;
  readonly lastInputAtMs: number;
  readonly latched: boolean;
  readonly msgCountInWindow: number;
}

export function msgsPerSOf(msgCountInWindow: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.round((msgCountInWindow / (windowMs / 1000)) * 10) / 10;
}

export function linkAgeOf(lastInputAtMs: number, nowMs: number): number {
  if (lastInputAtMs <= 0) return -1;
  return Math.max(0, Math.round(nowMs - lastInputAtMs));
}
