/**
 * Unit-screenshot tests for visibility / LoS.
 * Each scenario asserts the sight invariant AND writes a deterministic SVG
 * to test-results/visibility/ for human eyeball comparison:
 *   yarn test:visibility (or this half alone with yarn --cwd packages/sim-core test visibilitySnapshots)
 * Open the SVGs in a browser. Legend: yellow fan = LoS polygon, cyan = eye,
 * green/red = visible/hidden probes, dashed gray = pre-carve wall (a gap
 * with no solid cover means something carved sight unexpectedly).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WallSegment } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { hasLineOfSight, type SightSegment } from '../world/los.js';
import { HESPERIA_WALLS } from './deck.js';
import { isPointInPolygon } from './fogOfWar.js';
import {
  carveWallsByFrame,
  computeVisibilityPolygon,
  type FramedBreachSegment,
} from './visibility.js';
import {
  polygonArea,
  renderVisibilitySvg,
  type SvgBreach,
  type SvgProbe,
  type SvgViewport,
  type VisibilitySnapshot,
} from './visibilitySvg.js';

const OUT_DIR = fileURLToPath(new URL('../../test-results/visibility', import.meta.url));
const RADIUS = 300;
const STEPS = 72;

function writeSvg(name: string, svg: string): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.svg`);
  writeFileSync(file, svg, 'utf8');
  return file;
}

function wall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, x1, y1, x2, y2 };
}

function box(x: number, y: number, w: number, h: number): WallSegment[] {
  return [
    wall('box.n', x, y, x + w, y),
    wall('box.e', x + w, y, x + w, y + h),
    wall('box.s', x, y + h, x + w, y + h),
    wall('box.w', x, y, x, y + h),
  ];
}

function blockersOf(walls: readonly WallSegment[]): SightSegment[] {
  return walls
    .filter((w) => w.isOpaque !== false)
    .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }));
}

function probe(
  x: number,
  y: number,
  label: string,
  from: { x: number; y: number },
  blockers: readonly SightSegment[]
): SvgProbe {
  return { x, y, label, visible: hasLineOfSight(blockers, from, { x, y }) };
}

function view(x: number, y: number, w: number, h: number): SvgViewport {
  return { x, y, w, h };
}

function snapShot(snap: VisibilitySnapshot, name: string): string {
  const svg = renderVisibilitySvg(snap);
  const file = writeSvg(name, svg);
  console.log(`[visibility-snapshot] ${name} -> ${file}`);
  expect(svg).toMatchSnapshot(name);
  return svg;
}

/** Vertical range wall plus a probe straight through it and one clear of it. */
function walledRoom(): { walls: WallSegment[]; origin: { x: number; y: number } } {
  return {
    walls: [...box(0, 0, 200, 200), wall('mid', 100, 0, 100, 200)],
    origin: { x: 50, y: 100 },
  };
}

