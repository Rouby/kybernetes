/**
 * Star-dominated simplified n-body system in display fractions and game
 * seconds. One gravitational parameter rules every orbit (planet
 * perturbations are negligible next to the star and omitted), so periods
 * follow Kepler third law exactly and every velocity is retained,
 * never reset, when vessels switch references.
 */

export interface AstroVec {
  readonly x: number;
  readonly y: number;
}

export interface SystemBody {
  readonly id: string;
  /** Star-centered orbit for planets, planet-centered orbit for moons. */
  readonly radiusFrac: number;
  readonly phase0: number;
  /** Host planet id for moons; undefined for planets. */
  readonly moonOf?: string;
  /** Moon orbital period in seconds (planets use Kepler third law). */
  readonly moonPeriodS?: number;
}

/** Gravitational parameter fit so hub_a period is exactly 150s. */
export const STAR_MU: number = (4 * Math.PI * Math.PI * 0.42 ** 3) / (150 * 150);

/** Body exclusion radius for transit routing (fractions). Wells, not surfaces:
 * keeps torch arcs off third-body markers instead of threading them. */
export const BODY_CLEAR_FRAC = 0.035;

/** Moon well radius (fractions): smaller bodies, tighter wells. */
export const MOON_CLEAR_FRAC = 0.02;

/** Exclusion radius for a body: planet wells are wide, moon wells tight. */
export function clearFracFor(body: Pick<SystemBody, 'moonOf'>): number {
  return body.moonOf !== undefined ? MOON_CLEAR_FRAC : BODY_CLEAR_FRAC;
}

export const SYSTEM_BODIES: readonly SystemBody[] = [
  { id: 'hub_a', radiusFrac: 0.42, phase0: 0.6 },
  { id: 'hub_b', radiusFrac: 0.62, phase0: 2.8 },
  { id: 'hub_c', radiusFrac: 0.34, phase0: 1.9 },
  { id: 'hub_d', radiusFrac: 0.52, phase0: 4.6 },
  { id: 'poi_kestrel', radiusFrac: 0.26, phase0: 4.2 },
  { id: 'poi_vigil', radiusFrac: 0.78, phase0: 1.5 },
  { id: 'poi_lumen', radiusFrac: 0.7, phase0: 0.2 },
  { id: 'poi_nadir', radiusFrac: 0.86, phase0: 2.6 },
  { id: 'moon_wisp', radiusFrac: 0.06, phase0: 1.1, moonOf: 'poi_kestrel', moonPeriodS: 42 },
  { id: 'moon_moth', radiusFrac: 0.06, phase0: 3.3, moonOf: 'poi_vigil', moonPeriodS: 55 },
  { id: 'moon_rill', radiusFrac: 0.055, phase0: 5.0, moonOf: 'poi_lumen', moonPeriodS: 48 },
  { id: 'moon_tarn', radiusFrac: 0.065, phase0: 2.4, moonOf: 'poi_nadir', moonPeriodS: 63 },
];

/** True for planet-centered moon bodies. */
export function isMoon(body: Pick<SystemBody, 'moonOf'>): boolean {
  return body.moonOf !== undefined;
}

export function systemBodyOrDefault(id: string): SystemBody {
  return SYSTEM_BODIES.find((body) => body.id === id) ?? { id, radiusFrac: 0.25, phase0: 0 };
}

/** Kepler period in seconds: outer bodies are stately, as physics demands.
 * Moons keep their own planet-centered period instead. */
export function bodyPeriodS(
  body: Pick<SystemBody, 'radiusFrac' | 'moonOf' | 'moonPeriodS'>
): number {
  if (body.moonOf !== undefined) return Math.max(1, body.moonPeriodS ?? 45);
  return (2 * Math.PI * Math.sqrt(body.radiusFrac ** 3)) / Math.sqrt(STAR_MU);
}

export function bodyAngleAt(body: SystemBody, t: number): number {
  const period = Math.max(1, bodyPeriodS(body));
  return body.phase0 + (Math.PI * 2 * t) / period;
}

function moonHost(body: SystemBody): SystemBody | undefined {
  if (body.moonOf === undefined) return undefined;
  return SYSTEM_BODIES.find((host) => host.id === body.moonOf);
}

export function bodyPosAt(body: SystemBody, t: number): AstroVec {
  const angle = bodyAngleAt(body, t);
  const offset = { x: Math.cos(angle) * body.radiusFrac, y: Math.sin(angle) * body.radiusFrac };
  const host = moonHost(body);
  if (host === undefined) return offset;
  const anchor = bodyPosAt(host, t);
  return { x: anchor.x + offset.x, y: anchor.y + offset.y };
}

export function bodyVelAt(body: SystemBody, t: number): AstroVec {
  const angle = bodyAngleAt(body, t);
  const speed = ((Math.PI * 2) / Math.max(1, bodyPeriodS(body))) * body.radiusFrac;
  const relative = { x: -Math.sin(angle) * speed, y: Math.cos(angle) * speed };
  const host = moonHost(body);
  if (host === undefined) return relative;
  const carried = bodyVelAt(host, t);
  return { x: carried.x + relative.x, y: carried.y + relative.y };
}

/** Stellar gravity acceleration at a star-centered position. */
export function gravityAt(pos: AstroVec): AstroVec {
  const r = Math.max(1e-9, Math.hypot(pos.x, pos.y));
  const g = STAR_MU / (r * r);
  return { x: (-pos.x / r) * g, y: (-pos.y / r) * g };
}
