/**
 * Pawn accent colors: pure translation from v2 appearance presets to
 * renderer RGB. The WebGL pawn pass consumes these; Vitest covers the
 * tables and fallbacks so canvas output stays deterministic.
 */

import type { PawnTrim, ThrusterTint } from '@kybernetes/protocol';

export type AccentRgb = readonly [number, number, number];

export const TRIM_ACCENTS: Record<PawnTrim, AccentRgb> = {
  ember: [1.0, 0.55, 0.1],
  ion: [0.0, 0.92, 1.0],
  verdant: [0.25, 1.0, 0.45],
  mono: [0.92, 0.94, 1.0],
};

export const THRUSTER_PLUMES: Record<ThrusterTint, AccentRgb> = {
  cyan: [0.0, 0.95, 1.0],
  amber: [1.0, 0.65, 0.15],
  violet: [0.7, 0.35, 1.0],
  white: [0.95, 0.97, 1.0],
};

/** Trim accent for shoulder chevrons; undefined keeps the legacy role color. */
export function trimAccent(trim: unknown): AccentRgb | undefined {
  if (trim === 'ember') return TRIM_ACCENTS.ember;
  if (trim === 'ion') return TRIM_ACCENTS.ion;
  if (trim === 'verdant') return TRIM_ACCENTS.verdant;
  if (trim === 'mono') return TRIM_ACCENTS.mono;
  return undefined;
}

/** Thruster plume tint; unknown presets fall back to cyan exhaust. */
export function thrusterPlume(tint: unknown): AccentRgb {
  if (tint === 'amber') return THRUSTER_PLUMES.amber;
  if (tint === 'violet') return THRUSTER_PLUMES.violet;
  if (tint === 'white') return THRUSTER_PLUMES.white;
  return THRUSTER_PLUMES.cyan;
}
