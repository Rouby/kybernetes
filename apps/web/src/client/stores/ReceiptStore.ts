/**
 * ReceiptStore: framework-free trade-receipt state (Issue 07).
 * Sell clicks capture the valued goods plus the click-time balance
 * optimistically (sale notices race the balance broadcast); the matching
 * MARKET_sold notice settles the oldest capture into a receipt card.
 * Other MARKET_* failures drop the oldest capture; MARKET_ok (buys)
 * never touches the queue. No React, no DOM.
 */

import {
  type SellCapture,
  type TradeReceiptModel,
  tradeReceiptFor,
} from '../../harbor/marketModel';

export interface ReceiptNotice {
  readonly id: number;
  readonly message: string;
}

interface PendingSale {
  readonly capture: SellCapture;
  readonly balance: number;
}

export class ReceiptStore {
  private pending: PendingSale[] = [];
  private shown: TradeReceiptModel | null = null;
  private seenNoticeId = -1;

  public capture(capture: SellCapture, balance: number): void {
    this.pending.push({ capture, balance });
  }

  public pendingCount(): number {
    return this.pending.length;
  }

  /** Settle or drop captures from the latest notice; true when cash should ring. */
  public reconcile(notices: readonly ReceiptNotice[], nowMs: number): boolean {
    const latest = notices[notices.length - 1];
    if (latest === undefined || latest.id === this.seenNoticeId) return false;
    this.seenNoticeId = latest.id;
    if (/^MARKET_sold:/.test(latest.message)) {
      this.confirm(nowMs);
      return true;
    }
    if (/^MARKET_/.test(latest.message) && latest.message !== 'MARKET_ok') this.pending.shift();
    return false;
  }

  private confirm(nowMs: number): void {
    const sale = this.pending.shift();
    if (sale === undefined) return;
    this.shown = tradeReceiptFor(sale.capture, sale.balance + sale.capture.total, nowMs);
  }

  public getShown(): TradeReceiptModel | null {
    return this.shown;
  }

  public isOpen(): boolean {
    return this.shown !== null;
  }

  public dismiss(): void {
    this.shown = null;
  }
}
