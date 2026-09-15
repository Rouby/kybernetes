/**
 * Protocol v2 content: role and weapon enums.
 * Roles replace the StartingRole vs HireableJob split (old values map once at join);
 * WeaponType was moved verbatim from deprecated `boarding.ts` for the frozen HUD/renderer/audio stack.
 */

export type Role = 'engineer' | 'deckhand' | 'cook' | 'security';

export type NpcRole = Role | 'captain';

export const ROLES: readonly Role[] = ['engineer', 'deckhand', 'cook', 'security'] as const;

/** Render/audio weapon id. v2 intents carry `weapon: string` (see `FIRE`); narrow at the edges. */
export type WeaponType = 'kinetic_carbine' | 'pulse_laser' | 'arc_welder' | 'railgun_pistol';

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
