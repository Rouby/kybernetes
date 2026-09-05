/**
 * Intro gameplay wire contract: station spawn -> ship docking -> captain hire -> transit.
 *
 * v1 scope (thin end-to-end):
 * - One map, simulated fly-in/out observable from the station window.
 * - Captain NPC aboard the docked ship (helm / officer mess).
 * - Proximity E-talk opens a 2-random-job offer; accepting triggers departure.
 * - Solo player + NPC crew fill-ins for unchosen jobs; stay-aboard loop.
 */

export type HireableJob = 'engineer' | 'cook' | 'deckhand';

export type DockingPhase = 'inbound' | 'docked' | 'departing' | 'in_transit' | 'arrived';

export interface JobOffer {
  job: HireableJob;
  title: string;
  department: string;
  description: string;
  badge: string;
  color: string;
}

export const HIREABLE_JOBS: readonly HireableJob[] = ['engineer', 'cook', 'deckhand'] as const;

export const JOB_OFFER_CATALOG: Record<HireableJob, JobOffer> = {
  engineer: {
    job: 'engineer',
    title: 'Engineer',
    department: 'Engineering',
    description: 'Maintain reactor and propulsion stability while in transit.',
    badge: 'ENG-3',
    color: '#ffb000',
  },
  cook: {
    job: 'cook',
    title: 'Cook',
    department: 'Sustenance & Logistics',
    description: 'Prepare meals the crew can eat to restore vitals.',
    badge: 'LOG-3',
    color: '#00e5ff',
  },
  deckhand: {
    job: 'deckhand',
    title: 'Deckhand',
    department: 'Hold Logistics & Salvage',
    description: 'Clean compartments and haul cargo to the cargo grid.',
    badge: 'HLD-3',
    color: '#ffaa33',
  },
};

export interface TalkToCaptainAction {
  type: 'TALK_TO_CAPTAIN';
  captainId: string;
}

export interface AcceptJobOfferAction {
  type: 'ACCEPT_JOB_OFFER';
  offerId: string;
  job: HireableJob;
}

export interface ShipDockingUpdateBroadcast {
  type: 'SHIP_DOCKING_UPDATE';
  phase: DockingPhase;
  shipName: string;
  destination: string;
  etaSeconds: number;
  legIndex: number;
  timestamp: number;
}

export interface CaptainJobOfferBroadcast {
  type: 'CAPTAIN_JOB_OFFER';
  offerId: string;
  captainId: string;
  captainName: string;
  jobs: [JobOffer, JobOffer];
  timestamp: number;
}

export interface JobAssignedBroadcast {
  type: 'JOB_ASSIGNED';
  playerId: string;
  job: HireableJob;
  title: string;
  timestamp: number;
}

export interface TransitUpdateBroadcast {
  type: 'TRANSIT_UPDATE';
  destination: string;
  progressPercent: number;
  legIndex: number;
  timestamp: number;
}
