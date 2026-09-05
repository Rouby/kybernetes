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

  it('inherits vessel momentum when fired aboard moving ship', () => {
    // Fired straight in Y (target dx=0, dy=100) with ship moving in X at 150 px/s
    const bullet = createProjectile(100, 100, 100, 200, 'kinetic_carbine', true, 1.0, {
      vx: 150,
      vy: 0,
    });
    expect(bullet.vx).toBe(150); // Muzzle 0 + ship 150
    expect(bullet.vy).toBe(1050); // Muzzle 1050 + ship 0
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

  describe('Moving Ship Frame Collisions (Docking Offset)', () => {
    const shipOffset = { x: 1400, y: 0 };

    it('handles kinetic collisions and hull breaches against shifted ship hull at offset', () => {
      const originalRandom = Math.random;
      try {
        Math.random = () => 0.001; // Force puncture chance
        // Hull top at unshifted y=228, x=200; with offset.x=1400, world hull is at x=1600, y=228
        const bullet = createProjectile(1600, 240, 1600, 220, 'kinetic_carbine', true);
        const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 }, undefined, shipOffset);

        expect(res.nextProjectiles).toHaveLength(0); // Absorbed by hull
        expect(res.hullDamageTaken).toBe(0.4);
        expect(res.newBreaches).toHaveLength(1);
        // Breach coordinate must be normalized to ship-local space (x=200, y=228)
        expect(res.newBreaches?.[0]).toBe('puncture_bridge_200_228');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('registers partition bullet holes in ship-local coordinates on moving ship', () => {
      // Partition wall part_bridge_avionics at local x=320, y=280 -> world x=1720, y=280
      const bullet = createProjectile(1710, 280, 1730, 280, 'kinetic_carbine', true);
      const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 }, undefined, shipOffset);

      expect(res.nextProjectiles).toHaveLength(0);
      expect(res.partitionHits).toBeDefined();
      expect(res.partitionHits).toHaveLength(1);
      expect(res.partitionHits?.[0].wallId).toBe('part_bridge_avionics');
      expect(res.partitionHits?.[0].x).toBe(320); // Ship-local coordinate so decal moves with the ship
      expect(res.partitionHits?.[0].y).toBe(280);
    });

    it('blocks projectiles at shifted closed ship doors when offset is active', () => {
      const doors: DoorState[] = [
        {
          id: 'door_bridge',
          name: 'Bridge Door',
          x1: 200,
          y1: 368,
          x2: 240,
          y2: 368,
          isOpen: false,
          roomA: 'bridge',
          roomB: 'corridor',
        },
      ];
      // World door shifted by 1400: x=1600..1640, y=368
      const bullet = createProjectile(1620, 360, 1620, 380, 'kinetic_carbine', true);
      const res = tickProjectiles([bullet], 0.05, doors, [], { x: 0, y: 0 }, undefined, shipOffset);

      expect(res.nextProjectiles).toHaveLength(0); // Blocked by closed door
    });

    it('allows projectiles through shifted open doors on moving ship', () => {
      const doors: DoorState[] = [
        {
          id: 'door_bridge',
          name: 'Bridge Door',
          x1: 200,
          y1: 368,
          x2: 240,
          y2: 368,
          isOpen: true,
          roomA: 'bridge',
          roomB: 'corridor',
        },
      ];
      const bullet = createProjectile(1620, 360, 1620, 380, 'kinetic_carbine', true);
      const res = tickProjectiles([bullet], 0.01, doors, [], { x: 0, y: 0 }, undefined, shipOffset);

      expect(res.nextProjectiles).toHaveLength(1); // Flew through open doorway
      expect(res.nextProjectiles[0].y).toBeGreaterThan(360);
    });

    it('damages intruders and respects blast doors during welder AOE on moving ship', () => {
      const doors: DoorState[] = [
        {
          id: 'door_cargo',
          x1: 200,
          y1: 80,
          x2: 200,
          y2: 120,
          isOpen: false,
          roomA: 'cargo',
          roomB: 'corridor',
        },
      ];
      const intruders: IntruderState[] = [
        {
          id: 'raider-aboard-shifted',
          name: 'Marauder Breacher',
          x: 1615,
          y: 100,
          health: 50,
          maxHealth: 100,
          state: 'advancing',
          facingAngle: Math.PI,
        },
      ];

      // Blocked by closed shifted door (door at world x=1600, welder at 1580 aiming east)
      const blocked = applyWelderAoeDamage(intruders, 1580, 100, 0, 25, 48, doors, shipOffset);
      expect(blocked.hitIntruders).toHaveLength(0);

      // Open shifted door allows damage through
      const openDoors: DoorState[] = [{ ...doors[0], isOpen: true }];
      const hit = applyWelderAoeDamage(intruders, 1580, 100, 0, 25, 48, openDoors, shipOffset);
      expect(hit.hitIntruders).toHaveLength(1);
      expect(hit.nextIntruders[0].health).toBe(25);
    });

    it('collides against fixed station walls while ship is offset', () => {
      // Station wall st_hull_top_west at stationary y=650, x=120..500
      const bullet = createProjectile(300, 660, 300, 640, 'kinetic_carbine', true);
      const res = tickProjectiles([bullet], 0.05, [], [], { x: 0, y: 0 }, undefined, shipOffset);

      expect(res.nextProjectiles).toHaveLength(0); // Absorbed by station hull
    });
  });
});
