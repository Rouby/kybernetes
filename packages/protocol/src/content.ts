/**
 * Protocol v2 content: the ONE role enum.
 * Replaces StartingRole vs HireableJob split. Old values map once at join.
 */

export type Role = 'engineer' | 'deckhand' | 'cook' | 'security';

export type NpcRole = Role | 'captain';

export const ROLES: readonly Role[] = ['engineer', 'deckhand', 'cook', 'security'] as const;

export type LegacyStartingRole =
  | 'wiper'
  | 'galley_hand'
  | 'security_private'
  | 'hydro_tender'
  | 'stevedore';

export const LEGACY_ROLE_MAP: Readonly<Record<LegacyStartingRole, Role>> = {
  wiper: 'deckhand',
  galley_hand: 'cook',
  hydro_tender: 'engineer',
  stevedore: 'deckhand',
  security_private: 'security',
};

export type LegacyHireableJob = 'engineer' | 'cook' | 'deckhand';

export function normalizeRole(value: string): Role | undefined {
  if (isRole(value)) return value;
  return LEGACY_ROLE_MAP[value as LegacyStartingRole];
}

export function isRole(value: unknown): value is Role {
  return value === 'engineer' || value === 'deckhand' || value === 'cook' || value === 'security';
}
