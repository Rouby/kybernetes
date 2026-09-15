import type {
  ChartStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
} from '@kybernetes/protocol';
import { bodyPeriodS, planTripLeg, systemBodyOrDefault, torchAccel } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import {
  appendDraft,
  chartLayoutRects,
  chartMapView,
  previewCourse,
  previewStopsFor,
  smoothSimClock,
} from './chartModel';

const W = 1280;
const H = 720;
const HUB_B_PERIOD_S = bodyPeriodS(systemBodyOrDefault('hub_b'));

function ghostWindow(stops: readonly string[], thrust01: number): number {
  let total = 0;
  let from = 'hub_a';
  for (const to of stops) {
    const hop = planTripLeg(from, to, torchAccel(0, thrust01), total);
    total += hop?.totalS ?? 0;
    from = to;
  }
  return total;
}

function nav(over: Partial<NavStateBroadcast> = {}): NavStateBroadcast {
  return {
    type: 'NAV_STATE',
    v: 2,
    tick: 10,
    serverTimeMs: 1000,
    vesselId: 'ship',
    phase: 'docked',
    destHubId: undefined,
    remainingS: 0,
    legId: 0,
    portHubId: 'hub_a',
    flameout: false,
    hailS: 0,
    stops: [],
    legIndex: 0,
    ...over,
  };
}

function chart(knownPois: readonly string[] = []): ChartStateBroadcast {
  const known = new Set(['hub_a', 'hub_b', ...knownPois]);
  const node = (
    id: string,
    kind: string,
    label: string,
    short: string,
    rumor?: string
  ): ChartStateBroadcast['nodes'][number] => ({
    id,
    kind,
    label,
    short,
    ...(rumor === undefined ? {} : { rumor }),
    known: known.has(id),
  });
  return {
    type: 'CHART_STATE',
    v: 2,
    tick: 1,
    serverTimeMs: 1000,
    vesselId: 'ship',
    nodes: [
      node('hub_a', 'hub', 'NEW ANCHORAGE', 'ANCHORAGE'),
      node('hub_b', 'hub', 'KEPLER YARD', 'KEPLER'),
      node('poi_kestrel', 'poi', 'DERELICT "KESTREL"', 'KESTREL', 'Distress echo.'),
      node('poi_vigil', 'poi', 'BEACON "VIGIL"', 'VIGIL', 'Cache pings.'),
    ],
  };
}

function status(): ShipStatusBroadcast {
  return {
    type: 'SHIP_STATUS',
    v: 2,
    tick: 10,
    serverTimeMs: 1000,
    shipId: 'ship:u1',
    hullId: 'skiff_alpha',
    reactorTier: 0,
    engineTier: 0,
    credits: 20,
    condition: 100,
    locationHubId: 'hub_a',
    alive: true,
    stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 2 },
  };
}

