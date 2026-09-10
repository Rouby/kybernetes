import { describe, expect, it } from 'vitest';
import { CARRY_SPEED_MULT, emptyCargo, securedQty } from './cargo.js';
import { engineSpecFor } from './engine.js';
import { hubBuyPrice, hubSellPrice, TRADE_GOODS } from './market.js';
import { DOCKED_NAV, isUnderway } from './navTransit.js';
import { reactorSpecFor } from './reactor.js';

describe('ship seams (M2-M5 placeholders)', () => {
  it('tiers improve monotonically', () => {
    expect(reactorSpecFor(1).maxOutputMw).toBeGreaterThan(reactorSpecFor(0).maxOutputMw);
    expect(reactorSpecFor(2).coolingPerFlow).toBeGreaterThan(reactorSpecFor(1).coolingPerFlow);
    expect(engineSpecFor(1).rangeSu).toBeGreaterThan(engineSpecFor(0).rangeSu);
    expect(engineSpecFor(2).speedKps).toBeGreaterThan(engineSpecFor(1).speedKps);
  });

  it('docked nav is not underway', () => {
    expect(isUnderway(DOCKED_NAV)).toBe(false);
    expect(
      isUnderway({
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 30,
        legId: 1,
        portHubId: 'hub_a',
        flameout: false,
        extraBurned: false,
      })
    ).toBe(true);
  });

  it('physical crates are never secured wealth until unpacked', () => {
    expect(securedQty(emptyCargo(), 'ship', 'scrap')).toBe(0);
    expect(CARRY_SPEED_MULT).toBe(0.75);
  });

  it('starter catalog holds six fixed goods with house cuts', () => {
    expect(TRADE_GOODS).toHaveLength(6);
    for (const hub of ['hub_a', 'hub_b']) {
      for (const good of TRADE_GOODS) {
        const buy = hubBuyPrice(hub, good) ?? 0;
        const sell = hubSellPrice(hub, good) ?? 0;
        expect(buy).toBeGreaterThan(sell);
      }
    }
  });
});
