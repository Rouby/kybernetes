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
  readonly radiusFrac: number;
  readonly phase0: number;
}

/** Gravitational parameter fit so hub_a period is exactly 150s. */
export const STAR_MU: number = (4 * Math.PI * Math.PI * 0.42 ** 3) / (150 * 150);

export const SYSTEM_BODIES: readonly SystemBody[] = [
  { id: 'hub_a', radiusFrac: 0.42, phase0: 0.6 },
  { id: 'hub_b', radiusFrac: 0.62, phase0: 2.8 },
  { id: 'poi_kestrel', radiusFrac: 0.26, phase0: 4.2 },
  { id: 'poi_vigil', radiusFrac: 0.78, phase0: 1.5 },
];

export function systemBodyOrDefault(id: string): SystemBody {
  return SYSTEM_BODIES.find((body) => body.id === id) ?? { id, radiusFrac: 0.25, phase0: 0 };
}

/** Kepler period in seconds: outer bodies are stately, as physics demands. */
export function bodyPeriodS(body: Pick<SystemBody, 'radiusFrac'>): number {
  return (2 * Math.PI * Math.sqrt(body.radiusFrac ** 3)) / Math.sqrt(STAR_MU);
}

export function bodyAngleAt(body: SystemBody, t: number): number {
  const period = Math.max(1, bodyPeriodS(body));
  return body.phase0 + (Math.PI * 2 * t) / period;
}

export function bodyPosAt(body: SystemBody, t: number): AstroVec {
  const angle = bodyAngleAt(body, t);
  return { x: Math.cos(angle) * body.radiusFrac, y: Math.sin(angle) * body.radiusFrac };
}

export function bodyVelAt(body: SystemBody, t: number): AstroVec {
  const angle = bodyAngleAt(body, t);
  const speed = ((Math.PI * 2) / Math.max(1, bodyPeriodS(body))) * body.radiusFrac;
  return { x: -Math.sin(angle) * speed, y: Math.cos(angle) * speed };
}

/** Stellar gravity acceleration at a star-centered position. */
export function gravityAt(pos: AstroVec): AstroVec {
  const r = Math.max(1e-9, Math.hypot(pos.x, pos.y));
  const g = STAR_MU / (r * r);
  return { x: (-pos.x / r) * g, y: (-pos.y / r) * g };
}
