import type { DutyDefinition, StartingRole } from '@kybernetes/protocol';

export interface RoleDefinition {
  role: StartingRole;
  name: string;
  department: string;
  startingStationId: string;
  startingDeckId: string;
  trait: string;
  badge: string;
  color: string;
  duties: DutyDefinition[];
}

export const ROLE_DEFINITIONS: Record<StartingRole, RoleDefinition> = {
  wiper: {
    role: 'wiper',
    name: 'Maintenance Wiper',
    department: 'Engineering',
    startingStationId: 'reactor_primary_console',
    startingDeckId: 'deck_d',
    trait: '+15% repair speed, +20% thermal resistance in hot compartments',
    badge: 'ENG-3',
    color: '#ffb000',
    duties: [
      {
        id: 'scrub_plasma',
        stationType: 'reactor',
        name: 'Scrub Plasma Grids',
        description:
          'Remove carbonized slag and ionizing residue from primary magnetic constrictors.',
        durationSeconds: 10,
        staminaCostPerSecond: 2.5,
        creditReward: 25,
        clearanceXp: 15,
        roleBonus: 'wiper',
      },
      {
        id: 'purge_coolant',
        stationType: 'reactor',
        name: 'Purge Coolant Lines',
        description: 'Cycle high-pressure cryogenic fluid through emergency thermal bleed valves.',
        durationSeconds: 15,
        staminaCostPerSecond: 3.0,
        creditReward: 40,
        clearanceXp: 25,
        roleBonus: 'wiper',
      },
    ],
  },
  galley_hand: {
    role: 'galley_hand',
    name: 'Galley Hand',
    department: 'Sustenance & Logistics',
    startingStationId: 'galley_prep_station',
    startingDeckId: 'deck_b',
    trait: '-20% personal food/water consumption rate, +10% stamina recovery aura',
    badge: 'LOG-3',
    color: '#00e5ff',
    duties: [
      {
        id: 'mix_protein',
        stationType: 'mess',
        name: 'Mix Protein Batches',
        description:
          'Blend dehydrated yeast flakes, lipids, and vitamin powders into edible paste cubes.',
        durationSeconds: 8,
        staminaCostPerSecond: 1.5,
        creditReward: 20,
        clearanceXp: 12,
        roleBonus: 'galley_hand',
      },
      {
        id: 'brew_recaf',
        stationType: 'mess',
        name: 'Brew Recaf Vat',
        description:
          'Distill chicory substitute and synthetic caffeine concentrate for watch shifts.',
        durationSeconds: 12,
        staminaCostPerSecond: 2.0,
        creditReward: 30,
        clearanceXp: 18,
        roleBonus: 'galley_hand',
      },
    ],
  },
  security_private: {
    role: 'security_private',
    name: 'Security Private',
    department: 'Ship Defense & Armory',
    startingStationId: 'armory_tactical_locker',
    startingDeckId: 'deck_c',
    trait: '+25% combat efficiency, +15% baseline damage resistance against boarders',
    badge: 'SEC-3',
    color: '#ff2244',
    duties: [
      {
        id: 'sentry_watch',
        stationType: 'armory',
        name: 'Sentry Watch Drill',
        description: 'Monitor motion sensor sweeps and inspect blast door perimeter locks.',
        durationSeconds: 10,
        staminaCostPerSecond: 2.0,
        creditReward: 25,
        clearanceXp: 15,
        roleBonus: 'security_private',
      },
      {
        id: 'inspect_ammo',
        stationType: 'armory',
        name: 'Inspect Ammo Chutes',
        description: 'Clear feed jams and grease magnetic rails on point-defense ammo linkages.',
        durationSeconds: 14,
        staminaCostPerSecond: 2.5,
        creditReward: 35,
        clearanceXp: 22,
        roleBonus: 'security_private',
      },
    ],
  },
  hydro_tender: {
    role: 'hydro_tender',
    name: 'Hydroponics Tender',
    department: 'Biosphere & Life Support',
    startingStationId: 'life_support_scrubber',
    startingDeckId: 'deck_b',
    trait: '+20% atmospheric scrubber efficiency, immune to low-grade bio-toxins',
    badge: 'BIO-3',
    color: '#00ff66',
    duties: [
      {
        id: 'calibrate_scrubbers',
        stationType: 'hydroponics',
        name: 'Calibrate CO2 Scrubbers',
        description:
          'Clean chemical absorption honeycombs and replace saturated zeolite cartridges.',
        durationSeconds: 10,
        staminaCostPerSecond: 2.0,
        creditReward: 25,
        clearanceXp: 15,
        roleBonus: 'hydro_tender',
      },
      {
        id: 'tend_spirulina',
        stationType: 'hydroponics',
        name: 'Tend Spirulina Vats',
        description:
          'Aerate green algae cultures and balance nutrient alkalinity for peak O2 production.',
        durationSeconds: 12,
        staminaCostPerSecond: 2.2,
        creditReward: 32,
        clearanceXp: 20,
        roleBonus: 'hydro_tender',
      },
    ],
  },
  stevedore: {
    role: 'stevedore',
    name: 'Cargo Stevedore',
    department: 'Hold Logistics & Salvage',
    startingStationId: 'cargo_mag_winch',
    startingDeckId: 'deck_c',
    trait: '+30% inventory carry capacity, +15% bonus scrap yield from salvage',
    badge: 'HLD-3',
    color: '#ffaa33',
    duties: [
      {
        id: 'sort_slag',
        stationType: 'cargo',
        name: 'Sort Raw Slag',
        description: 'Manually sift magnetic ore fines and discard crushed silicate tailings.',
        durationSeconds: 10,
        staminaCostPerSecond: 2.8,
        creditReward: 25,
        clearanceXp: 15,
        roleBonus: 'stevedore',
      },
      {
        id: 'rig_winches',
        stationType: 'cargo',
        name: 'Rig Cargo Winches',
        description:
          'Tension high-tensile carbon cables and dog down heavy container magnetic latches.',
        durationSeconds: 15,
        staminaCostPerSecond: 3.2,
        creditReward: 42,
        clearanceXp: 26,
        roleBonus: 'stevedore',
      },
    ],
  },
};

export function getRoleDefinition(role: StartingRole): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}

export function getAllRoles(): RoleDefinition[] {
  return Object.values(ROLE_DEFINITIONS);
}
