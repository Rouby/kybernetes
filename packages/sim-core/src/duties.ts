import type { DutyDefinition, PlayerVitals, StartingRole } from '@kybernetes/protocol';
import { ROLE_DEFINITIONS } from './roles';
import type { VesselSimulationState } from './state';
import { calibrateScrubbers } from './systems/lifeSupport';
import { purgeReactorCoolant, scrubPlasmaGrid } from './systems/reactor';

export interface ActiveDutyState {
  dutyId: string;
  stationId: string;
  progressSeconds: number;
  durationSeconds: number;
  isCompleted: boolean;
}

const GENERAL_DUTIES: DutyDefinition[] = [
  {
    id: 'bridge_sensors',
    stationType: 'bridge',
    name: 'Calibrate Sub-Light Sensors',
    description: 'Align deep-space LIDAR arrays and filter asteroid clutter echoes.',
    durationSeconds: 12,
    staminaCostPerSecond: 1.8,
    creditReward: 30,
    clearanceXp: 20,
  },
  {
    id: 'avionics_diagnostics',
    stationType: 'avionics',
    name: 'Run Avionics Diagnostics',
    description: 'Cycle logic gates and verify optical bus routing across the primary nav-matrix.',
    durationSeconds: 10,
    staminaCostPerSecond: 1.5,
    creditReward: 25,
    clearanceXp: 15,
  },
  {
    id: 'airlock_cycle_drill',
    stationType: 'airlock',
    name: 'Test Pressure Seals',
    description: 'Pressurize and vacuum-seal the chamber seals to certify outer hatch tolerance.',
    durationSeconds: 8,
    staminaCostPerSecond: 1.5,
    creditReward: 20,
    clearanceXp: 12,
  },
];

export function getAllDuties(): DutyDefinition[] {
  const roleDuties = Object.values(ROLE_DEFINITIONS).flatMap((r) => r.duties);
  return [...roleDuties, ...GENERAL_DUTIES];
}

export function getDutyById(dutyId: string): DutyDefinition | undefined {
  return getAllDuties().find((d) => d.id === dutyId);
}

export function getDutiesForStation(stationType: string): DutyDefinition[] {
  return getAllDuties().filter((d) => d.stationType === stationType);
}

export function startDuty(dutyId: string, stationId: string): ActiveDutyState | null {
  const def = getDutyById(dutyId);
  if (!def) return null;
  return {
    dutyId,
    stationId,
    progressSeconds: 0,
    durationSeconds: def.durationSeconds,
    isCompleted: false,
  };
}

export function tickActiveDuty(
  duty: ActiveDutyState,
  dtSeconds: number,
  role: StartingRole,
  vitals: PlayerVitals
): { nextDuty: ActiveDutyState; staminaCost: number; completed: boolean } {
  if (duty.isCompleted) {
    return { nextDuty: duty, staminaCost: 0, completed: true };
  }

  const def = getDutyById(duty.dutyId);
  if (!def) {
    return { nextDuty: { ...duty, isCompleted: true }, staminaCost: 0, completed: true };
  }

  // Starvation or dehydration slows duty completion speed by half (PRD 3.6)
  const isImpaired = vitals.hunger < 20 || vitals.thirst < 20;
  const speedMultiplier = isImpaired ? 0.5 : 1.0;

  // Role specialization grants 20% speed bonus
  const roleBonusMultiplier = def.roleBonus === role ? 1.2 : 1.0;
  const effectiveDt = dtSeconds * speedMultiplier * roleBonusMultiplier;

  const nextProgress = Math.min(duty.durationSeconds, duty.progressSeconds + effectiveDt);
  const completed = nextProgress >= duty.durationSeconds;
  const staminaCost = dtSeconds * def.staminaCostPerSecond;

  return {
    nextDuty: {
      ...duty,
      progressSeconds: Number(nextProgress.toFixed(2)),
      isCompleted: completed,
    },
    staminaCost: Number(staminaCost.toFixed(2)),
    completed,
  };
}

export function calculateClearanceRank(
  role: StartingRole,
  clearanceLevel: number
): { rankTitle: string; rankBadge: string; salaryMultiplier: number } {
  const level = Math.max(1, Math.min(5, Math.floor(clearanceLevel)));
  const rolePrefixes: Record<StartingRole, string> = {
    wiper: 'ENG',
    galley_hand: 'LOG',
    security_private: 'SEC',
    hydro_tender: 'BIO',
    stevedore: 'HLD',
  };
  const prefix = rolePrefixes[role] || 'CREW';

  if (level === 2) {
    return {
      rankTitle: 'Junior Specialist Grade 2',
      rankBadge: `${prefix}-2`,
      salaryMultiplier: 1.25,
    };
  }
  if (level === 3) {
    return {
      rankTitle: 'Senior Technician Grade 1',
      rankBadge: `${prefix}-1`,
      salaryMultiplier: 1.5,
    };
  }
  if (level === 4) {
    return {
      rankTitle: 'Department Watch Lead',
      rankBadge: `${prefix}-LEAD`,
      salaryMultiplier: 1.8,
    };
  }
  if (level >= 5) {
    return { rankTitle: 'Chief Specialist', rankBadge: `CHIEF-${prefix}`, salaryMultiplier: 2.2 };
  }
  return { rankTitle: 'Recruit Grade 3', rankBadge: `${prefix}-3`, salaryMultiplier: 1.0 };
}

