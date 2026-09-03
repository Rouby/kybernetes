import type { PawnState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  calculateCollabLaborRate,
  createCollabShift,
  createDualProtocol,
  createPersistedCrewMember,
  executeDualProtocol,
  generateBeaconCode,
  interpolatePawn,
  isValidBeaconCode,
  joinCollabShift,
  leaveCollabShift,
  lerpAngle,
  primeDualProtocol,
  restorePawnFromPersistence,
  tickCollabShift,
  tickDualProtocol,
} from './multiplayer';

describe('Multiplayer Core Math & Protocols', () => {
  describe('Pawn Interpolation & Welding Propagation', () => {
    it('interpolates positions smoothly and preserves isWelding and custom color', () => {
      const p1: PawnState = {
        id: 'p1',
        callsign: 'Alpha',
        role: 'wiper',
        x: 100,
        y: 200,
        vx: 10,
        vy: 0,
        facingAngle: 0,
        currentDeck: 'deck_a',
        isOperating: false,
        isResting: false,
        color: '#ff3355',
        isWelding: false,
      };
      const p2: PawnState = {
        ...p1,
        x: 200,
        y: 400,
        facingAngle: Math.PI,
        isWelding: true,
      };

      const mid = interpolatePawn(p1, p2, 0.5);
      expect(mid.x).toBe(150);
      expect(mid.y).toBe(300);
      expect(mid.facingAngle).toBeCloseTo(Math.PI / 2, 2);
      expect(mid.color).toBe('#ff3355');
      expect(mid.isWelding).toBe(true);
    });

    it('interpolates angles across the -PI / +PI wrap boundary', () => {
      const angle = lerpAngle(-3.0, 3.0, 0.5);
      // Distance is ~0.28 radians wrapped, so midpoint is around 3.14 / -3.14
      expect(Math.abs(angle)).toBeGreaterThan(3.0);
    });
  });

  describe('Crew State Persistence', () => {
    it('captures and restores crew coordinates, customization, and deck assignment', () => {
      const livePawn: PawnState = {
        id: 'crew_live_1',
        callsign: 'Valkyrie',
        role: 'security_private',
        x: 820,
        y: 450,
        vx: 1.5,
        vy: -0.5,
        facingAngle: 1.57,
        currentDeck: 'deck_a',
        isOperating: false,
        isResting: false,
        color: '#00e5ff',
        isWelding: true,
      };

      const persisted = createPersistedCrewMember('user_abc123', livePawn);
      expect(persisted.userId).toBe('user_abc123');
      expect(persisted.callsign).toBe('Valkyrie');
      expect(persisted.role).toBe('security_private');
      expect(persisted.color).toBe('#00e5ff');
      expect(persisted.x).toBe(820);
      expect(persisted.y).toBe(450);

      // Restore on reconnect
      const restored = restorePawnFromPersistence('new_socket_id', persisted);
      expect(restored.id).toBe('new_socket_id');
      expect(restored.callsign).toBe('Valkyrie');
      expect(restored.role).toBe('security_private');
      expect(restored.color).toBe('#00e5ff');
      expect(restored.x).toBe(820);
      expect(restored.y).toBe(450);
      expect(restored.facingAngle).toBe(1.57);
      expect(restored.vx).toBe(0); // velocity reset on connect
      expect(restored.isWelding).toBe(false); // active trigger starts false
    });
  });

  describe('Dual-Operator Protocol', () => {
    it('initializes in idle state with 10s sync window', () => {
      const proto = createDualProtocol('ftl_jump_alignment');
      expect(proto.stage).toBe('idle');
      expect(proto.syncWindowSeconds).toBe(10);
    });

    it('primes protocol and begins 10-second countdown', () => {
      let proto = createDualProtocol('ftl_jump_alignment');
      proto = primeDualProtocol(proto, 'Alpha');
      expect(proto.stage).toBe('primed');
      expect(proto.initiatorCallsign).toBe('Alpha');
      expect(proto.remainingSeconds).toBe(10);

      const res = tickDualProtocol(proto, 4.0);
      proto = res.nextState;
      expect(proto.remainingSeconds).toBe(6.0);
      expect(res.expired).toBe(false);
    });

    it('expires if secondary operator does not execute within window', () => {
      let proto = createDualProtocol('ftl_jump_alignment');
      proto = primeDualProtocol(proto, 'Alpha');
      const res = tickDualProtocol(proto, 10.5);
      expect(res.expired).toBe(true);
      expect(res.nextState.stage).toBe('expired');
    });

    it('successfully synchronizes when target station is executed', () => {
      let proto = createDualProtocol('ftl_jump_alignment');
      proto = primeDualProtocol(proto, 'Alpha');

      // Wrong station fails
      const wrongRes = executeDualProtocol(proto, 'engineering');
      expect(wrongRes.success).toBe(false);

      // Correct station (bridge) succeeds
      const goodRes = executeDualProtocol(proto, 'bridge');
      expect(goodRes.success).toBe(true);
      expect(goodRes.nextState.stage).toBe('synchronized');
    });
  });

  describe('Collaborative Heavy Shifts', () => {
    it('calculates collaborative labor rates with team bonus', () => {
      expect(calculateCollabLaborRate(0)).toBe(0);
      expect(calculateCollabLaborRate(1)).toBe(1.0);
      // 2 workers -> 2 * 1.25 = 2.5x speed
      expect(calculateCollabLaborRate(2)).toBe(2.5);
      // 3 workers -> 3 * 1.25 = 3.75x speed
      expect(calculateCollabLaborRate(3)).toBe(3.75);
    });

    it('handles crew joining, progressing, and completing shift', () => {
      let shift = createCollabShift('thruster_overhaul', 'cargo', 'Main Thruster Overhaul', 10);
      expect(shift.progressPercent).toBe(0);

      // No progress when 0 participants
      let tickRes = tickCollabShift(shift, 2);
      expect(tickRes.nextState.progressPercent).toBe(0);

      // 1 crew joins
      shift = joinCollabShift(shift, 'crew_1');
      expect(shift.participants).toEqual(['crew_1']);

      // 2 seconds at 1x speed on 10s duration -> 20%
      tickRes = tickCollabShift(shift, 2);
      shift = tickRes.nextState;
      expect(shift.progressPercent).toBe(20);

      // Second crew joins -> 2 workers = 2.5x speed
      shift = joinCollabShift(shift, 'crew_2');
      // 2 seconds at 2.5x speed = 5s equivalent work on 10s duration -> +50%
      tickRes = tickCollabShift(shift, 2);
      shift = tickRes.nextState;
      expect(shift.progressPercent).toBe(70);

      // 2 more seconds -> completes
      tickRes = tickCollabShift(shift, 2);
      shift = tickRes.nextState;
      expect(shift.progressPercent).toBe(100);
      expect(shift.isCompleted).toBe(true);
      expect(tickRes.justCompleted).toBe(true);

      // Leaving shift removes participant
      shift = leaveCollabShift(shift, 'crew_1');
      expect(shift.participants).toEqual(['crew_2']);
    });
  });

  describe('Beacon Codes', () => {
    it('generates valid 6-char beacon codes', () => {
      const code = generateBeaconCode();
      expect(code.length).toBe(6);
      expect(isValidBeaconCode(code)).toBe(true);
    });

    it('validates code formatting', () => {
      expect(isValidBeaconCode('HESP01')).toBe(true);
      expect(isValidBeaconCode('HESPERIA')).toBe(false);
      expect(isValidBeaconCode('ABC!')).toBe(false);
    });
  });
});
