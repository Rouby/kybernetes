/** Market trade-spread hints for the nav console (best docked haul). */
import type { NavStateBroadcast } from '@kybernetes/protocol';
import { hubSellPrice, TRADE_GOODS } from '@kybernetes/sim-core';

export function haulRowFor(
  nav: NavStateBroadcast | null,
  portHubId: string,
  otherHubId: string
): string | null {
  if (nav?.phase !== 'docked') return null;
  let best: { good: string; from: number; to: number } | undefined;
  for (const good of TRADE_GOODS) {
    const from = hubSellPrice(portHubId, good) ?? 0;
    const to = hubSellPrice(otherHubId, good) ?? 0;
    if (best === undefined || to - from > best.to - best.from) best = { good, from, to };
  }
  if (best === undefined) return null;
  return `HAUL ${best.good.toUpperCase()} ${best.from}>${best.to}`;
}
