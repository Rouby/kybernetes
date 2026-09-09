/**
 * Protocol v2 living slice: dense hub + workhorse ship fixtures.
 * Additive only: fixtures ride as optional snapshot/telemetry fields
 * so pre-living consumers keep working. JSON-safe plain objects.
 */

export type FixtureKind =
  | 'bar_counter'
  | 'stool'
  | 'job_board'
  | 'vending_wall'
  | 'market_stall'
  | 'personal_locker'
  | 'stove'
  | 'freezer'
  | 'sink'
  | 'mess_table'
  | 'hydro_tray'
  | 'water_recycler'
  | 'breaker_box'
  | 'aid_cabinet'
  | 'claim_bunk';

export const FIXTURE_KINDS: readonly FixtureKind[] = [
  'bar_counter',
  'stool',
  'job_board',
  'vending_wall',
  'market_stall',
  'personal_locker',
  'stove',
  'freezer',
  'sink',
  'mess_table',
  'hydro_tray',
  'water_recycler',
  'breaker_box',
  'aid_cabinet',
  'claim_bunk',
] as const;

export function isFixtureKind(value: unknown): value is FixtureKind {
  return (
    value === 'bar_counter' ||
    value === 'stool' ||
    value === 'job_board' ||
    value === 'vending_wall' ||
    value === 'market_stall' ||
    value === 'personal_locker' ||
    value === 'stove' ||
    value === 'freezer' ||
    value === 'sink' ||
    value === 'mess_table' ||
    value === 'hydro_tray' ||
    value === 'water_recycler' ||
    value === 'breaker_box' ||
    value === 'aid_cabinet' ||
    value === 'claim_bunk'
  );
}

/** Authoritative fixture interaction state (q0 integrity, q0 progress). */
export interface FixtureSnapshot {
  readonly id: string;
  readonly kind: FixtureKind;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  /** 0-100; 0 = offline/broken until repaired. */
  readonly integrity: number;
  readonly online: boolean;
  readonly claimedBy?: string;
  /** 0-100 cook/growth/recycle progress. */
  readonly progressPct?: number;
  /** 0-100 fill level (freezer stock, water, hydro biomass). */
  readonly levelPct?: number;
}

/** Per-room living resources (quantized q1 power/heat/water). */
export interface LivingRoomState {
  readonly roomId: string;
  readonly powerKw?: number;
  readonly heatC?: number;
  readonly waterCleanL?: number;
  readonly waterGreyL?: number;
  readonly growthPct?: number;
  readonly mealsReady?: number;
  readonly breakerTripped?: boolean;
}

/** Vending ids accepted by VEND (CONSUME itemIds stay open strings). */
export type VendId = 'ration_tin' | 'recycled_water' | 'suit_patch';

export const VEND_IDS: readonly VendId[] = ['ration_tin', 'recycled_water', 'suit_patch'] as const;

export function isVendId(value: unknown): value is VendId {
  return value === 'ration_tin' || value === 'recycled_water' || value === 'suit_patch';
}

/** Meal tiers consumed via CONSUME (open itemId, documented here). */
export type MealId = 'nutrient_paste' | 'raw_greens' | 'hot_meal';
