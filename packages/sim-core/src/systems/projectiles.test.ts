import type { IntruderState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { applyWelderAoeDamage, createProjectile } from './projectiles';

describe('Weapon Systems: Kinetic, Charged Laser & Welder AOE', () => {
  it('creates full-auto kinetic bullets with flat high velocity', () => {
    const bullet = createProjectile(100, 100, 200, 100, 'kinetic_carbine', true);
    expect(bullet.weaponType).toBe('kinetic_carbine');
    expect(bullet.vx).toBe(620);
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

  it('applies welder AOE cone damage to intruders directly in front of the pawn', () => {
    const intruders: IntruderState[] = [
      {
        id: 'raider-in-front',
        name: 'Marauder Breacher',
        x: 180, // 80px in front (facing angle 0 rad -> towards positive X)
        y: 100,
        health: 50,
        maxHealth: 100,
        roomId: 'cargo',
        targetRoomId: 'engineering',
        state: 'advancing',
        facingAngle: Math.PI,
      },
      {
        id: 'raider-behind',
        name: 'Marauder Flanker',
        x: 20, // 80px behind the pawn
        y: 100,
        health: 50,
        maxHealth: 100,
        roomId: 'cargo',
        targetRoomId: 'bridge',
        state: 'advancing',
        facingAngle: 0,
      },
      {
        id: 'raider-too-far',
        name: 'Marauder Sniper',
        x: 350, // 250px away (> 135px range)
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
    const res = applyWelderAoeDamage(intruders, 100, 100, 0, 25, 135);

    expect(res.hitIntruders).toHaveLength(1);
    expect(res.hitIntruders[0].id).toBe('raider-in-front');
    expect(res.hitIntruders[0].damage).toBe(25);

    const hit = res.nextIntruders.find((i) => i.id === 'raider-in-front');
    const behind = res.nextIntruders.find((i) => i.id === 'raider-behind');
    const far = res.nextIntruders.find((i) => i.id === 'raider-too-far');

    expect(hit?.health).toBe(25);
    expect(behind?.health).toBe(50);
    expect(far?.health).toBe(50);
  });

  it('neutralizes an intruder when continuous welder AOE depletes all health', () => {
    const intruders: IntruderState[] = [
      {
        id: 'weak-raider',
        name: 'Marauder Infiltrator',
        x: 160,
        y: 100,
        health: 15,
        maxHealth: 80,
        roomId: 'cargo',
        targetRoomId: 'bridge',
        state: 'advancing',
        facingAngle: Math.PI,
      },
    ];

    const res = applyWelderAoeDamage(intruders, 100, 100, 0, 20, 135);
    expect(res.nextIntruders[0].health).toBe(0);
    expect(res.nextIntruders[0].state).toBe('neutralized');
  });
});
