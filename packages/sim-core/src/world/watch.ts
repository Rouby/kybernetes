/**
 * Watch rotation: the core loop. Role tasks advance while assignees are aboard,
 * end-of-watch grades S/A/B/C pay credits, XP, and clearance. Pure and
 * deterministic; the tick driver lives in tickWorld via tickWatches.
 */

import type { Role } from '@kybernetes/protocol';
import { TRANSIT_S } from './schedule.js';
import type { World } from './types.js';

export type WatchGrade = 'S' | 'A' | 'B' | 'C';

export interface WatchTask {
  readonly id: string;
  readonly label: string;
  readonly role: Role;
  readonly pawnId: string;
  readonly progress: number;
  readonly done: boolean;
}

export interface WatchState {
  readonly vesselId: string;
  readonly watchNo: number;
  readonly legIndex: number;
  readonly section: 'alpha' | 'bravo';
  readonly remainingS: number;
  readonly totalS: number;
  readonly tasks: readonly WatchTask[];
  readonly grade: '' | WatchGrade;
  readonly rewarded: boolean;
}

export interface WatchAssignment {
  readonly pawnId: string;
  readonly role: Role;
}

export const TASK_CATALOG: Readonly<Record<Role, readonly [string, string]>> = {
  engineer: ['Reactor stability check', 'Coolant loop inspection'],
  deckhand: ['Cargo manifest audit', 'Corridor upkeep sweep'],
  cook: ['Galley prep and service', 'Water ration inventory'],
  security: ['Perimeter patrol', 'Airlock discipline check'],
};

export interface GradeReward {
  readonly credits: number;
  readonly xp: number;
  readonly clearanceDelta: number;
}

export const GRADE_REWARDS: Readonly<Record<WatchGrade, GradeReward>> = {
  S: { credits: 200, xp: 100, clearanceDelta: 1 },
  A: { credits: 160, xp: 80, clearanceDelta: 0 },
  B: { credits: 130, xp: 60, clearanceDelta: 0 },
  C: { credits: 100, xp: 50, clearanceDelta: 0 },
};

export function startWatch(
  vesselId: string,
  watchNo: number,
  legIndex: number,
  assignments: readonly WatchAssignment[],
  durationS: number
): WatchState {
  const taken = new Map<Role, number>();
  const tasks = assignments.map((assignment) => taskFor(vesselId, watchNo, assignment, taken));
  return {
    vesselId,
    watchNo,
    legIndex,
    section: watchNo % 2 === 1 ? 'alpha' : 'bravo',
    remainingS: durationS,
    totalS: durationS,
    tasks,
    grade: '',
    rewarded: false,
  };
}

function taskFor(
  vesselId: string,
  watchNo: number,
  assignment: WatchAssignment,
  taken: Map<Role, number>
): WatchTask {
  const catalog = TASK_CATALOG[assignment.role];
  const index = (taken.get(assignment.role) ?? 0) % catalog.length;
  taken.set(assignment.role, (taken.get(assignment.role) ?? 0) + 1);
  const label = catalog[index] ?? assignment.role;
  return {
    id: `${vesselId}.w${watchNo}.${assignment.pawnId}.${index}`,
    label,
    role: assignment.role,
    pawnId: assignment.pawnId,
    progress: 0,
    done: false,
  };
}

export function tickWatch(
  state: WatchState,
  dtSeconds: number,
  aboard: ReadonlySet<string>
): WatchState {
  if (!(dtSeconds > 0) || state.remainingS <= 0) return state;
  const rate = dtSeconds / Math.max(state.totalS, 0.01);
  const tasks = state.tasks.map((task) => advanceTask(task, aboard.has(task.pawnId) ? rate : 0));
  return { ...state, tasks, remainingS: Math.max(0, state.remainingS - dtSeconds) };
}

function advanceTask(task: WatchTask, rate: number): WatchTask {
  if (task.done || !(rate > 0)) return task;
  const progress = Math.min(1, task.progress + rate * 1.2);
  return { ...task, progress, done: progress >= 1 };
}

export function projectGrade(tasks: readonly WatchTask[]): WatchGrade {
  if (tasks.length === 0) return 'C';
  const done = tasks.filter((task) => task.done).length;
  return gradeForFraction(done / tasks.length);
}

export function gradeForFraction(fraction: number): WatchGrade {
  if (fraction >= 1) return 'S';
  if (fraction >= 0.75) return 'A';
  if (fraction >= 0.5) return 'B';
  return 'C';
}

export function finishWatch(state: WatchState): WatchState {
  if (state.rewarded || state.remainingS > 0) return state;
  return { ...state, grade: projectGrade(state.tasks), rewarded: true };
}

export function tickWatches(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  let next = world;
  for (const vessel of Object.values(world.vessels)) {
    next = tickVesselWatch(next, vessel.id, dtSeconds);
  }
  return next;
}

function maybeStartWatch(
  world: World,
  vesselId: string,
  vessel: NonNullable<World['vessels'][string]>,
  transit: NonNullable<World['transit'][string]>,
  watch: World['watches'][string]
): World | undefined {
  if (vessel.schedule !== 'in_transit') return undefined;
  if (watch !== undefined && watch.legIndex === transit.legIndex) return undefined;
  const started = startWatch(
    vesselId,
    (watch?.watchNo ?? 0) + 1,
    transit.legIndex,
    assignmentsAboard(world, vesselId),
    TRANSIT_S
  );
  return { ...world, watches: { ...world.watches, [vesselId]: started } };
}

function tickVesselWatch(world: World, vesselId: string, dtSeconds: number): World {
  const vessel = world.vessels[vesselId];
  const transit = world.transit[vesselId];
  if (vessel === undefined || transit === undefined) return world;
  const started = maybeStartWatch(world, vesselId, vessel, transit, world.watches[vesselId]);
  if (started !== undefined) return started;
  const watch = world.watches[vesselId];
  if (watch === undefined) return world;
  const ticked = finishWatch(tickWatch(watch, dtSeconds, pawnsAboard(world, vesselId)));
  let next: World = { ...world, watches: { ...world.watches, [vesselId]: ticked } };
  if (ticked.rewarded && !watch.rewarded) next = payCrew(next, ticked);
  return next;
}

function pawnsAboard(world: World, vesselId: string): Set<string> {
  const aboard = new Set<string>();
  for (const pawn of Object.values(world.pawns)) {
    if (pawn.frameId === vesselId) aboard.add(pawn.id);
  }
  return aboard;
}

function assignmentsAboard(world: World, vesselId: string): { pawnId: string; role: Role }[] {
  const assignments: { pawnId: string; role: Role }[] = [];
  for (const record of Object.values(world.crew)) {
    if (record.role === 'captain') continue;
    if (world.pawns[record.pawnId]?.frameId !== vesselId) continue;
    assignments.push({ pawnId: record.pawnId, role: record.role });
  }
  return assignments;
}

function payCrew(world: World, watch: WatchState): World {
  const reward = GRADE_REWARDS[watch.grade === '' ? 'C' : watch.grade];
  const crew = { ...world.crew };
  for (const task of watch.tasks) {
    const record = crew[task.pawnId];
    if (record === undefined) continue;
    crew[task.pawnId] = {
      ...record,
      credits: record.credits + reward.credits,
      xp: record.xp + reward.xp,
      clearance: Math.min(10, record.clearance + reward.clearanceDelta),
    };
  }
  return { ...world, crew };
}
