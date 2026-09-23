/**
 * DJ transition curves: equal-power crossfade plus a pitch-fader tempo
 * glide so the incoming deck syncs to the outgoing deck, then eases home
 * to its own printed BPM. Pure math, no audio.
 */

export const DJ_XFADE_BARS = 8;
export const DJ_XFADE_TICK_MS = 100;
export const DJ_OUTPUT_LEVEL = 0.5;

/** Equal-power [outgoing, incoming] deck levels for blend position k. */
export function crossfadeLevels(k: number): readonly [number, number] {
  const t = Math.max(0, Math.min(1, k));
  return [
    Math.cos((t * Math.PI) / 2) * DJ_OUTPUT_LEVEL,
    Math.sin((t * Math.PI) / 2) * DJ_OUTPUT_LEVEL,
  ];
}

/** Ride the pitch fader from the tempo-match scale back to unity. */
export function tempoGlide(matchScale: number, k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return matchScale + (1 - matchScale) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * EQ bass swap as [outgoingCut, incomingCut]. First half blends mids and
 * highs over the full groove; the swap window (k 0.5-0.65) trades basslines
 * at the phrase midpoint so two kicks never fight.
 */
export function bassSwap(k: number): readonly [number, number] {
  const t = clamp01((k - 0.5) / 0.15);
  return [t, 1 - t];
}
