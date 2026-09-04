import type {
  PlayerVitals,
  ShiftChecklistState,
  ShiftEvaluation,
  ShiftEvaluationGrade,
  ShiftTask,
  StartingRole,
} from '@kybernetes/protocol';
import { calculateClearanceRank } from '../duties';
import { ROLE_DEFINITIONS } from '../roles';

export function resolveTargetStationForDuty(role: StartingRole, stationType: string): string {
  const map: Record<string, string> = {
    reactor: 'reactor_primary_console',
    mess: 'galley_prep_station',
    hydroponics: 'hydro_algae_vats',
    armory: 'armory_tactical_locker',
    cargo: 'cargo_winch_main',
    bridge: 'bridge_helm',
    avionics: 'avionics_matrix',
    airlock: 'airlock_starboard',
    bunk: 'berth_pod_alpha',
  };
  return (
    map[stationType] ?? (ROLE_DEFINITIONS[role]?.startingStationId || 'reactor_primary_console')
  );
}

export function generateShiftChecklist(
  role: StartingRole,
  shiftNumber = 1,
  now = Date.now(),
  watchSection: 'alpha' | 'bravo' = 'alpha',
  clearanceLevel = 1
): ShiftChecklistState {
  const roleDef = ROLE_DEFINITIONS[role];
  const duties = roleDef?.duties ?? [];
  const rank = calculateClearanceRank(role, clearanceLevel);

  // Generate 3 sequential tasks alternating through role duties
  const tasks: ShiftTask[] = [];
  for (let i = 0; i < 3; i++) {
    const dutyIndex = (shiftNumber - 1 + i) % (duties.length || 1);
    const duty = duties[dutyIndex] || {
      id: `${role}_task_${i}`,
      stationType: 'mess',
      name: 'Maintenance Check',
      description: 'Perform assigned routine watch maintenance.',
      durationSeconds: 10,
      staminaCostPerSecond: 2,
      creditReward: 25,
      clearanceXp: 15,
    };

    tasks.push({
      id: `shift_${shiftNumber}_task_${i + 1}`,
      dutyId: duty.id,
      stationType: duty.stationType,
      name: duty.name,
      description: duty.description,
      targetStationId: resolveTargetStationForDuty(role, duty.stationType),
      completed: false,
    });
  }

  return {
    shiftNumber,
    role,
    tasks,
    currentTaskIndex: 0,
    startedAt: now,
    isCompleted: false,
    phase: 'active_watch',
    watchSection,
    rankTitle: rank.rankTitle,
    rankBadge: rank.rankBadge,
  };
}

export function advanceShiftTask(
  shift: ShiftChecklistState,
  dutyId: string
): { nextShift: ShiftChecklistState; taskCompleted: boolean; shiftFinished: boolean } {
  if (shift.isCompleted || shift.currentTaskIndex >= shift.tasks.length) {
    return { nextShift: shift, taskCompleted: false, shiftFinished: true };
  }

  const currentTask = shift.tasks[shift.currentTaskIndex];
  if (currentTask.dutyId !== dutyId) {
    return { nextShift: shift, taskCompleted: false, shiftFinished: false };
  }

  const updatedTasks = shift.tasks.map((t, idx) =>
    idx === shift.currentTaskIndex ? { ...t, completed: true } : t
  );
  const nextTaskIndex = shift.currentTaskIndex + 1;
  const shiftFinished = nextTaskIndex >= updatedTasks.length;

  return {
    nextShift: {
      ...shift,
      tasks: updatedTasks,
      currentTaskIndex: nextTaskIndex,
      isCompleted: shiftFinished,
      phase: shiftFinished ? 'off_duty' : 'active_watch',
    },
    taskCompleted: true,
    shiftFinished,
  };
}

export function calculateVitalsAverage(vitals: PlayerVitals): number {
  const nut = Math.max(0, Math.min(100, vitals.hunger));
  const hyd = Math.max(0, Math.min(100, vitals.thirst));
  const ftg = Math.max(0, Math.min(100, 100 - vitals.fatigue));
  const hp = Math.max(0, Math.min(100, vitals.health));
  const stm = Math.max(0, Math.min(100, (vitals.stamina / (vitals.maxStamina || 100)) * 100));

  return Number(((nut + hyd + ftg + hp + stm) / 5).toFixed(1));
}

