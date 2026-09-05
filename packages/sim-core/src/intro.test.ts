import { describe, expect, it } from 'vitest';
import {
  acceptJobOffer,
  createInitialIntroState,
  getNpcCrewForHire,
  openCaptainOffer,
  pickJobOfferPair,
  startNextLeg,
  tickIntroState,
} from './intro';

describe('intro docking and hire loop', () => {
  it('creates an inbound initial state', () => {
    const s = createInitialIntroState();
    expect(s.phase).toBe('inbound');
    expect(s.etaSeconds).toBe(20);
    expect(s.assignedJob).toBeNull();
  });

  it('ignores zero and negative dt', () => {
    const s = createInitialIntroState();
    expect(tickIntroState(s, 0)).toBe(s);
    expect(tickIntroState(s, -5)).toBe(s);
  });

  it('docks when inbound eta expires', () => {
    let s = createInitialIntroState();
    s = tickIntroState(s, 19.9);
    expect(s.phase).toBe('inbound');
    s = tickIntroState(s, 0.2);
    expect(s.phase).toBe('docked');
    expect(s.etaSeconds).toBe(0);
  });

  it('picks a deterministic distinct job pair', () => {
    const a = pickJobOfferPair(0);
    const b = pickJobOfferPair(0);
    expect(a).toEqual(b);
    expect(a[0].job).not.toBe(a[1].job);
    expect(pickJobOfferPair(1)[0].job).not.toBe(pickJobOfferPair(0)[0].job);
  });

  it('accepts only an offered job while docked', () => {
    const s = { ...createInitialIntroState(), phase: 'docked' as const, etaSeconds: 0 };
    const { nextState: offered, offer } = openCaptainOffer(s, 'offer_1', 0);
    const validJob = offer.jobs[0].job;
    const ok = acceptJobOffer(offered, 'offer_1', validJob);
    expect(ok.accepted).toBe(true);
    expect(ok.nextState.phase).toBe('departing');
    expect(ok.nextState.assignedJob).toBe(validJob);

    const badOffer = acceptJobOffer(offered, 'wrong', validJob);
    expect(badOffer.accepted).toBe(false);
    const badJob = acceptJobOffer(offered, 'offer_1', 'deckhand');
    const offeredJobs = offer.jobs.map((j) => j.job);
    expect(badJob.accepted).toBe(offeredJobs.includes('deckhand'));
  });

  it('rejects hire when not docked', () => {
    const s = createInitialIntroState();
    const { nextState: offered } = openCaptainOffer(s, 'offer_1', 1);
    const res = acceptJobOffer(offered, 'offer_1', offered.offeredJobs?.[0].job ?? 'cook');
    expect(res.accepted).toBe(false);
  });

  it('flies departing -> transit -> arrived with clamped progress', () => {
    let s = { ...createInitialIntroState(), phase: 'docked' as const, etaSeconds: 0 };
    const { nextState: offered } = openCaptainOffer(s, 'offer_1', 2);
    const job = offered.offeredJobs?.[0].job ?? 'engineer';
    s = acceptJobOffer(offered, 'offer_1', job).nextState;
    expect(s.phase).toBe('departing');
    s = tickIntroState(s, 5);
    expect(s.phase).toBe('in_transit');
    s = tickIntroState(s, 100000);
    expect(s.phase).toBe('arrived');
    expect(s.progressPercent).toBe(100);
  });

  it('fills NPC crew with the two unchosen jobs', () => {
    expect(getNpcCrewForHire('engineer')).toEqual(['cook', 'deckhand']);
    expect(getNpcCrewForHire('cook')).toHaveLength(2);
  });

  it('starts the next leg back at docked', () => {
    let s = { ...createInitialIntroState(), phase: 'arrived' as const, progressPercent: 100 };
    s = startNextLeg(s, 'Station C');
    expect(s.phase).toBe('docked');
    expect(s.destination).toBe('Station C');
    expect(s.legIndex).toBe(1);
    expect(s.progressPercent).toBe(0);
  });
});
