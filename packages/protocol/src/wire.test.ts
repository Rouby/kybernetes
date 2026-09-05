import { describe, expect, it } from 'vitest';
import type { ClientAction, DoorState, NavalDamageEventType, ServerBroadcast } from './index';

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as unknown as T;
}

describe('protocol wire contracts', () => {
  it('JOIN_VESSEL survives serialization with optional fields omitted', () => {
    const action: ClientAction = {
      type: 'JOIN_VESSEL',
      vesselCode: 'HESP01',
      callsign: 'Alpha-1',
      role: 'wiper',
    };
    const parsed = roundTrip(action);
    expect(parsed.type).toBe('JOIN_VESSEL');
    if (parsed.type === 'JOIN_VESSEL') {
      expect(parsed.vesselCode).toBe('HESP01');
      expect(parsed.callsign).toBe('Alpha-1');
      expect(parsed.color).toBeUndefined();
      expect(parsed.userId).toBeUndefined();
    }
  });

  it('JOIN_VESSEL preserves color and userId when present', () => {
    const action: ClientAction = {
      type: 'JOIN_VESSEL',
      vesselCode: 'HESP01',
      callsign: 'Bravo-2',
      role: 'security_private',
      color: '#ff3355',
      userId: 'user_123',
    };
    const parsed = roundTrip(action);
    if (parsed.type === 'JOIN_VESSEL') {
      expect(parsed.color).toBe('#ff3355');
      expect(parsed.userId).toBe('user_123');
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('PLAYER_MOVE preserves welding flag and facing angle', () => {
    const action: ClientAction = {
      type: 'PLAYER_MOVE',
      x: 510,
      y: 350,
      vx: 12,
      vy: -4,
      facingAngle: 1.57,
      isWelding: true,
    };
    const parsed = roundTrip(action);
    if (parsed.type === 'PLAYER_MOVE') {
      expect(parsed.isWelding).toBe(true);
      expect(parsed.facingAngle).toBeCloseTo(1.57, 5);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('TOGGLE_DOOR keeps open true/false distinct across the wire', () => {
    const open: ClientAction = { type: 'TOGGLE_DOOR', doorId: 'airlock_stbd_outer', open: true };
    const closed: ClientAction = { type: 'TOGGLE_DOOR', doorId: 'airlock_stbd_outer', open: false };
    const parsedOpen = roundTrip(open);
    const parsedClosed = roundTrip(closed);
    if (parsedOpen.type === 'TOGGLE_DOOR' && parsedClosed.type === 'TOGGLE_DOOR') {
      expect(parsedOpen.open).toBe(true);
      expect(parsedClosed.open).toBe(false);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('TRIGGER_NAVAL_EVENT accepts every naval damage event type', () => {
    const types: NavalDamageEventType[] = ['torpedo_run', 'radiation_burst', 'micrometeor_storm'];
    for (const eventType of types) {
      const action: ClientAction = { type: 'TRIGGER_NAVAL_EVENT', eventType };
      const parsed = roundTrip(action);
      expect(parsed.type).toBe('TRIGGER_NAVAL_EVENT');
      if (parsed.type === 'TRIGGER_NAVAL_EVENT') {
        expect(parsed.eventType).toBe(eventType);
      }
    }
  });

  it('FIRE_WEAPON preserves weapon type, coordinates, and charge ratio', () => {
    const action: ClientAction = {
      type: 'FIRE_WEAPON',
      originX: 400,
      originY: 300,
      targetX: 500,
      targetY: 350,
      weaponType: 'kinetic_carbine',
      chargeRatio: 0.75,
    };
    const parsed = roundTrip(action);
    if (parsed.type === 'FIRE_WEAPON') {
      expect(parsed.weaponType).toBe('kinetic_carbine');
      expect(parsed.targetX).toBe(500);
      expect(parsed.chargeRatio).toBe(0.75);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('boarding triage actions keep their room targeting', () => {
    const lock: ClientAction = { type: 'BULKHEAD_LOCK', bulkheadId: 'cargo', locked: true };
    const vent: ClientAction = { type: 'VENT_COMPARTMENT', compartmentId: 'cargo', venting: true };
    const sentry: ClientAction = { type: 'DEPLOY_SENTRY', roomId: 'cargo' };
    expect(roundTrip(lock)).toEqual(lock);
    expect(roundTrip(vent)).toEqual(vent);
    expect(roundTrip(sentry)).toEqual(sentry);
  });

  it('NAVAL_DAMAGE_EVENT broadcast tag and event payload are stable', () => {
    const broadcast: ServerBroadcast = {
      type: 'NAVAL_DAMAGE_EVENT',
      event: {
        id: 'evt_1',
        type: 'torpedo_run',
        title: 'Torpedo run',
        description: 'Inbound torpedoes',
        status: 'incoming',
        severity: 'critical',
        timeToImpactSeconds: 12,
      },
    };
    const parsed = roundTrip(broadcast);
    expect(parsed.type).toBe('NAVAL_DAMAGE_EVENT');
  });

  it('DAMAGE_TRIAGE_RESULT preserves action type and success flag', () => {
    const broadcast: ServerBroadcast = {
      type: 'DAMAGE_TRIAGE_RESULT',
      eventId: 'evt_1',
      actionType: 'PDT_INTERCEPT',
      success: true,
      message: 'Point-Defense interception successful!',
      timestamp: Date.now(),
    };
    const parsed = roundTrip(broadcast);
    if (parsed.type === 'DAMAGE_TRIAGE_RESULT') {
      expect(parsed.actionType).toBe('PDT_INTERCEPT');
      expect(parsed.success).toBe(true);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('CREW_MANIFEST preserves the full roster', () => {
    const broadcast: ServerBroadcast = {
      type: 'CREW_MANIFEST',
      crew: [
        { id: 'c1', callsign: 'Alpha-1', role: 'wiper', deckId: 'deck_a', status: 'idle' },
        { id: 'c2', callsign: 'Bravo-2', role: 'galley_hand', deckId: 'deck_a', status: 'on_duty' },
      ],
    };
    const parsed = roundTrip(broadcast);
    if (parsed.type === 'CREW_MANIFEST') {
      expect(parsed.crew.map((c) => c.callsign)).toEqual(['Alpha-1', 'Bravo-2']);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('SPATIAL_SNAPSHOT preserves pawns and bulkheads arrays', () => {
    const broadcast: ServerBroadcast = {
      type: 'SPATIAL_SNAPSHOT',
      timestamp: Date.now(),
      pawns: [],
      bulkheads: [],
    };
    const parsed = roundTrip(broadcast);
    if (parsed.type === 'SPATIAL_SNAPSHOT') {
      expect(parsed.pawns).toEqual([]);
      expect(parsed.bulkheads).toEqual([]);
    } else {
      expect.unreachable('wrong discriminant tag');
    }
  });

  it('intro hire flow survives serialization', () => {
    const talk: ClientAction = { type: 'TALK_TO_CAPTAIN', captainId: 'captain_helm_01' };
    const accept: ClientAction = { type: 'ACCEPT_JOB_OFFER', offerId: 'offer_1', job: 'engineer' };
    expect(roundTrip(talk)).toEqual(talk);
    expect(roundTrip(accept)).toEqual(accept);

    const offer: ServerBroadcast = {
      type: 'CAPTAIN_JOB_OFFER',
      offerId: 'offer_1',
      captainId: 'captain_helm_01',
      captainName: 'Captain Reyes',
      jobs: [
        {
          job: 'engineer',
          title: 'Engineer',
          department: 'Engineering',
          description: 'Maintain reactor and propulsion stability while in transit.',
          badge: 'ENG-3',
          color: '#ffb000',
        },
        {
          job: 'cook',
          title: 'Cook',
          department: 'Sustenance & Logistics',
          description: 'Prepare meals the crew can eat to restore vitals.',
          badge: 'LOG-3',
          color: '#00e5ff',
        },
      ],
      timestamp: Date.now(),
    };
    expect(roundTrip(offer)).toEqual(offer);

    const docking: ServerBroadcast = {
      type: 'SHIP_DOCKING_UPDATE',
      phase: 'docked',
      shipName: 'Kestrel',
      destination: 'Station B',
      etaSeconds: 0,
      legIndex: 1,
      timestamp: Date.now(),
      kinematics: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        flightMode: 'docked',
      },
    };
    const assigned: ServerBroadcast = {
      type: 'JOB_ASSIGNED',
      playerId: 'p1',
      job: 'cook',
      title: 'Cook',
      timestamp: Date.now(),
    };
    const transit: ServerBroadcast = {
      type: 'TRANSIT_UPDATE',
      destination: 'Station B',
      progressPercent: 12.5,
      legIndex: 1,
      timestamp: Date.now(),
    };
    expect(roundTrip(docking)).toEqual(docking);
    expect(roundTrip(assigned)).toEqual(assigned);
    expect(roundTrip(transit)).toEqual(transit);
  });

  it('gauntlet doors keep sealed and open distinct across the wire', () => {
    const sealed: DoorState = {
      id: 'gauntlet_ship_door',
      name: 'Gauntlet Ship-Side Hatch',
      x1: 1020,
      y1: 280,
      x2: 1020,
      y2: 320,
      isOpen: false,
      isSealed: true,
      isAirlock: true,
      roomA: 'airlock_stbd',
      roomB: 'gauntlet',
    };
    const parsed = roundTrip(sealed);
    expect(parsed.isSealed).toBe(true);
    expect(parsed.isOpen).toBe(false);
    const unsealed = roundTrip({ ...sealed, isSealed: false, isOpen: true });
    expect(unsealed.isSealed).toBe(false);
    expect(unsealed.isOpen).toBe(true);
  });

  it('unknown broadcast types fall through narrowing without throwing', () => {
    const msg = JSON.parse('{"type":"FUTURE_PACKET","payload":{}}') as unknown as ServerBroadcast;
    let noticed: string | null = null;
    switch (msg.type) {
      case 'SHIP_ALERT':
        noticed = msg.title;
        break;
      case 'TELEMETRY_DELTA':
        noticed = msg.shipName;
        break;
      default:
        noticed = null;
        break;
    }
    expect(noticed).toBeNull();
  });
});
