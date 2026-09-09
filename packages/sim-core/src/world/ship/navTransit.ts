/**
 * Hub-to-hub transit seam (TRANSFORM M3). Interior + abstract transit:
 * the player plots at the nav console and keeps doing chores inside
 * while the leg timer runs. Full leg state machine lands in M3.
 * Pure data only; no DOM/Node imports.
 */

export type NavPhase = 'docked' | 'spooling' | 'in_transit' | 'docking';

export interface NavState {
  readonly phase: NavPhase;
  readonly destHubId: string | undefined;
  readonly remainingS: number;
}

export const DOCKED_NAV: NavState = { phase: 'docked', destHubId: undefined, remainingS: 0 };

/** M1 helper: true while the ship is committed to a leg. */
export function isUnderway(nav: NavState): boolean {
  return nav.phase === 'spooling' || nav.phase === 'in_transit' || nav.phase === 'docking';
}
