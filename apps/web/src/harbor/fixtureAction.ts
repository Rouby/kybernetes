/**
 * Living fixture use-actions: nearest-fixture scan plus context intent
 * and HUD prompt mapping. Pure and unit-tested; HarborApp owns the
 * keybindings and socket, HarborViewport owns the world-space prompt.
 */

import type { ClientIntent, FixtureKind, FixtureSnapshot } from '@kybernetes/protocol';

export interface FixtureContact {
  readonly id: string;
  readonly kind: FixtureKind;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly integrity: number;
  readonly online: boolean;
  readonly claimedBy?: string;
  readonly progressPct?: number;
  readonly levelPct?: number;
  readonly dist: number;
}

export const FIXTURE_USE_RADIUS_PX = 110;

export function toContact(fixture: FixtureSnapshot, at: { x: number; y: number }): FixtureContact {
  return {
    id: fixture.id,
    kind: fixture.kind,
    roomId: fixture.roomId,
    x: fixture.x,
    y: fixture.y,
    integrity: fixture.integrity,
    online: fixture.online,
    claimedBy: fixture.claimedBy,
    progressPct: fixture.progressPct,
    levelPct: fixture.levelPct,
    dist: Math.hypot(fixture.x - at.x, fixture.y - at.y),
  };
}

/** Nearest fixture on the pawn's frame within use radius. Frame-local coords. */
export function scanFixtures(
  fixtures: readonly FixtureSnapshot[] | undefined,
  frameId: string,
  at: { x: number; y: number },
  maxDist = FIXTURE_USE_RADIUS_PX
): FixtureContact | null {
  if (fixtures === undefined) return null;
  let best: FixtureContact | null = null;
  for (const fixture of fixtures) {
    if (frameOf(fixture.roomId) !== frameId) continue;
    const contact = toContact(fixture, at);
    if (contact.dist > maxDist) continue;
    if (best === null || contact.dist < best.dist) best = contact;
  }
  return best;
}

export function frameOf(roomId: string): string {
  const dot = roomId.indexOf('.');
  return dot < 0 ? roomId : roomId.slice(0, dot);
}

function isFixtureBroken(contact: FixtureContact): boolean {
  return !contact.online || contact.integrity <= 0;
}

/** Context intent for [E]: repair when broken, claim when claimable, else use. */
export function fixtureUseIntent(contact: FixtureContact): ClientIntent {
  if (isFixtureBroken(contact)) return { type: 'REPAIR', seq: 0, fixtureId: contact.id };
  if (
    (contact.kind === 'claim_bunk' || contact.kind === 'personal_locker') &&
    contact.claimedBy === undefined
  ) {
    return { type: 'CLAIM', seq: 0, fixtureId: contact.id };
  }
  switch (contact.kind) {
    case 'vending_wall':
      return { type: 'VEND', seq: 0, fixtureId: contact.id, vendId: 'ration_tin' };
    case 'stove':
      return { type: 'COOK', seq: 0, stoveId: contact.id };
    case 'hydro_tray':
      return { type: 'HARVEST', seq: 0, trayId: contact.id };
    case 'water_recycler':
      return { type: 'RECYCLE', seq: 0, recyclerId: contact.id };
    case 'breaker_box':
      return { type: 'REPAIR', seq: 0, fixtureId: contact.id };
    default:
      return { type: 'INTERACT', seq: 0, fixtureId: contact.id };
  }
}

/** Short HUD action name for the [E] prompt. */
export function fixturePrompt(contact: FixtureContact): string {
  if (isFixtureBroken(contact)) return 'Repair ' + fixtureNoun(contact.kind);
  if (
    (contact.kind === 'claim_bunk' || contact.kind === 'personal_locker') &&
    contact.claimedBy === undefined
  ) {
    return contact.kind === 'claim_bunk' ? 'Claim bunk' : 'Claim locker';
  }
  switch (contact.kind) {
    case 'vending_wall':
      return 'Vend ration';
    case 'stove':
      return contact.progressPct !== undefined && contact.progressPct > 0 ? 'Cooking' : 'Cook meal';
    case 'hydro_tray':
      return 'Harvest greens';
    case 'water_recycler':
      return 'Recycle water';
    case 'breaker_box':
      return 'Reset breaker';
    case 'aid_cabinet':
      return 'Bandage';
    case 'sink':
      return 'Drink water';
    case 'mess_table':
      return 'Eat meal';
    case 'freezer':
      return 'Check freezer';
    case 'bar_counter':
      return 'Order drink';
    case 'market_stall':
      return 'Trade';
    case 'job_board':
      return 'Browse contracts';
    default:
      return 'Use';
  }
}

function fixtureNoun(kind: FixtureKind): string {
  switch (kind) {
    case 'stove':
      return 'stove';
    case 'hydro_tray':
      return 'hydro tray';
    case 'water_recycler':
      return 'recycler';
    case 'breaker_box':
      return 'breaker';
    case 'freezer':
      return 'freezer';
    case 'vending_wall':
      return 'vendor';
    case 'claim_bunk':
      return 'bunk';
    case 'personal_locker':
      return 'locker';
    default:
      return 'fixture';
  }
}
