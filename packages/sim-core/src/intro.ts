import {
  type CaptainJobOfferBroadcast,
  type DockingPhase,
  type HireableJob,
  JOB_OFFER_CATALOG,
  type JobOffer,
  type VesselKinematics,
} from '@kybernetes/protocol';

export interface IntroState {
  phase: DockingPhase;
  shipName: string;
  destination: string;
  etaSeconds: number;
  legIndex: number;
  legDurationSeconds: number;
  progressPercent: number;
  offerId: string | null;
  offeredJobs: [JobOffer, JobOffer] | null;
  assignedJob: HireableJob | null;
  turnaroundSeconds: number;
}

export function createInitialIntroState(
  shipName = 'Kestrel',
  destination = 'Station B'
): IntroState {
  return {
    phase: 'inbound',
    shipName,
    destination,
    etaSeconds: 20,
    legIndex: 0,
    legDurationSeconds: 120,
    progressPercent: 0,
    offerId: null,
    offeredJobs: null,
    assignedJob: null,
    turnaroundSeconds: 30,
  };
}

export const STATION_TURNAROUND_SECONDS = 30;

export const DOCK_APPROACH_DISTANCE = 1400;

export function getEntrySide(legIndex: number): -1 | 1 {
  return legIndex % 2 === 0 ? -1 : 1;
}

export interface ShipDockingOffset {
  x: number;
  y: number;
}

function roundOffset(value: number): number {
  return Number(value.toFixed(2));
}

function smoothstep(u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  return clamped * clamped * (3 - 2 * clamped);
}

function smoothstepDerivative(u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  return 6 * clamped * (1 - clamped);
}

export function getShipKinematics(state: IntroState): VesselKinematics {
  const entrySide = getEntrySide(state.legIndex);
  const exitSide = (entrySide * -1) as -1 | 1;

  if (state.phase === 'docked') {
    return { x: 0, y: 0, vx: 0, vy: 0, flightMode: 'docked' };
  }
  if (state.phase === 'inbound') {
    const u = Math.min(1, Math.max(0, 1 - Math.max(0, state.etaSeconds) / 20));
    const progress = smoothstep(u);
    const x = roundOffset(entrySide * DOCK_APPROACH_DISTANCE * (1 - progress));
    const vx = roundOffset((-entrySide * DOCK_APPROACH_DISTANCE * smoothstepDerivative(u)) / 20);
    return { x, y: 0, vx, vy: 0, flightMode: 'inbound' };
  }
  if (state.phase === 'departing') {
    const u = Math.min(1, Math.max(0, 1 - Math.max(0, state.etaSeconds) / 5));
    const progress = smoothstep(u);
    const x = roundOffset(exitSide * DOCK_APPROACH_DISTANCE * progress);
    const vx = roundOffset((exitSide * DOCK_APPROACH_DISTANCE * smoothstepDerivative(u)) / 5);
    return { x, y: 0, vx, vy: 0, flightMode: 'departing' };
  }
  return {
    x: exitSide * DOCK_APPROACH_DISTANCE,
    y: 0,
    vx: 0,
    vy: 0,
    flightMode: state.phase,
  };
}

export function getShipDockingOffset(state: IntroState): ShipDockingOffset {
  const k = getShipKinematics(state);
  return { x: k.x, y: k.y };
}

const ORDER: readonly HireableJob[] = ['engineer', 'cook', 'deckhand'] as const;

export function pickJobOfferPair(seed: number): [JobOffer, JobOffer] {
  const start = ((Math.floor(seed) % ORDER.length) + ORDER.length) % ORDER.length;
  const first = ORDER[start] as HireableJob;
  const second = ORDER[(start + 1) % ORDER.length] as HireableJob;
  return [JOB_OFFER_CATALOG[first], JOB_OFFER_CATALOG[second]];
}

export function getNpcCrewForHire(playerJob: HireableJob): HireableJob[] {
  return ORDER.filter((j) => j !== playerJob);
}

export function openCaptainOffer(
  state: IntroState,
  offerId: string,
  seed: number
): { nextState: IntroState; offer: CaptainJobOfferBroadcast } {
  const jobs = pickJobOfferPair(seed);
  const nextState: IntroState = { ...state, offerId, offeredJobs: jobs };
  return {
    nextState,
    offer: {
      type: 'CAPTAIN_JOB_OFFER',
      offerId,
      captainId: 'captain_helm_01',
      captainName: 'Captain Reyes',
      jobs,
      timestamp: Date.now(),
    },
  };
}

function clampNonNegative(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function tickInbound(state: IntroState, dt: number): IntroState {
  const eta = clampNonNegative(state.etaSeconds - dt);
  if (eta <= 0) return { ...state, phase: 'docked', etaSeconds: 0 };
  return { ...state, etaSeconds: eta };
}

function tickDeparting(state: IntroState, dt: number): IntroState {
  const eta = clampNonNegative(state.etaSeconds - dt);
  if (eta <= 0) {
    return { ...state, phase: 'in_transit', etaSeconds: 0, progressPercent: 0 };
  }
  return { ...state, etaSeconds: eta };
}

function tickTransit(state: IntroState, dt: number): IntroState {
  const duration = Math.max(1, state.legDurationSeconds);
  const next = Math.min(100, state.progressPercent + (dt / duration) * 100);
  if (next >= 100) {
    return {
      ...state,
      phase: 'arrived',
      progressPercent: 100,
      turnaroundSeconds: STATION_TURNAROUND_SECONDS,
    };
  }
  return { ...state, progressPercent: Number(next.toFixed(2)) };
}

function tickArrived(state: IntroState, dt: number): IntroState {
  const remaining = clampNonNegative(state.turnaroundSeconds - dt);
  if (remaining <= 0) {
    return {
      ...state,
      phase: 'inbound',
      etaSeconds: 20,
      legIndex: state.legIndex + 1,
      progressPercent: 0,
      turnaroundSeconds: STATION_TURNAROUND_SECONDS,
    };
  }
  return { ...state, turnaroundSeconds: remaining };
}

export function tickIntroState(state: IntroState, dtSeconds: number): IntroState {
  const dt = Math.max(0, dtSeconds);
  if (dt === 0) return state;
  if (state.phase === 'inbound') return tickInbound(state, dt);
  if (state.phase === 'departing') return tickDeparting(state, dt);
  if (state.phase === 'in_transit') return tickTransit(state, dt);
  if (state.phase === 'arrived') return tickArrived(state, dt);
  return state;
}

export function acceptJobOffer(
  state: IntroState,
  offerId: string,
  job: HireableJob
): { nextState: IntroState; accepted: boolean } {
  if (state.offerId !== offerId || state.offeredJobs === null) {
    return { nextState: state, accepted: false };
  }
  const offered = state.offeredJobs.some((o) => o.job === job);
  if (!offered) return { nextState: state, accepted: false };
  if (state.phase !== 'docked') return { nextState: state, accepted: false };
  return {
    nextState: {
      ...state,
      assignedJob: job,
      offerId: null,
      offeredJobs: null,
      phase: 'departing',
      etaSeconds: 5,
    },
    accepted: true,
  };
}

export function startNextLeg(state: IntroState, destination: string): IntroState {
  return {
    ...state,
    phase: 'docked',
    destination,
    etaSeconds: 0,
    legIndex: state.legIndex + 1,
    progressPercent: 0,
    offerId: null,
    offeredJobs: null,
  };
}
