import { describe, expect, it } from 'vitest';
import { type HarborSocket, noticesLine, offerLine, statusLine, vitalsLine } from './sessionHud';

function socket(over: Record<string, unknown> = {}): HarborSocket {
  return {
    connected: true,
    pawnId: 'pawn:u1',
    snapshot: null,
    telemetry: null,
    vitals: null,
    offer: null,
    notices: [],
    ...over,
  } as unknown as HarborSocket;
}

describe('statusLine', () => {
  it('reports offline while disconnected', () => {
    expect(statusLine(socket({ connected: false }))).toBe('offline');
  });

  it('reports tick room and vents while connected', () => {
    const line = statusLine(
      socket({
        snapshot: {
          tick: 42,
          pawns: [{ id: 'pawn:u1', roomHint: 'ship.bruecke', facing: 0, x: 100.4 }],
        },
        telemetry: {
          atmos: [
            { roomId: 'a', pressureKpa: 101 },
            { roomId: 'b', pressureKpa: 10 },
          ],
        },
      })
    );
    expect(line).toBe('tick:42 room:bruecke sx:100 face:0 vent:1');
  });

  it('marks a missing pawn unknown', () => {
    expect(statusLine(socket({ snapshot: { tick: 1, pawns: [] } }))).toContain('room:-');
  });
});

describe('vitalsLine', () => {
  it('reports vitals:- without vitals', () => {
    expect(vitalsLine(socket())).toBe('vitals:-');
  });

  it('formats the full vitals strip', () => {
    const line = vitalsLine(
      socket({
        vitals: {
          credits: 200,
          vitals: {
            health: 99.6,
            hypoxia: 0,
            suitSealed: true,
            hunger: 80,
            ammo: 29,
            reserve: 120,
            mags: [29, 30, 30, 30],
            reloading: false,
          },
        },
      })
    );
    expect(line).toBe(
      'hp:100 hyp:0 suit:sealed hunger:80 mag:29/120 spares:[29,30,30,30] credits:200'
    );
  });
});

describe('offerLine', () => {
  it('marks a missing offer', () => {
    expect(offerLine(null)).toBe('offer:-');
  });

  it('joins offer jobs', () => {
    expect(offerLine({ jobs: ['engineer', 'deckhand'] } as never)).toBe('offer:engineer/deckhand');
  });
});

describe('noticesLine', () => {
  it('marks an empty feed', () => {
    expect(noticesLine([])).toBe('notices:-');
  });

  it('joins titled messages', () => {
    expect(noticesLine([{ title: 't', message: 'm' }] as never)).toBe('t:m');
  });
});
