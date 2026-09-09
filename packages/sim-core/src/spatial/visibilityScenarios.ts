/**
 * Shared visibility / LoS scenario inputs plus a pure resolver.
 * Zero-DOM and framework-free: every screenshot harness consumes this,
 * so pictures and assertions share one source of truth. All coordinates
 * are deterministic; the ship scenario always picks the longest `ship.*`
 * wall.
 */

import type { WallSegment } from '@kybernetes/protocol';
import { hasLineOfSight } from '../world/los.js';
import type { Point2D } from './collision.js';
import { HESPERIA_WALLS } from './deck.js';
import {
  carveWallsByFrame,
  computeVisibilityPolygon,
  type FramedBreachSegment,
} from './visibility.js';

export const SHOT_RADIUS = 300;
export const SHOT_STEPS = 72;

export interface SvgProbe {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly label?: string;
}

export interface SvgBreach {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly sizeClass: 'puncture' | 'breach';
}

export interface SvgViewport {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface VisibilitySnapshot {
  readonly title: string;
  /** Pre-carve walls (dim dashed underlay: gaps show through here). */
  readonly walls: readonly WallSegment[];
  /** Post-carve rendered walls (solid overlay). Defaults to walls. */
  readonly carvedWalls?: readonly WallSegment[];
  readonly breaches: readonly SvgBreach[];
  readonly origin: Point2D;
  readonly facing?: number;
  readonly polygon: readonly Point2D[];
  readonly probes: readonly SvgProbe[];
  readonly viewport: SvgViewport;
}

/** Shoelace area (absolute px^2) for polygon-size assertions. */
export function polygonArea(poly: readonly Point2D[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a === undefined || b === undefined) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface ShotProbeInput {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface ShotInput {
  readonly name: string;
  readonly title: string;
  readonly walls: readonly WallSegment[];
  /** Area-carrying cuts: the puncture carve filter applies here. */
  readonly breaches: readonly FramedBreachSegment[];
  /** Render dressing for the breach (dash vs solid). */
  readonly svgBreaches: readonly SvgBreach[];
  readonly origin: { x: number; y: number };
  readonly probeInputs: readonly ShotProbeInput[];
  readonly viewport: SvgViewport;
}

function shotWall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, x1, y1, x2, y2 };
}

function shotBox(x: number, y: number, w: number, h: number): WallSegment[] {
  return [
    shotWall('box.n', x, y, x + w, y),
    shotWall('box.e', x + w, y, x + w, y + h),
    shotWall('box.s', x, y + h, x + w, y + h),
    shotWall('box.w', x, y, x, y + h),
  ];
}

function shotView(x: number, y: number, w: number, h: number): SvgViewport {
  return { x, y, w, h };
}

function roomView(): SvgViewport {
  return shotView(-20, -30, 240, 250);
}

/** Vertical range wall plus eye placement used by the wall/breach shots. */
function walledRoom(): { walls: WallSegment[]; origin: { x: number; y: number } } {
  return {
    walls: [...shotBox(0, 0, 200, 200), shotWall('mid', 100, 0, 100, 200)],
    origin: { x: 50, y: 100 },
  };
}

function wallLen(w: WallSegment): number {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

/** 24px combat-style cut centered on the wall midpoint, aligned to the wall. */
function breachSegOn(
  target: WallSegment,
  mid: { x: number; y: number }
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = target.x2 - target.x1;
  const dy = target.y2 - target.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: mid.x - ux * 12, y1: mid.y - uy * 12, x2: mid.x + ux * 12, y2: mid.y + uy * 12 };
}

function roomShots(): ShotInput[] {
  const { walls, origin } = walledRoom();
  const jambs = [shotWall('door.n', 100, 0, 100, 80), shotWall('door.s', 100, 120, 100, 200)];
  const openWalls = [...shotBox(0, 0, 200, 200), ...jambs];
  const shutWalls = [...openWalls, shotWall('door.leaf', 100, 80, 100, 120)];
  const cut = { x1: 100, y1: 88, x2: 100, y2: 112 };
  return [
    {
      name: 's1-empty-box',
      title: 's1 empty box: all probes visible',
      walls: shotBox(0, 0, 200, 200),
      breaches: [],
      svgBreaches: [],
      origin: { x: 100, y: 100 },
      probeInputs: [
        { x: 180, y: 100, label: 'E' },
        { x: 20, y: 20, label: 'NW' },
      ],
      viewport: roomView(),
    },
    {
      name: 's2-wall-blocks',
      title: 's2 wall blocks: behind=red hidden, clear=green',
      walls,
      breaches: [],
      svgBreaches: [],
      origin,
      probeInputs: [
        { x: 150, y: 100, label: 'behind' },
        { x: 50, y: 50, label: 'clear' },
      ],
      viewport: roomView(),
    },
    {
      name: 's3a-door-open',
      title: 's3a doorway OPEN: thru=green',
      walls: openWalls,
      breaches: [],
      svgBreaches: [],
      origin,
      probeInputs: [{ x: 150, y: 100, label: 'thru' }],
      viewport: roomView(),
    },
    {
      name: 's3b-door-shut',
      title: 's3b doorway SHUT: thru=red hidden',
      walls: shutWalls,
      breaches: [],
      svgBreaches: [],
      origin,
      probeInputs: [{ x: 150, y: 100, label: 'thru' }],
      viewport: roomView(),
    },
    {
      name: 's4-puncture-holds',
      title: 's4 puncture 0.05: wall holds, behind=red (dashed=solid, no gap)',
      walls,
      breaches: [{ ...cut, areaM2: 0.05 }],
      svgBreaches: [{ ...cut, sizeClass: 'puncture' }],
      origin,
      probeInputs: [{ x: 150, y: 100, label: 'behind' }],
      viewport: roomView(),
    },
    {
      name: 's5-breach-opens',
      title: 's5 breach 0.6: gap=green visible, off-gap=red',
      walls,
      breaches: [{ ...cut, areaM2: 0.6 }],
      svgBreaches: [{ ...cut, sizeClass: 'breach' }],
      origin,
      probeInputs: [
        { x: 150, y: 100, label: 'gap' },
        { x: 150, y: 170, label: 'wall' },
      ],
      viewport: roomView(),
    },
  ];
}

function shipShots(): ShotInput[] {
  const shipWalls = HESPERIA_WALLS.filter((w) => w.id.startsWith('ship.'));
  const target = [...shipWalls].sort((a, b) => wallLen(b) - wallLen(a))[0];
  if (target === undefined) throw new Error('no ship wall found');
  const mid = { x: (target.x1 + target.x2) / 2, y: (target.y1 + target.y2) / 2 };
  const dx = target.x2 - target.x1;
  const dy = target.y2 - target.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const local = [target, ...shotBox(mid.x - 120, mid.y - 120, 240, 240)];
  const origin = { x: mid.x - nx * 40, y: mid.y - ny * 40 };
  const beyond = { x: mid.x + nx * 40, y: mid.y + ny * 40 };
  const seg = breachSegOn(target, mid);
  const pad = 30;
  const viewport = shotView(mid.x - 120 - pad, mid.y - 120 - pad, 240 + pad * 2, 240 + pad * 2);
  const probeInputs = [{ x: beyond.x, y: beyond.y, label: 'beyond' }];
  return [
    {
      name: 's6a-ship-intact',
      title: `s6a ship ${target.id}: intact, beyond=red`,
      walls: local,
      breaches: [],
      svgBreaches: [],
      origin,
      probeInputs,
      viewport,
    },
    {
      name: 's6b-ship-puncture',
      title: `s6b ship ${target.id}: puncture holds, beyond=red`,
      walls: local,
      breaches: [{ ...seg, areaM2: 0.05 }],
      svgBreaches: [{ ...seg, sizeClass: 'puncture' }],
      origin,
      probeInputs,
      viewport,
    },
    {
      name: 's6c-ship-breach',
      title: `s6c ship ${target.id}: breach opens, beyond=green`,
      walls: local,
      breaches: [{ ...seg, areaM2: 0.6 }],
      svgBreaches: [{ ...seg, sizeClass: 'breach' }],
      origin,
      probeInputs,
      viewport,
    },
  ];
}

/**
 * Three-room enfilade: sight reaches the middle room through an open
 * doorway but stops at the shut wall guarding the far room.
 */
function chainShots(): ShotInput[] {
  const walls = [
    ...shotBox(0, 0, 320, 200),
    shotWall('chain.open.n', 110, 0, 110, 80),
    shotWall('chain.open.s', 110, 120, 110, 200),
    shotWall('chain.shut', 210, 0, 210, 200),
  ];
  return [
    {
      name: 's7-door-chain',
      title: 's7 door chain: mid=green thru open door, far=red behind shut wall',
      walls,
      breaches: [],
      svgBreaches: [],
      origin: { x: 50, y: 100 },
      probeInputs: [
        { x: 160, y: 100, label: 'mid' },
        { x: 260, y: 100, label: 'far' },
        { x: 50, y: 160, label: 'home' },
      ],
      viewport: shotView(-20, -30, 360, 250),
    },
  ];
}

/**
 * Twin breached bulkheads: aligned gaps let sight through both walls,
 * staggered gaps stop it at the second wall. Directly models sustained
 * fire punching a firing lane through a ship.
 */
function breachPairShots(): ShotInput[] {
  const walls = [
    ...shotBox(0, 0, 260, 200),
    shotWall('twin.west', 100, 0, 100, 200),
    shotWall('twin.east', 160, 0, 160, 200),
  ];
  const origin = { x: 50, y: 100 };
  const gapMid = { x1: 100, y1: 88, x2: 100, y2: 112 };
  const gapHigh = { x1: 160, y1: 88, x2: 160, y2: 112 };
  const gapLow = { x1: 160, y1: 148, x2: 160, y2: 172 };
  const viewport = shotView(-20, -30, 300, 250);
  return [
    {
      name: 's8a-aligned-breaches',
      title: 's8a aligned gaps: thru=green, side=red',
      walls,
      breaches: [
        { ...gapMid, areaM2: 0.6 },
        { ...gapHigh, areaM2: 0.6 },
      ],
      svgBreaches: [
        { ...gapMid, sizeClass: 'breach' },
        { ...gapHigh, sizeClass: 'breach' },
      ],
      origin,
      probeInputs: [
        { x: 210, y: 100, label: 'thru' },
        { x: 210, y: 170, label: 'side' },
      ],
      viewport,
    },
    {
      name: 's8b-staggered-breaches',
      title: 's8b staggered gaps: beyond all red, between green',
      walls,
      breaches: [
        { ...gapMid, areaM2: 0.6 },
        { ...gapLow, areaM2: 0.6 },
      ],
      svgBreaches: [
        { ...gapMid, sizeClass: 'breach' },
        { ...gapLow, sizeClass: 'breach' },
      ],
      origin,
      probeInputs: [
        { x: 210, y: 100, label: 'far' },
        { x: 210, y: 160, label: 'low' },
        { x: 130, y: 100, label: 'between' },
      ],
      viewport,
    },
  ];
}

/** All twelve deterministic shots: rooms, live ship wall, then complexes. */
export function scenarioInputs(): ShotInput[] {
  return [...roomShots(), ...shipShots(), ...chainShots(), ...breachPairShots()];
}

/** Carve walls, cast the fan, and resolve probe visibility for one shot. */
export function resolveShot(input: ShotInput): VisibilitySnapshot {
  const carved = carveWallsByFrame(input.walls, input.breaches);
  const blockers = carved
    .filter((w) => w.isOpaque !== false)
    .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }));
  const polygon = computeVisibilityPolygon(input.origin, SHOT_RADIUS, carved, SHOT_STEPS);
  const probes = input.probeInputs.map((p) => ({
    ...p,
    visible: hasLineOfSight(blockers, input.origin, { x: p.x, y: p.y }),
  }));
  return {
    title: input.title,
    walls: input.walls,
    carvedWalls: carved,
    breaches: input.svgBreaches,
    origin: input.origin,
    polygon,
    probes,
    viewport: input.viewport,
  };
}
