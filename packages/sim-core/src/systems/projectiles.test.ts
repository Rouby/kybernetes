import type { DoorState, IntruderState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { applyWelderAoeDamage, createProjectile } from './projectiles';

describe('Weapon Systems: Kinetic, Charged Laser & Welder AOE', () => {
  it('creates full-auto kinetic bullets with high supersonic velocity (1050 px/s)', () => {
    const bullet = createProjectile(100, 100, 200, 100, 'kinetic_carbine', true);
    expect(bullet.weaponType).toBe('kinetic_carbine');
    expect(bullet.vx).toBe(1050);
    expect(bullet.damage).toBe(25);
    expect(bullet.color).toBe('#ffd166');
  });

  it('scales laser damage, speed, and chargeRatio from tap to full charge', () => {
    // Tap fire (0.2 charge)
    const tapLaser = createProjectile(100, 100, 200, 100, 'pulse_laser', true, 0.2);
    expect(tapLaser.damage).toBe(34);
    expect(tapLaser.chargeRatio).toBe(0.2);

    // Mid charge (0.5 charge)
    const midLaser = createProjectile(100, 100, 200, 100, 'pulse_laser', true, 0.5);
    expect(midLaser.damage).toBe(55);

    // Full charge (1.0 charge)
    const fullLaser = createProjectile(100, 100, 200, 100, 'pulse_laser', true, 1.0);
    expect(fullLaser.damage).toBe(90);
    expect(fullLaser.vx).toBe(600);
  });

  it('applies reduced-range welder AOE cone damage (~48px) to intruders in front', () => {
    const intruders: IntruderState[] = [
      {
        id: 'raider-in-front-close',
        name: 'Marauder Breacher',
        x: 135, // 35px in front (within 48px range)
        y: 100,
        health: 50,
        maxHealth: 100,
        roomId: 'cargo',
        targetRoomId: 'engineering',
        state: 'advancing',
        facingAngle: Math.PI,
      },
      {
        id: 'raider-too-far',
        name: 'Marauder Sniper',
        x: 190, // 90px away (> 48px range)
        y: 100,
        health: 50,
        maxHealth: 100,
        roomId: 'cargo',
        targetRoomId: 'bridge',
        state: 'advancing',
        facingAngle: 0,
      },
    ];

    // Pawn at (100, 100), facing 0 rad (right), dealing 25 welder AOE damage
    const res = applyWelderAoeDamage(intruders, 100, 100, 0, 25, 48);

    expect(res.hitIntruders).toHaveLength(1);
    expect(res.hitIntruders[0].id).toBe('raider-in-front-close');
    expect(res.hitIntruders[0].damage).toBe(25);

    const hit = res.nextIntruders.find((i) => i.id === 'raider-in-front-close');
    const far = res.nextIntruders.find((i) => i.id === 'raider-too-far');

    expect(hit?.health).toBe(25);
    expect(far?.health).toBe(50);
  });

  it('blocks welder damage when a closed blast door is in the line of fire', () => {
    const intruders: IntruderState[] = [
      {
        id: 'raider-behind-door',
        name: 'Marauder Breacher',
        x: 135,
        y: 100,
        health: 50,
        maxHealth: 100,
        roomId: 'cargo',
        targetRoomId: 'engineering',
        state: 'advancing',
        facingAngle: Math.PI,
      },
    ];

    const closedDoors: DoorState[] = [
      {
        id: 'door-blocking',
        x1: 120,
        y1: 80,
        x2: 120,
        y2: 120,
        isOpen: false,
        roomA: 'cargo',
        roomB: 'engineering',
      },
    ];

    // With closed door blocking: no damage
    const blockedRes = applyWelderAoeDamage(intruders, 100, 100, 0, 25, 48, closedDoors);
    expect(blockedRes.hitIntruders).toHaveLength(0);
    expect(blockedRes.nextIntruders[0].health).toBe(50);

    // With open door: damage goes through
    const openDoors: DoorState[] = [{ ...closedDoors[0], isOpen: true }];
    const openRes = applyWelderAoeDamage(intruders, 100, 100, 0, 25, 48, openDoors);
    expect(openRes.hitIntruders).toHaveLength(1);
    expect(openRes.nextIntruders[0].health).toBe(25);
  });
});
