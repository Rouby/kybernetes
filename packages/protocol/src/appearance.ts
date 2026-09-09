/**
 * Pawn appearance: purely cosmetic identity for the diegetic menu terminal
 * and WebGL pawn renderer. Never affects sim math, collisions, or combat.
 * JSON-safe plain data only.
 */

export const PAWN_TRIMS = ['ember', 'ion', 'verdant', 'mono'] as const;

export type PawnTrim = (typeof PAWN_TRIMS)[number];

export const THRUSTER_TINTS = ['cyan', 'amber', 'violet', 'white'] as const;

export type ThrusterTint = (typeof THRUSTER_TINTS)[number];

export interface PawnAppearance {
  readonly trim: PawnTrim;
  readonly thruster: ThrusterTint;
}

export const DEFAULT_APPEARANCE: PawnAppearance = { trim: 'ember', thruster: 'cyan' };

export function isPawnTrim(value: unknown): value is PawnTrim {
  return value === 'ember' || value === 'ion' || value === 'verdant' || value === 'mono';
}

export function isThrusterTint(value: unknown): value is ThrusterTint {
  return value === 'cyan' || value === 'amber' || value === 'violet' || value === 'white';
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeAppearance(value: {
  readonly trim?: unknown;
  readonly thruster?: unknown;
}): PawnAppearance {
  const trim = isPawnTrim(value.trim) ? value.trim : DEFAULT_APPEARANCE.trim;
  const thruster = isThrusterTint(value.thruster) ? value.thruster : DEFAULT_APPEARANCE.thruster;
  return { trim, thruster };
}
