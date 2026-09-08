/**
 * INPUT send gate: movement samples stream at up to 20Hz, but unchanged
 * samples stay local (500ms heartbeat) so idle clients stop waking the
 * server tick. Pure and unit-tested; the RAF loop owns the clock.
 */

export interface InputSample {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly sprint: boolean;
  readonly sealed: boolean;
}

export const INPUT_HEARTBEAT_MS = 500;
const MOVE_EPS = 0.01;
const FACING_EPS = 0.02;

/** True on the first frame with input after idle: send at once, skip the pump wait. */
export function wantsImmediateSend(
  wasActive: boolean,
  input: { x: number; y: number } | null
): boolean {
  return input !== null && !wasActive;
}

/** Changed samples go out, identical ones wait for the heartbeat. */
export function shouldSendInput(
  last: InputSample | null,
  next: InputSample,
  elapsedMs: number
): boolean {
  if (last === null || elapsedMs >= INPUT_HEARTBEAT_MS) return true;
  if (last.sealed !== next.sealed || last.sprint !== next.sprint) return true;
  if (Math.abs(last.x - next.x) > MOVE_EPS || Math.abs(last.y - next.y) > MOVE_EPS) {
    return true;
  }
  return Math.abs(last.facing - next.facing) > FACING_EPS;
}
