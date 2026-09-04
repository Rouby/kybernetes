import type { DoorState, IntruderState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { applyWelderAoeDamage, createProjectile, tickProjectiles } from './projectiles';

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

  it('creates hypervelocity railgun sabot slugs with 1400 px/s speed and 80 damage', () => {
    const slug = createProjectile(100, 100, 200, 100, 'railgun_pistol', true);
    expect(slug.weaponType).toBe('railgun_pistol');
    expect(slug.vx).toBe(1400);
    expect(slug.damage).toBe(80);
    expect(slug.color).toBe('#ffeaa7');
    expect(slug.lifeSeconds).toBe(0.75);
  });

  it('damages outer hull and rolls for micro-breach when kinetic round impacts outer wall', () => {
    // Projectile travelling up towards Bridge top outer hull (y=228)
    const bullet = createProjectile(200, 240, 200, 220, 'kinetic_carbine', true);
    const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 });

    expect(res.nextProjectiles).toHaveLength(0); // Absorbed by wall
    expect(res.hullDamageTaken).toBe(0.4);
    if (res.newBreaches && res.newBreaches.length > 0) {
      expect(res.newBreaches[0]).toMatch(/^puncture_bridge_\d+_\d+$/);
    }
  });

  it('generates exact coordinate puncture breach string when bullet punctures outer hull', () => {
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.001; // Force puncture chance (< 0.05)
      // Bullet at x=200 travelling from y=240 up to y=220, hitting top hull at y=228
      const bullet = createProjectile(200, 240, 200, 220, 'kinetic_carbine', true);
      const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 });

      expect(res.newBreaches).toHaveLength(1);
      expect(res.newBreaches?.[0]).toBe('puncture_bridge_200_228');
    } finally {
      Math.random = originalRandom;
    }
  });

  it('deals 1.5% integrity damage when railgun slug strikes outer hull', () => {
    const slug = createProjectile(200, 240, 200, 220, 'railgun_pistol', true);
    const res = tickProjectiles([slug], 0.05, [], [], { x: 0, y: 0 });

    expect(res.nextProjectiles).toHaveLength(0);
    expect(res.hullDamageTaken).toBe(1.5);
  });

  it('creates partition bullet holes when firing kinetic weapon at interior wall', () => {
    // Projectile travelling from Bridge across partition wall to Avionics (x=320, y=280)
    const bullet = createProjectile(310, 280, 330, 280, 'kinetic_carbine', true);
    const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 });

    expect(res.nextProjectiles).toHaveLength(0); // Absorbed by wall
    expect(res.hullDamageTaken).toBe(0); // No outer hull damage
    expect(res.newBreaches).toHaveLength(0); // No hull puncture
    expect(res.partitionHits).toBeDefined();
    expect(res.partitionHits).toHaveLength(1);
    expect(res.partitionHits?.[0].wallId).toBe('part_bridge_avionics');
    expect(res.partitionHits?.[0].x).toBe(320);
    expect(res.partitionHits?.[0].y).toBe(280);
  });

  it('does not cause kinetic wall damage or bullet holes when pulse laser hits wall', () => {
    const laser = createProjectile(310, 280, 330, 280, 'pulse_laser', true, 1.0);
    const res = tickProjectiles([laser], 0.05, [], [], { x: 0, y: 0 });

    expect(res.nextProjectiles).toHaveLength(0); // Absorbed by wall
    expect(res.hullDamageTaken).toBe(0);
    expect(res.partitionHits).toHaveLength(0);
    expect(res.newBreaches).toHaveLength(0);
  });
});
