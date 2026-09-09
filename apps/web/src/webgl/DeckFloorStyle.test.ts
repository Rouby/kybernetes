import { HesperiaV2Spec, StationHubSpec } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { bareDeckRoomId, deckFloorColor, deckFloorStyle, deckFloorType } from './DeckFloorStyle';

describe('deck floor style mapping', () => {
  it('routes ship rooms to their shader finishes', () => {
    expect(deckFloorType('bruecke')).toBe(0);
    expect(deckFloorType('korridor_schiff')).toBe(3);
    expect(deckFloorType('reaktor_antrieb')).toBe(6);
    expect(deckFloorType('kajute_nord')).toBe(1);
    expect(deckFloorType('kajute_sued')).toBe(1);
  });
  it('routes station rooms to their shader finishes', () => {
    expect(deckFloorType('kommando')).toBe(0);
    expect(deckFloorType('korridor_mitte')).toBe(3);
    expect(deckFloorType('korridor_ost')).toBe(3);
    expect(deckFloorType('andock_tube')).toBe(3);
    expect(deckFloorType('andock_a')).toBe(9);
    expect(deckFloorType('sicherheit_nord')).toBe(4);
    expect(deckFloorType('sicherheit_sued')).toBe(4);
    expect(deckFloorType('frachthalle')).toBe(5);
    expect(deckFloorType('reaktorraum')).toBe(6);
    expect(deckFloorType('hydroponik')).toBe(8);
    expect(deckFloorType('habitat')).toBe(1);
    expect(deckFloorType('medizin')).toBe(1);
  });
  it('covers every room id in both hull specs', () => {
    for (const room of [...HesperiaV2Spec.rooms, ...StationHubSpec.rooms]) {
      expect(deckFloorType(room.id)).toBeGreaterThanOrEqual(0);
      expect(deckFloorType(room.id)).toBeLessThanOrEqual(10);
    }
  });
  it('strips frame namespaces before matching', () => {
    expect(bareDeckRoomId('ship.bruecke')).toBe('bruecke');
    expect(deckFloorType('ship.bruecke')).toBe(0);
    expect(deckFloorType('station.korridor_mitte')).toBe(3);
  });
  it('falls back to clean berths for unknown rooms', () => {
    expect(deckFloorStyle('unmapped_deck').type).toBe(1);
    expect(deckFloorStyle('unmapped_deck').color).toEqual([0.9, 0.92, 0.95]);
  });
  it('gives ship cabins a warm worn base and keeps the station clean', () => {
    for (const cabin of ['kajute_nord', 'kajute_sued']) {
      const [r, g, b] = deckFloorColor(cabin);
      expect(r).toBeLessThan(0.6);
      expect(g).toBeLessThan(0.6);
      expect(b).toBeLessThan(0.6);
      expect(r).toBeGreaterThan(b);
    }
    expect(deckFloorColor('habitat')).toEqual([0.9, 0.92, 0.95]);
  });
});
