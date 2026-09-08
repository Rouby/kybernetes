/**
 * Client fire mirror: the same kernel gate the server enforces, fed from
 * VITALS snapshots. Refused shots never send intents, sounds, or flashes.
 * Mirror staleness is bounded by one VITALS tick; the server stays truth.
 */

import type { VitalsBroadcast } from '@kybernetes/protocol';
import { fireBlock } from '@kybernetes/sim-core';

export function shouldFireShot(
  vitals: VitalsBroadcast | null | undefined,
  hasPawn: boolean
): boolean {
  if (!hasPawn) return false;
  const v = vitals?.vitals;
  if (v === undefined) return false;
  return (
    fireBlock({
      mags: [v.ammo, ...v.mags],
      reloadingS: v.reloading ? 1 : 0,
      down: v.health <= 0,
    }) === null
  );
}
