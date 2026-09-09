/**
 * Harbor identity: callsign + pawn tint + diegetic trim/thruster accents.
 * Persisted to localStorage so the menu, customization, and reconnects
 * share one identity. Pure storage helpers so Vitest drives them with a
 * fake store; HarborApp passes window.localStorage in production.
 */

import {
  DEFAULT_APPEARANCE,
  isHexColor,
  isPawnTrim,
  isThrusterTint,
  type PawnTrim,
  type ThrusterTint,
} from '@kybernetes/protocol';

export interface HarborIdentityState {
  readonly userId: string;
  readonly callsign: string;
  readonly color: string;
  readonly trim: PawnTrim;
  readonly thruster: ThrusterTint;
}

export type IdentityStore = Pick<Storage, 'getItem' | 'setItem'>;

const DEFAULT_COLOR = '#ffd166';
const MAX_CALLSIGN = 24;

export function sanitizeCallsign(raw: unknown): string {
  if (typeof raw !== 'string') return 'Rook';
  const trimmed = raw.trim().slice(0, MAX_CALLSIGN);
  return trimmed.length > 0 ? trimmed : 'Rook';
}

export function sanitizeColor(raw: unknown): string {
  return isHexColor(raw) ? raw : DEFAULT_COLOR;
}

function randomUserId(): string {
  return 'u-' + Math.random().toString(36).slice(2, 10);
}

export function loadIdentity(store: IdentityStore): HarborIdentityState {
  let userId = store.getItem('harbor.userId');
  if (userId === null || userId.length === 0) {
    userId = randomUserId();
    try {
      store.setItem('harbor.userId', userId);
    } catch {
      // Private-mode storage; identity still works for this session.
    }
  }
  const callsign = sanitizeCallsign(store.getItem('harbor.callsign') ?? 'Rook');
  const color = sanitizeColor(store.getItem('harbor.color') ?? DEFAULT_COLOR);
  const rawTrim = store.getItem('harbor.trim');
  const rawThruster = store.getItem('harbor.thruster');
  const trim = isPawnTrim(rawTrim) ? rawTrim : DEFAULT_APPEARANCE.trim;
  const thruster = isThrusterTint(rawThruster) ? rawThruster : DEFAULT_APPEARANCE.thruster;
  return { userId, callsign, color, trim, thruster };
}

export function saveIdentity(store: IdentityStore, identity: HarborIdentityState): void {
  store.setItem('harbor.userId', identity.userId);
  store.setItem('harbor.callsign', sanitizeCallsign(identity.callsign));
  store.setItem('harbor.color', sanitizeColor(identity.color));
  store.setItem('harbor.trim', isPawnTrim(identity.trim) ? identity.trim : DEFAULT_APPEARANCE.trim);
  const thruster = isThrusterTint(identity.thruster)
    ? identity.thruster
    : DEFAULT_APPEARANCE.thruster;
  store.setItem('harbor.thruster', thruster);
}
