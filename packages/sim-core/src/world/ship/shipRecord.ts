/**
 * Solo-ship ownership record (TRANSFORM M1). Pure data + transitions.
 * One persistent ship per player: hull, reactor/engine tiers, credits,
 * stores, condition, home hub. No DOM/Node imports.
 *
 * Mapping from the hire loop: StartingRole/HireableJob -> deleted (solo, no
 * roles); WATCH -> NAV_STATE (M3); duty -> chore (M2); macro supplies ->
 * ShipStores below (M5 consumes them).
 */

export type ReactorTier = 0 | 1 | 2;

export type EngineTier = 0 | 1 | 2;

export interface ShipStores {
  readonly rations: number;
  readonly waterL: number;
  readonly o2Cells: number;
  readonly fuelCells: number;
}

export interface ShipRecord {
  readonly ownerId: string;
  readonly shipId: string;
  readonly hullId: string;
  readonly reactorTier: ReactorTier;
  readonly engineTier: EngineTier;
  readonly credits: number;
  /** Hull condition 0-100. At 0 the ship is lost (M6 wipe). */
  readonly condition: number;
  readonly locationHubId: string;
  readonly alive: boolean;
  readonly stores: ShipStores;
  /** Flyable fuel-value in the engine bunker (loose cells live in stores). */
  readonly engineFuel: number;
}

export const STARTER_HULL_ID = 'skiff_alpha';

export const STARTER_HUB_ID = 'hub_a';

const STARTER_STORES: ShipStores = { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 };

export function createStarterSkiff(ownerId: string): ShipRecord {
  return {
    ownerId,
    shipId: `ship:${ownerId}`,
    hullId: STARTER_HULL_ID,
    reactorTier: 0,
    engineTier: 0,
    credits: 20,
    condition: 100,
    locationHubId: STARTER_HUB_ID,
    alive: true,
    stores: { ...STARTER_STORES },
    engineFuel: 0,
  };
}

export function isShipLost(record: ShipRecord): boolean {
  return !record.alive || record.condition <= 0;
}

/** Hard-fail wipe (TRANSFORM: lose ship / game over). Returns a dead record. */
export function wipeOnLoss(record: ShipRecord): ShipRecord {
  return { ...record, alive: false, condition: 0, credits: 0 };
}

/** Fresh restart after loss: new starter skiff for the same owner. */
export function restartSkiff(ownerId: string): ShipRecord {
  return createStarterSkiff(ownerId);
}

export function creditShip(record: ShipRecord, amount: number): ShipRecord {
  if (!Number.isFinite(amount) || amount < 0) return record;
  return { ...record, credits: record.credits + amount };
}

export function debitShip(record: ShipRecord, amount: number): ShipRecord | undefined {
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  if (record.credits < amount) return undefined;
  return { ...record, credits: record.credits - amount };
}

export function damageShip(record: ShipRecord, amount: number): ShipRecord {
  if (!Number.isFinite(amount) || amount <= 0) return record;
  const condition = Math.max(0, record.condition - amount);
  const wiped = { ...record, condition };
  return condition <= 0 ? wipeOnLoss(wiped) : wiped;
}

export function serializeShipRecord(record: ShipRecord): string {
  return JSON.stringify(record);
}

export function restoreShipRecord(raw: string): ShipRecord | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<ShipRecord>;
    if (typeof parsed.ownerId !== 'string' || typeof parsed.shipId !== 'string') return undefined;
    if (typeof parsed.hullId !== 'string' || typeof parsed.locationHubId !== 'string') {
      return undefined;
    }
    if (!isTier(parsed.reactorTier) || !isTier(parsed.engineTier)) return undefined;
    if (!Number.isFinite(parsed.credits) || !Number.isFinite(parsed.condition)) return undefined;
    if (typeof parsed.alive !== 'boolean' || !isStores(parsed.stores)) return undefined;
    const engineFuel = parseEngineFuel(parsed.engineFuel);
    if (engineFuel === undefined) return undefined;
    return { ...(parsed as ShipRecord), engineFuel };
  } catch {
    return undefined;
  }
}

function parseEngineFuel(value: unknown): number | undefined {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || (value as number) < 0) return undefined;
  return Math.floor(value as number);
}

function isTier(value: unknown): value is ReactorTier {
  return value === 0 || value === 1 || value === 2;
}

function isStores(value: unknown): value is ShipStores {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    Number.isFinite(s.rations) &&
    Number.isFinite(s.waterL) &&
    Number.isFinite(s.o2Cells) &&
    Number.isFinite(s.fuelCells)
  );
}
