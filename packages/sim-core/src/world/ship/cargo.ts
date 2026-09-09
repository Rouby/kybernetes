/**
 * Physical crate hauling seam (TRANSFORM M4). Every traded unit is a
 * body in space: bay floor -> carried -> rack -> bay floor.
 * Full pickup/drop/rack rules land in M4. Pure data only.
 */

export type CrateWhere = 'bayFloor' | 'carried' | 'rack';

export interface Crate {
  readonly id: string;
  readonly goodId: string;
  readonly qty: number;
  readonly where: CrateWhere;
}

/** M1 helper: only racked crates count as secured wealth (M5 rule). */
export function isSecured(crate: Crate): boolean {
  return crate.where === 'rack';
}
