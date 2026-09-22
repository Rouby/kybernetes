import { describe, expect, it } from 'vitest';
import { dockRenderView } from '../../harbor/viewportFrame';
import { tubeOrigin, visibleStationOrigins } from './DeckPass';

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
});
