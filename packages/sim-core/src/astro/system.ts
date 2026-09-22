/**
 * Star-dominated simplified n-body system in display fractions and game
 * seconds. One gravitational parameter rules every orbit (planet
 * perturbations are negligible next to the star and omitted), so periods
 * follow Kepler third law exactly and every velocity is retained,
 * never reset, when vessels switch references.
 *
 * Strike 1: bodies are owned by the universe catalog
 * (universe/catalog.ts). This module derives SYSTEM_BODIES from it and
 * keeps the Kepler math; lookups throw instead of inventing dummy bodies.
 */

import { UNIVERSE_BODIES } from '../universe/catalog.js';
import { requireBody, tryBody } from '../universe/registry.js';

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

/**
 * Derived view over the universe catalog. Do not extend here: add a body
 * to UNIVERSE_BODIES instead so astro, ports, chart, and guidance agree.
 */
export const SYSTEM_BODIES: readonly SystemBody[] = UNIVERSE_BODIES.map((entry) => ({
  id: entry.id as string,
  radiusFrac: entry.radiusFrac,
  phase0: entry.phase0,
  ...(entry.moonOf === undefined ? {} : { moonOf: entry.moonOf as string }),
  ...(entry.moonPeriodS === undefined ? {} : { moonPeriodS: entry.moonPeriodS }),
}));

/** True for planet-centered moon bodies. */
export function isMoon(body: Pick<SystemBody, 'moonOf'>): boolean {
  return body.moonOf !== undefined;
}

/** Throwing lookup; unknown ids throw instead of inventing a dummy orbit. */
export function requireSystemBody(id: string): SystemBody {
  return toSystemBody(requireBody(id));
}

/** Optional lookup for probes that must branch on unknown ids. */
export function trySystemBody(id: string): SystemBody | undefined {
  const found = tryBody(id);
  return found === undefined ? undefined : toSystemBody(found);
}

/**
 * Strike 1 compat: throws on unknown ids (was: dummy {0.25, 0} orbit).
 * Use trySystemBody when unknown ids are expected (UI probes).
 */
export function systemBodyOrDefault(id: string): SystemBody {
  return requireSystemBody(id);
}

function toSystemBody(entry: {
  id: string;
  radiusFrac: number;
  phase0: number;
  moonOf?: string;
  moonPeriodS?: number;
}): SystemBody {
  return {
    id: entry.id,
    radiusFrac: entry.radiusFrac,
    phase0: entry.phase0,
    ...(entry.moonOf === undefined ? {} : { moonOf: entry.moonOf }),
    ...(entry.moonPeriodS === undefined ? {} : { moonPeriodS: entry.moonPeriodS }),
  };
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