export function calculateDutyRewards(
  dutyId: string,
  role: StartingRole,
  clearanceLevel = 1
): { credits: number; xp: number } {
  const def = getDutyById(dutyId);
  if (!def) return { credits: 0, xp: 0 };

  const isRoleBonus = def.roleBonus === role;
  const bonusMultiplier = isRoleBonus ? 1.25 : 1.0;
  const rank = calculateClearanceRank(role, clearanceLevel);

  return {
    credits: Math.round(def.creditReward * bonusMultiplier * rank.salaryMultiplier),
    xp: Math.round(def.clearanceXp * bonusMultiplier),
  };
}

function applyReactorDutyImpact(
  state: VesselSimulationState,
  dutyId: string
): { nextState: VesselSimulationState; message: string } {
  if (dutyId === 'purge_coolant') {
    const nextReactor = purgeReactorCoolant(state.reactor);
    return {
      nextState: { ...state, reactor: nextReactor, reactorTemp: nextReactor.tempKelvin },
      message: 'Cryogenic coolant lines purged: core temp dropped.',
    };
  }
  const nextReactor = scrubPlasmaGrid(state.reactor);
  return {
    nextState: { ...state, reactor: nextReactor, reactorTemp: nextReactor.tempKelvin },
    message: 'Reactor plasma grid scrubbed: heat dissipation nominal.',
  };
}

function applySuppliesDutyImpact(
  state: VesselSimulationState,
  dutyId: string
): { nextState: VesselSimulationState; message: string } {
  if (dutyId === 'mix_protein') {
    const supplies = { ...state.supplies, rations: Math.min(200, state.supplies.rations + 15) };
    return {
      nextState: { ...state, supplies },
      message: 'Protein batch synthesized: +15 rations stocked.',
    };
  }
  const supplies = {
    ...state.supplies,
    waterLitres: Math.min(500, state.supplies.waterLitres + 25),
  };
  return {
    nextState: { ...state, supplies },
    message: 'Reservoir restocked: +25L water filtered.',
  };
}

function applyDefenseOrHullDutyImpact(
  state: VesselSimulationState,
  dutyId: string
): { nextState: VesselSimulationState; message: string } {
  if (dutyId === 'sentry_watch' || dutyId === 'inventory_armory') {
    const defense = {
      ...state.defense,
      pdtAmmo: Math.min(200, state.defense.pdtAmmo + 20),
      pdtReady: true,
    };
    return {
      nextState: { ...state, defense },
      message: 'Armory readiness drill complete: PDT ammunition restocked.',
    };
  }
  const hull = { ...state.hull, integrityPercent: Math.min(100, state.hull.integrityPercent + 4) };
  return {
    nextState: { ...state, hull, hullIntegrityPercent: hull.integrityPercent },
    message: 'Micro-stress fractures reinforced: +4% hull integrity.',
  };
}

export function applyDutySubsystemImpact(
  state: VesselSimulationState,
  dutyId: string
): { nextState: VesselSimulationState; message: string } {
  if (dutyId === 'scrub_plasma' || dutyId === 'purge_coolant') {
    return applyReactorDutyImpact(state, dutyId);
  }
  if (dutyId === 'calibrate_scrubbers' || dutyId === 'tend_scrubbers') {
    const nextLs = calibrateScrubbers(state.lifeSupport);
    return {
      nextState: { ...state, lifeSupport: nextLs, oxygenLevelPercent: nextLs.o2LevelPercent },
      message: 'CO2 scrubbers recalibrated: atmospheric replenishment restored.',
    };
  }
  if (dutyId === 'mix_protein' || dutyId === 'brew_recaf' || dutyId === 'restock_water') {
    return applySuppliesDutyImpact(state, dutyId);
  }
  if (
    dutyId === 'weld_stress' ||
    dutyId === 'salvage_scrap' ||
    dutyId === 'sentry_watch' ||
    dutyId === 'inventory_armory'
  ) {
    return applyDefenseOrHullDutyImpact(state, dutyId);
  }
  return { nextState: state, message: `Duty ${dutyId} executed satisfactorily.` };
}
