/**
 * Premium impact decals: oriented crater + rim light + scorch falloff.
 * Fresh hits burn (emissive lip), cooled hits go matte, old hits in vacuum
 * glitter with frost. Pure geometry builders are unit-testable; the GL
 * caller only batches vertex arrays. No DOM, no React.
 */

export interface PremiumDecal {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly weapon: string;
  readonly cool: number;
}

export function scorchPalette(weapon: string): {
  scorch: [number, number, number, number];
  rim: [number, number, number, number];
  core: [number, number, number, number];
  glow: [number, number, number, number];
} {
  if (weapon === 'pulse_laser') {
    return {
      scorch: [0.04, 0.1, 0.13, 0.55],
      rim: [0.5, 0.91, 1.0, 0.8],
      core: [0.02, 0.08, 0.1, 0.9],
      glow: [0.78, 0.98, 1.0, 0.9],
    };
  }
  if (weapon === 'arc_welder') {
    return {
      scorch: [0.1, 0.08, 0.05, 0.55],
      rim: [1.0, 0.82, 0.4, 0.8],
      core: [0.08, 0.06, 0.03, 0.9],
      glow: [1.0, 0.95, 0.77, 0.9],
    };
  }
  return {
    scorch: [0.08, 0.09, 0.12, 0.55],
    rim: [0.54, 0.58, 0.65, 0.8],
    core: [0.02, 0.02, 0.04, 0.9],
    glow: [1.0, 0.69, 0.0, 0.9],
  };
}

/** Ellipse radii for an oriented crater: a modest smudge along the tangent. */
export function craterRadii(radius: number): { rx: number; ry: number } {
  return { rx: radius * 1.15, ry: radius * 0.7 };
}

/** Fresh glow alpha from cool 0..1 (emissive -> none). */
export function glowAlphaOf(cool: number): number {
  return Math.max(0, 1 - cool * 2.2);
}

/** Frost alpha for old decals (matte -> glitter). */
export function frostAlphaOf(cool: number): number {
  return Math.max(0, Math.min(1, (cool - 0.55) / 0.45)) * 0.7;
}

/** Partial ellipse arc between angles a0..a1 (radians, local frame). */
export function addArc(
  verts: number[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  a0: number,
  a1: number,
  segments: number,
  thickness: number
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (x: number, y: number): [number, number] => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ];
  let [prevX, prevY] = rot(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
  for (let i = 1; i <= segments; i += 1) {
    const t = a0 + ((a1 - a0) * i) / segments;
    const [nx, ny] = rot(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry);
    addThickSegmentLocal(verts, prevX, prevY, nx, ny, thickness);
    prevX = nx;
    prevY = ny;
  }
}

export interface PitLayers {
  readonly scorch: number[];
  readonly edge: number[];
  readonly core: number[];
  readonly frost: number[];
  readonly glowByWeapon: Map<string, number[]>;
}

export function emptyPitLayers(): PitLayers {
  return { scorch: [], edge: [], core: [], frost: [], glowByWeapon: new Map() };
}

/** Half-size of the dark pit quad: a paint chip, never a crater. */
export function pitHalfSize(radius: number): number {
  return Math.min(2.8, Math.max(1.5, radius * 0.6));
}

/**
 * One believable bullet chip: faint scorch halo, lit upper-edge arc, dark
 * pit quad, weapon-tinted hot pixel while fresh, frost tick once cold.
 * Appends into shared batches — the caller draws each layer once.
 */
export function accumulatePit(
  layers: PitLayers,
  x: number,
  y: number,
  radius: number,
  weapon: string,
  cool: number
): void {
  const { rx, ry } = craterRadii(radius);
  addEllipse(layers.scorch, x, y, rx * 1.15, ry * 1.15, 0, 10, 1);
  addArc(layers.edge, x, y, rx * 0.8, ry * 0.8, 0, Math.PI, Math.PI * 2, 8, 1.2);
  const p = pitHalfSize(radius);
  layers.core.push(x - p, y - p, x + p, y - p, x - p, y + p);
  layers.core.push(x - p, y + p, x + p, y - p, x + p, y + p);
  if (glowAlphaOf(cool) > 0.05) {
    let batch = layers.glowByWeapon.get(weapon);
    if (batch === undefined) {
      batch = [];
      layers.glowByWeapon.set(weapon, batch);
    }
    const g = p * 0.55;
    batch.push(x - g, y - g, x + g, y - g, x - g, y + g);
    batch.push(x - g, y + g, x + g, y - g, x + g, y + g);
  }
  if (frostAlphaOf(cool) > 0.05) {
    addThickSegmentLocal(layers.frost, x - 2, y + rx * 0.9, x + 2, y + rx * 0.9, 1);
  }
}

export function addEllipse(
  verts: number[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  segments: number,
  thickness: number
): void {
  let prevX = cx + Math.cos(0) * rx;
  let prevY = cy + Math.sin(0) * ry;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (x: number, y: number): [number, number] => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ];
  [prevX, prevY] = rot(prevX, prevY);
  for (let i = 1; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    let nx = cx + Math.cos(t) * rx;
    let ny = cy + Math.sin(t) * ry;
    [nx, ny] = rot(nx, ny);
    addThickSegmentLocal(verts, prevX, prevY, nx, ny, thickness);
    prevX = nx;
    prevY = ny;
  }
}

function addThickSegmentLocal(
  verts: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  verts.push(x1 - nx, y1 - ny, x2 - nx, y2 - ny, x1 + nx, y1 + ny);
  verts.push(x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);
}
