import type { DoorState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { dockRenderView } from '../../harbor/viewportFrame';
import { filterDoorsForFrame, tubeOrigin, visibleStationOrigins } from './DeckPass';

describe('DeckPass helpers', () => {
  describe('tubeOrigin', () => {
    it('defaults to origin when mouth is undefined', () => {
      expect(tubeOrigin(undefined)).toEqual({ x: 0, y: 0 });
    });

    it('returns zero offset for Hub A mouth coordinates', () => {
      expect(tubeOrigin({ x1: 1210, y1: 240 })).toEqual({ x: 0, y: 0 });
    });

    it('calculates the true world offset for far hub mouths', () => {
      expect(tubeOrigin({ x1: 1210, y1: 4240 })).toEqual({ x: 0, y: 4000 });
      expect(tubeOrigin({ x1: 1210, y1: 8240 })).toEqual({ x: 0, y: 8000 });
      expect(tubeOrigin({ x1: 1210, y1: 12240 })).toEqual({ x: 0, y: 12000 });
    });
  });

  describe('visibleStationOrigins', () => {
    it('returns all hub origins when visibleFrames is undefined', () => {
      const all = visibleStationOrigins(undefined);
      expect(all.map((item) => item.frame)).toEqual(['station', 'hub_b', 'hub_c', 'hub_d']);
      expect(all.find((item) => item.frame === 'hub_b')?.origin).toEqual({ x: 0, y: 4000 });
    });

    it('filters origins strictly to visible station frames', () => {
      const hubBOnly = visibleStationOrigins(new Set(['ship', 'hub_b']));
      expect(hubBOnly).toEqual([{ frame: 'hub_b', origin: { x: 0, y: 4000 } }]);

      const stationOnly = visibleStationOrigins(new Set(['ship', 'station']));
      expect(stationOnly).toEqual([{ frame: 'station', origin: { x: 0, y: 0 } }]);

      const transitBoth = visibleStationOrigins(new Set(['ship', 'station', 'hub_b']));
      expect(transitBoth).toEqual([
        { frame: 'station', origin: { x: 0, y: 0 } },
        { frame: 'hub_b', origin: { x: 0, y: 4000 } },
      ]);
    });
  });

  describe('dockRenderView', () => {
    it('returns undefined when dock is null or undefined', () => {
      expect(dockRenderView(null)).toBeUndefined();
      expect(dockRenderView(undefined)).toBeUndefined();
    });

    it('maps mouthWorld into the render dock view', () => {
      const mouthWorld = { x1: 1210, y1: 4240, x2: 1210, y2: 4280 };
      const view = dockRenderView({
        type: 'DOCK_STATUS',
        v: 2,
        tick: 1,
        serverTimeMs: 1000,
        vesselId: 'ship',
        dockId: 'hub_b_harbor',
        phase: 'docked',
        walkable: true,
        secondsToSeal: 0,
        stationGate: 'hub_b.korridor_ost_andock',
        tubeGate: 'hub_b.andock_tube_mund',
        vesselGate: 'ship.schiff_mund',
        tubeRoom: 'hub_b.andock_tube',
        mouthWorld,
      });
      expect(view?.walkable).toBe(true);
      expect(view?.mouthWorld).toEqual(mouthWorld);
    });
  });

  describe('filterDoorsForFrame', () => {
    const sampleDoors: DoorState[] = [
      {
        id: 'ship.cockpit_gang',
        name: 'Cockpit Door',
        x1: 10,
        y1: 10,
        x2: 20,
        y2: 10,
        isOpen: false,
        isAirlock: false,
        roomA: 'ship.bruecke',
        roomB: 'ship.korridor_schiff',
      },
      {
        id: 'station.habitat_korridor',
        name: 'Habitat Door',
        x1: 100,
        y1: 100,
        x2: 120,
        y2: 100,
        isOpen: false,
        isAirlock: false,
        roomA: 'station.habitat',
        roomB: 'station.korridor_mitte',
      },
      {
        id: 'hub_d.observatorium_andock_tube',
        name: 'Observatory Door',
        x1: 50,
        y1: 50,
        x2: 70,
        y2: 50,
        isOpen: false,
        isAirlock: false,
        roomA: 'hub_d.observatorium',
        roomB: 'hub_d.andock_tube',
      },
    ];

    it('filters doors strictly by frame', () => {
      const shipDoors = filterDoorsForFrame(sampleDoors, 'ship');
      expect(shipDoors.map((d) => d.id)).toEqual(['ship.cockpit_gang']);

      const stationDoors = filterDoorsForFrame(sampleDoors, 'station');
      expect(stationDoors.map((d) => d.id)).toEqual(['station.habitat_korridor']);

      const hubDDoors = filterDoorsForFrame(sampleDoors, 'hub_d');
      expect(hubDDoors.map((d) => d.id)).toEqual(['hub_d.observatorium_andock_tube']);

      const emptyDoors = filterDoorsForFrame(sampleDoors, 'hub_b');
      expect(emptyDoors).toEqual([]);
    });
  });
});