export function calculateProjectedGrade(
  elapsedSeconds: number,
  vitals: PlayerVitals
): ShiftEvaluationGrade {
  const vitalsAvg = calculateVitalsAverage(vitals);

  if (elapsedSeconds <= 85 && vitalsAvg >= 65) {
    return 'S';
  }
  if (elapsedSeconds <= 145 && vitalsAvg >= 45) {
    return 'A';
  }
  if (elapsedSeconds <= 220 && vitalsAvg >= 25) {
    return 'B';
  }
  return 'C';
}

const EVAL_COMMENTS: Record<ShiftEvaluationGrade, string> = {
  S: 'COMMENDABLE PERFORMANCE: Exceptional departmental diligence under operational conditions.',
  A: 'MERITORIOUS WATCH: Shift checklist completed ahead of schedule with nominal crew vitals.',
  B: 'STANDARD ROTATION: Duties executed satisfactorily. Watch handover logged with bridge.',
  C: 'SUB-OPTIMAL ROTATION: Sluggish task cadence or depleted vitals detected. Counseling noted.',
};

export function evaluateShiftPerformance(
  shift: ShiftChecklistState,
  vitals: PlayerVitals,
  now = Date.now(),
  clearanceLevel = 1
): ShiftEvaluation {
  const elapsedSeconds = Math.max(1, Math.round((now - shift.startedAt) / 1000));
  const vitalsAvg = calculateVitalsAverage(vitals);
  const grade = calculateProjectedGrade(elapsedSeconds, vitals);

  const roleDef = ROLE_DEFINITIONS[shift.role];
  const rank = calculateClearanceRank(shift.role, clearanceLevel);
  let baseCredits = 0;
  let baseXp = 0;

  for (const task of shift.tasks) {
    const dutyDef = roleDef?.duties.find((d) => d.id === task.dutyId);
    baseCredits += Math.round((dutyDef?.creditReward ?? 25) * rank.salaryMultiplier);
    baseXp += dutyDef?.clearanceXp ?? 15;
  }

  let bonusCredits = 10;
  let bonusXp = 5;

  if (grade === 'S') {
    bonusCredits = Math.round(baseCredits * 0.75);
    bonusXp = Math.round(baseXp * 0.75);
  } else if (grade === 'A') {
    bonusCredits = Math.round(baseCredits * 0.45);
    bonusXp = Math.round(baseXp * 0.45);
  } else if (grade === 'B') {
    bonusCredits = Math.round(baseCredits * 0.2);
    bonusXp = Math.round(baseXp * 0.2);
  }

  return {
    shiftNumber: shift.shiftNumber,
    grade,
    elapsedSeconds,
    vitalsAverage: vitalsAvg,
    baseCredits,
    bonusCredits,
    baseXp,
    bonusXp,
    evaluationText: EVAL_COMMENTS[grade],
  };
}

export function handoverWatchRotation(
  shift: ShiftChecklistState,
  vitals: PlayerVitals,
  currentClearanceLevel = 1,
  currentClearanceXp = 0,
  now = Date.now()
): {
  evaluation: ShiftEvaluation;
  nextShift: ShiftChecklistState;
  newClearanceLevel: number;
  newClearanceXp: number;
  promoted: boolean;
} {
  const evalResult = evaluateShiftPerformance(shift, vitals, now, currentClearanceLevel);
  const totalXp = currentClearanceXp + evalResult.baseXp + evalResult.bonusXp;

  const thresholds = [50, 150, 350, 650];
  const targetThreshold = thresholds[currentClearanceLevel - 1] ?? 9999;
  const promoted = totalXp >= targetThreshold && currentClearanceLevel < 5;
  const newClearanceLevel = promoted ? currentClearanceLevel + 1 : currentClearanceLevel;
  const rank = calculateClearanceRank(shift.role, newClearanceLevel);

  evalResult.promoted = promoted;
  evalResult.newClearanceLevel = newClearanceLevel;
  evalResult.rankTitle = rank.rankTitle;
  evalResult.rankBadge = rank.rankBadge;

  const nextShift = generateShiftChecklist(
    shift.role,
    shift.shiftNumber + 1,
    now,
    shift.watchSection || 'alpha',
    newClearanceLevel
  );

  return {
    evaluation: evalResult,
    nextShift,
    newClearanceLevel,
    newClearanceXp: totalXp,
    promoted,
  };
}