describe('chartLayoutRects', () => {
  it('keeps the map left of the legend inside visor margins', () => {
    const { map, legend } = chartLayoutRects(W, H);
    expect(legend.x).toBeGreaterThan(map.x + map.w);
    expect(map.y).toBeGreaterThanOrEqual(106);
    expect(legend.y).toBe(map.y);
    expect(map.x + map.w + legend.w).toBeLessThanOrEqual(W);
  });

  it('stays finite on degenerate viewports', () => {
    const { map, legend } = chartLayoutRects(320, 320);
    for (const rect of [map, legend]) {
      for (const value of [rect.x, rect.y, rect.w, rect.h]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

function rotated(
  center: { x: number; y: number },
  at: { x: number; y: number },
  turns: number
): { x: number; y: number } {
  const a = turns * Math.PI * 2;
  const dx = at.x - center.x;
  const dy = at.y - center.y;
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

function expectRouteSteps(route: readonly { x: number; y: number }[]): void {
  // Segments render as chords; the guard catches torn joints (100px+), not
  // sparse sampling on fast chase legs.
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (a === undefined || b === undefined) throw new Error('route point missing');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(90);
  }
}

describe('previewStopsFor', () => {
  it('maps node buttons to drafted stops', () => {
    expect(previewStopsFor('plot:hub_b', 'hub_a')).toEqual(['hub_b']);
    expect(previewStopsFor('via:poi_kestrel', 'hub_a')).toEqual(['poi_kestrel']);
    expect(previewStopsFor('via:poi_kestrel', 'hub_b')).toEqual(['poi_kestrel']);
    expect(previewStopsFor('via:hub_a', 'hub_a')).toBeNull();
    expect(previewStopsFor('plot:hub_a', 'hub_a')).toBeNull();
    expect(previewStopsFor('plot:', 'hub_a')).toBeNull();
    expect(previewStopsFor('via:', 'hub_a')).toBeNull();
    expect(previewStopsFor('close', 'hub_a')).toBeNull();
    expect(previewStopsFor('cancel', 'hub_a')).toBeNull();
  });
});

describe('appendDraft', () => {
  it('chains clicks and ignores repeats of the tail', () => {
    expect(appendDraft(null, ['poi_kestrel'])).toEqual(['poi_kestrel']);
    expect(appendDraft(['poi_kestrel'], ['hub_b'])).toEqual(['poi_kestrel', 'hub_b']);
    expect(appendDraft(['poi_kestrel'], ['poi_kestrel'])).toEqual(['poi_kestrel']);
    expect(appendDraft(['hub_b'], [])).toEqual(['hub_b']);
  });
});

describe('previewCourse', () => {
  it('projects time and fuel for a drafted detour', () => {
    const preview = previewCourse(['poi_kestrel', 'hub_b'], nav(), status(), null, chart());
    expect(preview).toMatchObject({
      routeLabel: '??>KEPLER',
      totalS: 53,
      fuelNeeded: 2,
      fuelCells: 2,
      heatRisk: false,
    });
    expect(preview?.stops).toEqual(['poi_kestrel', 'hub_b']);
  });

  it('scales time and fuel with draft throttle', () => {
    const slow = previewCourse(['poi_kestrel', 'hub_b'], nav(), status(), null, chart(), 0.5);
    expect(slow).toMatchObject({ thrustPct: 50, totalS: 146, fuelNeeded: 1 });
    const full = previewCourse(['poi_kestrel', 'hub_b'], nav(), status(), null, chart());
    expect(full).toMatchObject({ thrustPct: 100, totalS: 53, fuelNeeded: 2 });
  });

  it('projects a direct hop without a via leg', () => {
    const preview = previewCourse(['hub_b'], nav(), status(), null, chart());
    expect(preview).toMatchObject({ routeLabel: 'KEPLER', totalS: 33 });
  });

  it('rejects empty, underway, and unknown drafts', () => {
    expect(previewCourse([], nav(), status(), null, chart())).toBeNull();
    expect(previewCourse(['hub_b'], null, status(), null, chart())).toBeNull();
    expect(
      previewCourse(['hub_b'], nav({ phase: 'in_transit' }), status(), null, chart())
    ).toBeNull();
    expect(previewCourse(['nowhere'], nav(), status(), null, chart())).toBeNull();
  });
});

describe('chartMapView', () => {
  it('is deterministic per timestamp and animates orbits', () => {
    const a = chartMapView(nav(), chart(), status(), W, H, 12);
    const b = chartMapView(nav(), chart(), status(), W, H, 12);
    expect(a.nodes.map((node) => [node.x, node.y])).toEqual(
      b.nodes.map((node) => [node.x, node.y])
    );
    const c = chartMapView(nav(), chart(), status(), W, H, 42);
    const moved = a.nodes.some((node, i) => {
      const other = c.nodes[i];
      return other !== undefined && (other.x !== node.x || other.y !== node.y);
    });
    expect(moved).toBe(true);
  });

  it('keeps markers separated on concentric orbits', () => {
    for (const t of [0, 17, 42, 95, 140]) {
      const view = chartMapView(nav(), chart(), status(), W, H, t);
      for (let i = 0; i < view.nodes.length; i += 1) {
        for (let j = i + 1; j < view.nodes.length; j += 1) {
          const a = view.nodes[i];
          const b = view.nodes[j];
          if (a === undefined || b === undefined) throw new Error('node missing');
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          expect(dist).toBeGreaterThanOrEqual(a.r + b.r);
        }
      }
    }
  });

  it('marks port, unknown, and idle nodes while docked', () => {
    const view = chartMapView(nav(), chart(), status(), W, H, 0);
    expect(view.nodes).toHaveLength(4);
    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    expect(byId.get('hub_a')?.status).toBe('port');
    expect(byId.get('hub_b')?.status).toBe('idle');
    expect(byId.get('poi_kestrel')?.status).toBe('unknown');
    expect(byId.get('poi_kestrel')?.label).toBe('??');
    expect(byId.get('hub_b')?.label).toBe('KEPLER');
    expect(view.route).toEqual([]);
    expect(view.ship).toEqual({ x: byId.get('hub_a')?.x, y: byId.get('hub_a')?.y });
  });

  it('offers plot and detour buttons only while docked', () => {
    const docked = chartMapView(nav(), chart(), status(), W, H, 0);
    const buttons = new Map(
      docked.nodes.filter((node) => node.buttonId !== null).map((node) => [node.id, node.buttonId])
    );
    expect(buttons.get('hub_b')).toBe('plot:hub_b');
    expect(buttons.get('poi_kestrel')).toBe('via:poi_kestrel');
    expect(buttons.get('poi_vigil')).toBe('via:poi_vigil');
    expect(buttons.has('hub_a')).toBe(false);
    const cruise = chartMapView(
      nav({ phase: 'in_transit', destHubId: 'hub_b', stops: ['hub_b'], legIndex: 0 }),
      chart(),
      status(),
      W,
      H,
      0
    );
    expect(cruise.nodes.every((node) => node.buttonId === null)).toBe(true);
  });

  function chainView() {
    return chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 120,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
  }

  it('draws the route from the ship on a chain', () => {
    const view = chainView();
    // Legs resample adaptively (16 minimum, joint shared): at least 16 + 15.
    expect(view.route.length).toBeGreaterThanOrEqual(31);
    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    expect(byId.get('poi_kestrel')?.status).toBe('hop');
    expect(byId.get('hub_b')?.status).toBe('dest');
    const first = view.route[0];
    expect(first).toEqual(view.ship);
    expectRouteSteps(view.route);
  });

  it('holds the ship fixed while planets move under a frozen leg', () => {
    const first = chainView();
    expect(first.liveLeg).not.toBeNull();
    const second = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 120,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      30,
      undefined,
      1,
      first.liveLeg
    );
    expect(second.ship).toEqual(first.ship);
    expect(second.liveLeg?.legId).toBe(first.liveLeg?.legId);
    expect(second.liveLeg?.legIndex).toBe(first.liveLeg?.legIndex);
    const docked = chartMapView(nav(), chart(), status(), W, H, 0);
    expect(docked.liveLeg).toBeNull();
  });

  it('blends from the solved arrival onto the dock mouth', () => {
    const sailing = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'poi_kestrel',
        remainingS: 60,
        stops: ['poi_kestrel'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    const snap = sailing.liveLeg;
    if (snap === null) throw new Error('live leg missing');
    const dockingAt = (remainingS: number) =>
      chartMapView(
        nav({
          phase: 'docking',
          destHubId: 'poi_kestrel',
          remainingS,
          stops: ['poi_kestrel'],
          legIndex: 0,
        }),
        chart(),
        status(),
        W,
        H,
        0,
        undefined,
        1,
        snap
      );
    const byId = new Map(dockingAt(0).nodes.map((node) => [node.id, node]));
    const mouth = byId.get('poi_kestrel');
    if (mouth === undefined) throw new Error('dest node missing');
    // Instant dock: the ship sits on the live dock mouth at any countdown.
    expect(dockingAt(0).ship).toEqual({ x: mouth.x, y: mouth.y });
    expect(dockingAt(10).ship).toEqual({ x: mouth.x, y: mouth.y });
    expect(dockingAt(5).ship).toEqual({ x: mouth.x, y: mouth.y });
  });

  it('hands off onto the previous arrival, not the naive joint', () => {
    const first = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 1,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    const snap = first.liveLeg;
    if (snap === null) throw new Error('live leg missing');
    const second = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 120,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 1,
      }),
      chart(),
      status(),
      W,
      H,
      0,
      undefined,
      1,
      snap
    );
    expect(second.liveLeg?.legIndex).toBe(1);
    // Full remaining parks the new leg exactly on its snapshot start.
    expect(second.ship).toEqual(second.liveLeg?.r0);
    // Continuous with the previous leg: one second of flight apart.
    expect(Math.hypot(second.ship.x - first.ship.x, second.ship.y - first.ship.y)).toBeLessThan(30);
    // Not snapped to the live joint the ship never visited.
    const byId = new Map(second.nodes.map((node) => [node.id, node]));
    const joint = byId.get('poi_kestrel');
    if (joint === undefined) throw new Error('joint node missing');
    expect(Math.hypot(second.ship.x - joint.x, second.ship.y - joint.y)).toBeGreaterThan(50);
  });

  it('aims the route end at the predicted arrival point', () => {
    const view = chainView();
    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    const dest = byId.get('hub_b');
    const last = view.route[view.route.length - 1];
    if (dest === undefined || last === undefined) throw new Error('route end missing');
    // Leg windows: 120s live plus the integrated future leg on the Kepler hub_b orbit.
    const future = planTripLeg('poi_kestrel', 'hub_b', torchAccel(0, 1), 120);
    const led = rotated(view.center, dest, (120 + (future?.totalS ?? 120)) / HUB_B_PERIOD_S);
    expect(Math.hypot(last.x - led.x, last.y - led.y)).toBeLessThan(3);
  });

  it('marks one flip per leg at the braking boundary', () => {
    const view = chainView();
    expect(view.flips).toHaveLength(2);
    expect(view.flipIndices).toHaveLength(2);
    const [flip, joint] = [view.flipIndices[0], view.flipIndices[1]];
    if (flip === undefined || joint === undefined) throw new Error('flip missing');
    expect(flip).toBeGreaterThan(0);
    expect(joint).toBeGreaterThan(flip);
    expect(joint).toBeLessThan(view.route.length - 1);
    expect(view.flips[0]).toEqual(view.route[flip]);
    expect(view.flips[1]).toEqual(view.route[joint]);
  });

  it('keeps committed legs clear of the stellar exclusion', () => {
    const view = chainView();
    expect(view.wells.length).toBeGreaterThanOrEqual(1);
    const star = view.wells[0];
    if (star === undefined) throw new Error('star well missing');
    for (const point of view.route) {
      expect(Math.hypot(point.x - star.x, point.y - star.y)).toBeGreaterThan(view.starR + 4);
    }
  });

  it('keeps solved legs off the star body across orbit phases', () => {
    // Flip search steers around the exclusion disc; the hard guarantee is
    // the physical star (core radius + margin), which brachistochrones
    // between these orbits never touch.
    for (const t of [0, 25, 55, 90, 130, 200]) {
      for (const stops of [['hub_b'], ['poi_kestrel'], ['poi_kestrel', 'hub_b'], ['poi_vigil']]) {
        const view = chartMapView(
          nav({
            phase: 'in_transit',
            destHubId: stops[stops.length - 1],
            remainingS: 100,
            stops,
            legIndex: 0,
          }),
          chart(),
          status(),
          W,
          H,
          t
        );
        const star = view.wells[0];
        if (star === undefined) throw new Error('star well missing');
        const inner = view.route.slice(2, -2);
        for (const point of inner) {
          const d = Math.hypot(point.x - star.x, point.y - star.y);
          expect(d).toBeGreaterThan(view.starR + 4);
        }
      }
    }
  });

  it('draws a live intercept while adrift', () => {
    const view = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 100,
        flameout: true,
        hailS: 40,
        stops: ['hub_b'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    expect(view.adrift).toBe(true);
    expect(view.intercept.length).toBeGreaterThan(0);
    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    const last = view.intercept[view.intercept.length - 1];
    const dest = byId.get('hub_b');
    if (dest === undefined || last === undefined) throw new Error('intercept end missing');
    // A relit drive meets the body where it will be after the remaining burn.
    const led = rotated(view.center, dest, 100 / HUB_B_PERIOD_S);
    expect(last.x).toBeCloseTo(led.x, 5);
    expect(last.y).toBeCloseTo(led.y, 5);
    const docked = chartMapView(nav(), chart(), status(), W, H, 0);
    expect(docked.adrift).toBe(false);
    expect(docked.intercept).toEqual([]);
  });

  function inwardVisitView() {
    return chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'poi_kestrel',
        remainingS: 60,
        stops: ['poi_kestrel'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
  }

  it('shows the solved boost burn at departure and brake burn at arrival', () => {
    const inward = inwardVisitView();
    expect(inward.burns).toHaveLength(2);
    expect(inward.burns[0]).toMatchObject({ kind: 'pro' });
    expect(inward.burns[1]).toMatchObject({ kind: 'retro' });
    const nodes = new Map(inward.nodes.map((node) => [node.id, node]));
    const hub = nodes.get('hub_a');
    const boost = inward.burns[0];
    const brake = inward.burns[1];
    const end = inward.route[inward.route.length - 1];
    if (hub === undefined || boost === undefined || brake === undefined || end === undefined) {
      throw new Error('burn fixture missing');
    }
    // Boost burn sits at the departure point with a solved (not tangent) direction.
    expect(boost.x).toBeCloseTo(hub.x, 5);
    expect(boost.y).toBeCloseTo(hub.y, 5);
    const progAngle = Math.atan2(hub.x - inward.center.x, -(hub.y - inward.center.y));
    expect(Math.abs(boost.angle - progAngle)).toBeGreaterThan(0.05);
    // Brake burn sits at the predicted arrival with a distinct direction.
    expect(brake.x).toBeCloseTo(end.x, 5);
    expect(brake.y).toBeCloseTo(end.y, 5);
    expect(Math.abs(brake.angle - boost.angle)).toBeGreaterThan(0.2);
  });

  it('burns prograde to climb outward', () => {
    const outward = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 150,
        stops: ['hub_b'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    expect(outward.burns[0]).toMatchObject({ kind: 'pro' });
    expect(outward.burns[1]).toMatchObject({ kind: 'retro' });
  });

  it('prices the torch plan from the port while spooling', () => {
    const view = chartMapView(
      nav({
        phase: 'spooling',
        destHubId: 'poi_kestrel',
        remainingS: 8,
        stops: ['poi_kestrel'],
        legIndex: 0,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    expect(view.transfer?.label).toBe('BURN 30S RETRO 30S');
  });

  it('counts the transfer row down across the flip', () => {
    const row = (phase: 'in_transit' | 'docking', remainingS: number) =>
      chartMapView(
        nav({
          phase,
          destHubId: 'hub_b',
          remainingS,
          stops: ['hub_b'],
          legIndex: 0,
          legTotalS: 100,
        }),
        chart(),
        status(),
        W,
        H,
        0
      ).transfer?.label;
    expect(row('in_transit', 100)).toBe('BURN 50S RETRO 50S');
    expect(row('in_transit', 75)).toBe('BURN 25S RETRO 50S');
    expect(row('in_transit', 50)).toBe('BURN 0S RETRO 50S');
    expect(row('in_transit', 25)).toBe('BURN 0S RETRO 25S');
    expect(row('docking', 0)).toBe('BURN 0S RETRO 0S');
  });

  it('marks burns, ticks, and the torch plan on a chain', () => {
    const view = chainView();
    expect(view.ticks).toHaveLength(6);
    expect(view.burns).toHaveLength(2);
    expect(view.burns[0]).toMatchObject({ kind: 'pro' });
    expect(view.burns[1]).toMatchObject({ kind: 'retro' });
    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    const last = view.route[view.route.length - 1];
    expect(view.burns[0]).toEqual({
      ...view.burns[0],
      x: byId.get('hub_a')?.x,
      y: byId.get('hub_a')?.y,
    });
    expect(view.burns[1]).toEqual({ ...view.burns[1], x: last?.x, y: last?.y });
    expect(view.transfer?.label).toMatch(/^BURN \d+S RETRO \d+S$/);
  });

  it('flies the ship marker along the live hop', () => {
    const at = (remainingS: number) =>
      chartMapView(
        nav({
          phase: 'in_transit',
          destHubId: 'hub_b',
          remainingS,
          stops: ['poi_kestrel', 'hub_b'],
          legIndex: 1,
        }),
        chart(),
        status(),
        W,
        H,
        0
      ).ship;
    const dockedView = chartMapView(nav(), chart(), status(), W, H, 0);
    const byId = new Map(dockedView.nodes.map((node) => [node.id, node]));
    const from = byId.get('poi_kestrel');
    const to = byId.get('hub_b');
    if (from === undefined || to === undefined) throw new Error('node missing');
    // T0 kestrel>hub_b hop is 0.8 * 150 = 120s; endpoints pin the arc.
    const start = at(120);
    expect(start.x).toBeCloseTo(from.x, 5);
    expect(start.y).toBeCloseTo(from.y, 5);
    const done = at(0);
    // Arrival meets the body where it will be, not where it is.
    const ledTo = rotated(dockedView.center, to, 120 / HUB_B_PERIOD_S);
    expect(done.x).toBeCloseTo(ledTo.x, 5);
    expect(done.y).toBeCloseTo(ledTo.y, 5);
    const sailing = chartMapView(
      nav({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 60,
        stops: ['poi_kestrel', 'hub_b'],
        legIndex: 1,
      }),
      chart(),
      status(),
      W,
      H,
      0
    );
    const xs = sailing.route.map((point) => point.x);
    const ys = sailing.route.map((point) => point.y);
    const mid = at(60);
    expect(mid.x).toBeGreaterThanOrEqual(Math.min(...xs) - 30);
    expect(mid.x).toBeLessThanOrEqual(Math.max(...xs) + 30);
    expect(mid.y).toBeGreaterThanOrEqual(Math.min(...ys) - 30);
    expect(mid.y).toBeLessThanOrEqual(Math.max(...ys) + 30);
  });

  it('draws ghost arcs for the draft only', () => {
    const plain = chartMapView(nav(), chart(), status(), W, H, 0);
    expect(plain.previewRoute).toEqual([]);
    const drafted = chartMapView(nav(), chart(), status(), W, H, 0, ['poi_kestrel', 'hub_b']);
    expect(drafted.previewRoute.length).toBeGreaterThan(0);
    expect(drafted.route).toEqual([]);
    const byId = new Map(drafted.nodes.map((node) => [node.id, node]));
    const first = drafted.previewRoute[0];
    const last = drafted.previewRoute[drafted.previewRoute.length - 1];
    expect(first).toEqual({ x: byId.get('hub_a')?.x, y: byId.get('hub_a')?.y });
    const dest = byId.get('hub_b');
    if (dest === undefined || last === undefined) throw new Error('ghost end missing');
    // Integrated windows from the port on the Kepler hub_b orbit.
    const led = rotated(
      drafted.center,
      dest,
      ghostWindow(['poi_kestrel', 'hub_b'], 1) / HUB_B_PERIOD_S
    );
    expect(Math.hypot(last.x - led.x, last.y - led.y)).toBeLessThan(8);
  });

  it('aims ghost arcs with draft throttle', () => {
    const full = chartMapView(nav(), chart(), status(), W, H, 0, ['poi_kestrel', 'hub_b']);
    const slow = chartMapView(nav(), chart(), status(), W, H, 0, ['poi_kestrel', 'hub_b'], 0.5);
    expect(slow.previewRoute.length).toBeGreaterThan(0);
    expect(slow.previewRoute).not.toEqual(full.previewRoute);
    const byId = new Map(slow.nodes.map((node) => [node.id, node]));
    const dest = byId.get('hub_b');
    const last = slow.previewRoute[slow.previewRoute.length - 1];
    if (dest === undefined || last === undefined) throw new Error('ghost end missing');
    // Integrated windows at half thrust on the Kepler hub_b orbit.
    const led = rotated(
      slow.center,
      dest,
      ghostWindow(['poi_kestrel', 'hub_b'], 0.5) / HUB_B_PERIOD_S
    );
    expect(Math.hypot(last.x - led.x, last.y - led.y)).toBeLessThan(8);
  });

  it('advances broadcast clocks smoothly between snapshots', () => {
    const first = smoothSimClock(null, 100, 50, 1000, false, false);
    expect(first.simSeconds).toBeCloseTo(5, 8);
    expect(first.remainingSmooth).toBe(50);
    if (first.clock === null) throw new Error('clock missing');
    const mid = smoothSimClock(first.clock, 100, 50, 1000.05, false, false);
    expect(mid.simSeconds).toBeCloseTo(5.05, 8);
    expect(mid.remainingSmooth).toBeCloseTo(49.95, 8);
    const frozen = smoothSimClock(first.clock, 100, 50, 1000.05, true, false);
    expect(frozen.simSeconds).toBeCloseTo(5, 8);
    const flamed = smoothSimClock(first.clock, 100, 50, 1000.05, false, true);
    expect(flamed.remainingSmooth).toBe(50);
    const resync = smoothSimClock(first.clock, 102, 49.9, 1000.1, false, false);
    expect(resync.simSeconds).toBeCloseTo(5.1, 8);
    expect(smoothSimClock(null, undefined, 50, 1000, false, false).simSeconds).toBe(1000);
  });

  it('moves planets smoothly across broadcast gaps', () => {
    const base = nav();
    let clock: import('./chartModel').SmoothClock | null = null;
    let prevX: number | null = null;
    let worst = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const wallSec = 1000 + frame / 60;
      const tick = 2000 + Math.floor(frame / 6) * 2;
      const view = chartMapView(
        { ...base, tick, remainingS: 50 },
        chart(),
        status(),
        W,
        H,
        tick * 0.05,
        null,
        1,
        null,
        { prev: clock, wallSec, paused: false }
      );
      clock = view.clock;
      expect(clock).not.toBeNull();
      const hub = view.nodes.find((n) => n.id === 'hub_a');
      if (hub === undefined) throw new Error('hub missing');
      if (prevX !== null) worst = Math.max(worst, Math.abs(hub.x - prevX));
      prevX = hub.x;
    }
    expect(worst).toBeLessThan(2);
  });

  it('keeps chips on screen', () => {
    const view = chartMapView(nav(), chart(), status(), W, H, 33);
    for (const node of view.nodes) {
      expect(node.chip.x).toBeGreaterThanOrEqual(0);
      expect(node.chip.y).toBeGreaterThanOrEqual(0);
      expect(node.chip.x + node.chip.w).toBeLessThanOrEqual(W);
      expect(node.chip.y + node.chip.h).toBeLessThanOrEqual(H);
    }
  });
});
