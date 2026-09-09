/** Parse harbor HUD readout numbers (`x:123`, `sx:45`, `face:90`, `room:bridge`). */
export function statX(text: string): number {
  return Number(/x:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function statSX(text: string): number {
  return Number(/sx:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function statFace(text: string): number {
  return Number(/face:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function statRoom(text: string): string {
  return /room:([A-Za-z_]+)/.exec(text)?.[1] ?? '';
}
