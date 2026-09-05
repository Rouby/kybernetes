import { describe, expect, it } from 'vitest';
import { liveEtaSeconds, resolveClientShipOffset, STATION_NPCS } from './StationHub';

describe('resolveClientShipOffset', () => {
  it('matches the authoritative offset at the dock and away', () => {
    expect(resolveClientShipOffset('docked', 0, 0)).toEqual({ x: 0, y: 0 });
    expect(resolveClientShipOffset('inbound', 20, 0)).toEqual({ x: -1400, y: 0 });
    expect(resolveClientShipOffset('inbound', 20, 1)).toEqual({ x: 1400, y: 0 });
    expect(resolveClientShipOffset(undefined, undefined, undefined)).toEqual({ x: -1400, y: 0 });
  });

  it('integrates live eta from the broadcast timestamp', () => {
    expect(liveEtaSeconds(20, 1000, 1000)).toBe(20);
    expect(liveEtaSeconds(20, 1000, 6000)).toBe(15);
    expect(liveEtaSeconds(20, 1000, 30000)).toBe(0);
  });

  it('stations two flavor NPCs on the station side', () => {
    expect(STATION_NPCS).toHaveLength(2);
    for (const npc of STATION_NPCS) {
      expect(npc.y).toBeGreaterThan(640);
    }
  });
});
