/**
 * Menu starfield: deterministic star generation plus per-frame drift.
 * Pure math so Vitest pins the wrap behavior; the canvas backdrop stays thin.
 */

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tw: number;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStars(seed: number, count: number, width: number, height: number): Star[] {
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  const total = Math.max(0, Math.floor(count));
  for (let i = 0; i < total; i += 1) {
    stars.push({
      x: rand() * width,
      y: rand() * height,
      z: 0.25 + rand() * 0.75,
      tw: rand() * Math.PI * 2,
    });
  }
  return stars;
}

export function driftStars(
  stars: readonly Star[],
  dtSeconds: number,
  width: number,
  speed = 14
): Star[] {
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 0.1) : 0;
  return stars.map((star) => {
    let x = star.x - speed * star.z * dt;
    if (x < 0) x += width;
    return { x, y: star.y, z: star.z, tw: star.tw + dt * 2 };
  });
}
