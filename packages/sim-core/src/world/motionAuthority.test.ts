import { describe, expect, it } from 'vitest';
import { dockWalkable } from './dockStatus.js';
import { buildHarborWorld, buildSoloShipWorld } from './scenarios.js';
import { isDockGateWalkable, SHIP_FAR_ORIGIN, tickSchedule, tickVesselMotion } from './schedule.js';
import { ensureShipSystems, resetVoyageTo } from './ship/systems.js';
import { easeNavVessel, sealDock } from './ship/vesselMotion.js';

describe('motion authority (Strike 2)', () => {
  it('legacy auto-tour skips nav-owned hulls', () => {
    const harbor = buildHarborWorld();
    const vessel = harbor.vessels.ship;
    if (vessel === undefined) throw new Error('missing ship');
    const underway = {
      ...harbor,
      vessels: { ...harbor.vessels, ship: { ...vessel, schedule: 'in_transit' as const } },
    };
    // Transit-only hull eases toward far holding at cruise speed.
    const moved = tickVesselMotion(underway, 1);
    expect(moved).not.toBe(underway);
    expect(moved.vessels.ship?.origin.x).toBeGreaterThan(underway.vessels.ship?.origin.x ?? 0);
    // Same hull under nav authority holds: legacy motion is a no-op.
    const navOwned = ensureShipSystems(underway, 'ship');
    expect(tickVesselMotion(navOwned, 1)).toBe(navOwned);
    const scheduled = tickSchedule(navOwned, 30);
    expect(scheduled.vessels.ship?.origin).toEqual(navOwned.vessels.ship?.origin);
    expect(scheduled.vessels.ship?.schedule).toBe('in_transit');
  });

  it('mated arrival unseals vacuum-safe: shut leaves stay walkable and airtight', () => {
    // Regression: unsealMatedDock used to swing docked mouths 'open', and
    // both mouths mate onto vacuum — the ship corridor and station tube
    // drained to space after every second docking. Docked leaves must be
    // 'closed': walkable through the dock exception, airtight to the solver.
    let world = resetVoyageTo(ensureShipSystems(buildSoloShipWorld(), 'ship'), 'ship', 'hub_b');
    world = sealDock(world, 'hub_b', false);
    const dock = world.docks['hub_b_harbor'];
    if (dock === undefined) throw new Error('missing hub_b dock');
    const leaves = [dock.stationPortal, dock.tubePortal, dock.vesselPortal];
    expect(leaves.map((id) => world.portals[id]?.state)).toEqual(['sealed', 'sealed', 'sealed']);
    const mated = easeNavVessel(world, 'ship', 1);
    expect(leaves.map((id) => mated.portals[id]?.state)).toEqual(['closed', 'closed', 'closed']);
    for (const id of leaves) {
      expect(isDockGateWalkable(mated, id)).toBe(true);
    }
    expect(dockWalkable(mated, dock.id)).toBe(true);
  });

  it('nav mover owns ships vessels even with a stale transit record', () => {
    const world = ensureShipSystems(buildHarborWorld(), 'ship');
    const before = world.vessels.ship?.origin ?? { x: 0, y: 0 };
    // Docked nav hull sits at its mate: no step, but ownership is nav.
    expect(easeNavVessel(world, 'ship', 1)).toBe(world);
    // Bare hulls without ShipSystems never move under nav.
    expect(easeNavVessel(world, 'void', 1)).toBe(world);
    expect(before).toMatchObject({ x: 1210 });
    expect(SHIP_FAR_ORIGIN.x).toBeGreaterThan(before.x);
  });
});
