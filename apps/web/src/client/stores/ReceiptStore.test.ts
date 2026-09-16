import { describe, expect, it } from 'vitest';
import type { SellCapture } from '../../harbor/marketModel';
import { ReceiptStore } from './ReceiptStore';

function capture(total = 26): SellCapture {
  return {
    hubId: 'hub_b',
    hubLabel: 'KEPLER YARD',
    goods: [{ goodId: 'scrap', qty: 2, revenue: total }],
    total,
  };
}

describe('ReceiptStore', () => {
  it('settles the oldest capture into a receipt on sold', () => {
    const store = new ReceiptStore();
    store.capture(capture(18), 50);
    store.capture(capture(26), 50);
    expect(store.reconcile([{ id: 1, message: 'MARKET_sold:1' }], 4242)).toBe(true);
    expect(store.isOpen()).toBe(true);
    expect(store.getShown()).toMatchObject({ totalRevenue: 18, newBalance: 68 });
    expect(store.pendingCount()).toBe(1);
  });

  it('rings without posting when nothing is pending', () => {
    const store = new ReceiptStore();
    expect(store.reconcile([{ id: 1, message: 'MARKET_sold:1' }], 1)).toBe(true);
    expect(store.isOpen()).toBe(false);
  });

  it('drops captures on market failures but keeps them on buys', () => {
    const store = new ReceiptStore();
    store.capture(capture(), 50);
    expect(store.reconcile([{ id: 1, message: 'MARKET_ok' }], 1)).toBe(false);
    expect(store.pendingCount()).toBe(1);
    expect(store.reconcile([{ id: 2, message: 'MARKET_denied' }], 1)).toBe(false);
    expect(store.pendingCount()).toBe(0);
  });

  it('dedupes repeat syncs and dismisses the card', () => {
    const store = new ReceiptStore();
    store.capture(capture(), 50);
    const notices = [{ id: 7, message: 'MARKET_sold:1' }];
    expect(store.reconcile(notices, 1)).toBe(true);
    expect(store.reconcile(notices, 1)).toBe(false);
    store.dismiss();
    expect(store.isOpen()).toBe(false);
    expect(store.getShown()).toBeNull();
  });
});
