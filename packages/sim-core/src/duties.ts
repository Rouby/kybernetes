import type { DutyDefinition, PlayerVitals, StartingRole } from '@kybernetes/protocol';
import { ROLE_DEFINITIONS } from './roles';

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

export function calculateDutyRewards(
  dutyId: string,
  role: StartingRole
): { credits: number; xp: number } {
  const def = getDutyById(dutyId);
  if (!def) return { credits: 0, xp: 0 };

  const isRoleBonus = def.roleBonus === role;
  const bonusMultiplier = isRoleBonus ? 1.25 : 1.0;

  return {
    credits: Math.round(def.creditReward * bonusMultiplier),
    xp: Math.round(def.clearanceXp * bonusMultiplier),
  };
}