describe('visibility snapshots', () => {
  it('s1: empty box sees everything', () => {
    const walls = box(0, 0, 200, 200);
    const origin = { x: 100, y: 100 };
    const blockers = blockersOf(walls);
    const polygon = computeVisibilityPolygon(origin, RADIUS, walls, STEPS);
    const probes = [probe(180, 100, 'E', origin, blockers), probe(20, 20, 'NW', origin, blockers)];
    expect(probes.every((p) => p.visible)).toBe(true);
    expect(probes.every((p) => isPointInPolygon({ x: p.x, y: p.y }, polygon))).toBe(true);
    snapShot(
      {
        title: 's1 empty box: all probes visible',
        walls,
        breaches: [],
        origin,
        polygon,
        probes,
        viewport: view(-20, -30, 240, 250),
      },
      's1-empty-box'
    );
  });

  it('s2: solid wall hides what is behind it', () => {
    const { walls, origin } = walledRoom();
    const blockers = blockersOf(walls);
    const polygon = computeVisibilityPolygon(origin, RADIUS, walls, STEPS);
    const behind = probe(150, 100, 'behind', origin, blockers);
    const clear = probe(50, 50, 'clear', origin, blockers);
    expect(clear.visible).toBe(true);
    expect(behind.visible).toBe(false);
    expect(isPointInPolygon({ x: 150, y: 100 }, polygon)).toBe(false);
    expect(polygonArea(polygon)).toBeLessThan(Math.PI * RADIUS * RADIUS * 0.5);
    snapShot(
      {
        title: 's2 wall blocks: behind=red hidden, clear=green',
        walls,
        breaches: [],
        origin,
        polygon,
        probes: [behind, clear],
        viewport: view(-20, -30, 240, 250),
      },
      's2-wall-blocks'
    );
  });

  it('s3: doorway open sees through, shut does not', () => {
    const origin = { x: 50, y: 100 };
    const jambs = [wall('door.n', 100, 0, 100, 80), wall('door.s', 100, 120, 100, 200)];
    const openWalls = [...box(0, 0, 200, 200), ...jambs];
    const shutWalls = [...openWalls, wall('door.leaf', 100, 80, 100, 120)];
    const openPoly = computeVisibilityPolygon(origin, RADIUS, openWalls, STEPS);
    const shutPoly = computeVisibilityPolygon(origin, RADIUS, shutWalls, STEPS);
    const openProbe = probe(150, 100, 'thru', origin, blockersOf(openWalls));
    const shutProbe = probe(150, 100, 'thru', origin, blockersOf(shutWalls));
    expect(openProbe.visible).toBe(true);
    expect(shutProbe.visible).toBe(false);
    expect(polygonArea(openPoly)).toBeGreaterThan(polygonArea(shutPoly));
    snapShot(
      {
        title: 's3a doorway OPEN: thru=green',
        walls: openWalls,
        breaches: [],
        origin,
        polygon: openPoly,
        probes: [openProbe],
        viewport: view(-20, -30, 240, 250),
      },
      's3a-door-open'
    );
    snapShot(
      {
        title: 's3b doorway SHUT: thru=red hidden',
        walls: shutWalls,
        breaches: [],
        origin,
        polygon: shutPoly,
        probes: [shutProbe],
        viewport: view(-20, -30, 240, 250),
      },
      's3b-door-shut'
    );
  });

  it('s4: bullet puncture must NOT open sight (the shooting-walls bug)', () => {
    const { walls, origin } = walledRoom();
    const puncture: FramedBreachSegment = { x1: 100, y1: 88, x2: 100, y2: 112, areaM2: 0.05 };
    const carved = carveWallsByFrame(walls, [puncture]);
    expect(carved.length).toBe(walls.length);
    const intactPoly = computeVisibilityPolygon(origin, RADIUS, walls, STEPS);
    const nickedPoly = computeVisibilityPolygon(origin, RADIUS, carved, STEPS);
    const hidden = probe(150, 100, 'behind', origin, blockersOf(carved));
    expect(hidden.visible).toBe(false);
    expect(isPointInPolygon({ x: 150, y: 100 }, nickedPoly)).toBe(false);
    expect(
      Math.abs(polygonArea(nickedPoly) - polygonArea(intactPoly)) / polygonArea(intactPoly)
    ).toBeLessThan(0.02);
    const svgBreach: SvgBreach = { x1: 100, y1: 88, x2: 100, y2: 112, sizeClass: 'puncture' };
    snapShot(
      {
        title: 's4 puncture 0.05: wall holds, behind=red (dashed=solid, no gap)',
        walls,
        carvedWalls: carved,
        breaches: [svgBreach],
        origin,
        polygon: nickedPoly,
        probes: [hidden],
        viewport: view(-20, -30, 240, 250),
      },
      's4-puncture-holds'
    );
  });

  it('s5: grown breach MUST open sight through the gap', () => {
    const { walls, origin } = walledRoom();
    const breach: FramedBreachSegment = { x1: 100, y1: 88, x2: 100, y2: 112, areaM2: 0.6 };
    const carved = carveWallsByFrame(walls, [breach]);
    expect(carved.length).toBeGreaterThan(walls.length);
    const intactPoly = computeVisibilityPolygon(origin, RADIUS, walls, STEPS);
    const tornPoly = computeVisibilityPolygon(origin, RADIUS, carved, STEPS);
    const seen = probe(150, 100, 'gap', origin, blockersOf(carved));
    const beside = probe(150, 170, 'wall', origin, blockersOf(carved));
    expect(seen.visible).toBe(true);
    expect(beside.visible).toBe(false);
    expect(isPointInPolygon({ x: 150, y: 100 }, tornPoly)).toBe(true);
    expect(polygonArea(tornPoly)).toBeGreaterThan(polygonArea(intactPoly));
    const svgBreach: SvgBreach = { x1: 100, y1: 88, x2: 100, y2: 112, sizeClass: 'breach' };
    snapShot(
      {
        title: 's5 breach 0.6: gap=green visible, off-gap=red',
        walls,
        carvedWalls: carved,
        breaches: [svgBreach],
        origin,
        polygon: tornPoly,
        probes: [seen, beside],
        viewport: view(-20, -30, 240, 250),
      },
      's5-breach-opens'
    );
  });

  it('s6: live ship wall holds punctures, yields to breaches', () => {
    const shipWalls = HESPERIA_WALLS.filter((w) => w.id.startsWith('ship.'));
    const target = [...shipWalls].sort((a, b) => wallLen(b) - wallLen(a))[0];
    if (target === undefined) throw new Error('no ship wall found');
    const mid = { x: (target.x1 + target.x2) / 2, y: (target.y1 + target.y2) / 2 };
    const dx = target.x2 - target.x1;
    const dy = target.y2 - target.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const local = [target, ...box(mid.x - 120, mid.y - 120, 240, 240)];
    const origin = { x: mid.x - nx * 40, y: mid.y - ny * 40 };
    const beyond = { x: mid.x + nx * 40, y: mid.y + ny * 40 };
    const seg = breachSegOn(target, mid);
    const intactPoly = computeVisibilityPolygon(origin, RADIUS, local, STEPS);
    const nickedWalls = carveWallsByFrame(local, [{ ...seg, areaM2: 0.05 }]);
    const tornWalls = carveWallsByFrame(local, [{ ...seg, areaM2: 0.6 }]);
    const nickedPoly = computeVisibilityPolygon(origin, RADIUS, nickedWalls, STEPS);
    const tornPoly = computeVisibilityPolygon(origin, RADIUS, tornWalls, STEPS);
    expect(hasLineOfSight(blockersOf(local), origin, beyond)).toBe(false);
    expect(hasLineOfSight(blockersOf(nickedWalls), origin, beyond)).toBe(false);
    expect(hasLineOfSight(blockersOf(tornWalls), origin, beyond)).toBe(true);
    const pad = 30;
    const viewport = view(mid.x - 120 - pad, mid.y - 120 - pad, 240 + pad * 2, 240 + pad * 2);
    snapShot(
      {
        title: `s6a ship ${target.id}: intact, beyond=red`,
        walls: local,
        carvedWalls: local,
        breaches: [],
        origin,
        polygon: intactPoly,
        probes: [probe(beyond.x, beyond.y, 'beyond', origin, blockersOf(local))],
        viewport,
      },
      's6a-ship-intact'
    );
    snapShot(
      {
        title: `s6b ship ${target.id}: puncture holds, beyond=red`,
        walls: local,
        carvedWalls: nickedWalls,
        breaches: [{ ...seg, sizeClass: 'puncture' }],
        origin,
        polygon: nickedPoly,
        probes: [probe(beyond.x, beyond.y, 'beyond', origin, blockersOf(nickedWalls))],
        viewport,
      },
      's6b-ship-puncture'
    );
    snapShot(
      {
        title: `s6c ship ${target.id}: breach opens, beyond=green`,
        walls: local,
        carvedWalls: tornWalls,
        breaches: [{ ...seg, sizeClass: 'breach' }],
        origin,
        polygon: tornPoly,
        probes: [probe(beyond.x, beyond.y, 'beyond', origin, blockersOf(tornWalls))],
        viewport,
      },
      's6c-ship-breach'
    );
  });
});

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
