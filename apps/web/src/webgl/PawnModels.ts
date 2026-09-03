import type { BoardingTacticsTelemetry, PawnState, WeaponType } from '@kybernetes/protocol';
import type { RenderContext } from './StationModels';

function setColor(ctx: RenderContext, r: number, g: number, b: number, a = 1.0): void {
  ctx.gl.uniform4f(ctx.gl.getUniformLocation(ctx.flatProg, 'u_color'), r, g, b, a);
}

const ROLE_ACCENTS: Record<string, [number, number, number]> = {
  wiper: [1.0, 0.6, 0.0],
  galley_hand: [0.0, 0.92, 1.0],
  security_private: [1.0, 0.2, 0.35],
  hydro_tender: [0.18, 0.48, 1.0],
  stevedore: [1.0, 0.84, 0.0],
  commander: [1.0, 0.84, 0.0],
  tactical: [1.0, 0.2, 0.35],
  engineering: [1.0, 0.6, 0.0],
  helm: [0.0, 0.92, 1.0],
  security: [0.18, 0.48, 1.0],
  medical: [0.95, 0.95, 1.0],
};

function renderWeaponInHands(
  ctx: RenderContext,
  wx: number,
  wy: number,
  cos: number,
  sin: number,
  weaponType: WeaponType,
  timeSec: number
): void {
  const normX = -sin;
  const normY = cos;

  if (weaponType === 'kinetic_carbine') {
    // Bullpup kinetic carbine rifle chassis
    setColor(ctx, 0.18, 0.2, 0.25);
    const bodyVerts: number[] = [];
    ctx.addThickSegment(bodyVerts, wx, wy, wx + cos * 16, wy + sin * 16, 3.2);
    // Barrel muzzle
    ctx.addThickSegment(bodyVerts, wx + cos * 16, wy + sin * 16, wx + cos * 20, wy + sin * 20, 1.8);
    // Magazine well
    ctx.addThickSegment(
      bodyVerts,
      wx + cos * 6 - normX * 3,
      wy + sin * 6 - normY * 3,
      wx + cos * 6,
      wy + sin * 6,
      2.0
    );
    ctx.bufferAndDraw(new Float32Array(bodyVerts));
  } else if (weaponType === 'pulse_laser') {
    // High-tech laser rail rifle chassis
    setColor(ctx, 0.14, 0.16, 0.22);
    const railVerts: number[] = [];
    ctx.addThickSegment(railVerts, wx, wy, wx + cos * 20, wy + sin * 20, 3.4);
    ctx.bufferAndDraw(new Float32Array(railVerts));

    // Glowing cyan capacitor coils along rail
    const pulse = 0.75 + 0.25 * Math.sin(timeSec * 8.0);
    setColor(ctx, 0.0, 0.95, 1.0, pulse);
    const coilVerts: number[] = [];
    ctx.addThickSegment(
      coilVerts,
      wx + cos * 8 + normX * 2,
      wy + sin * 8 + normY * 2,
      wx + cos * 16 + normX * 2,
      wy + sin * 16 + normY * 2,
      1.4
    );
    ctx.addThickSegment(
      coilVerts,
      wx + cos * 8 - normX * 2,
      wy + sin * 8 - normY * 2,
      wx + cos * 16 - normX * 2,
      wy + sin * 16 - normY * 2,
      1.4
    );
    ctx.bufferAndDraw(new Float32Array(coilVerts));
  } else if (weaponType === 'arc_welder') {
    // Heavy industrial arc welder casing
    setColor(ctx, 0.88, 0.7, 0.05);
    const welderVerts: number[] = [];
    ctx.addThickSegment(welderVerts, wx, wy, wx + cos * 12, wy + sin * 12, 4.2);
    ctx.bufferAndDraw(new Float32Array(welderVerts));

    // Dual forward electrode prongs
    setColor(ctx, 0.4, 0.7, 1.0);
    const prongVerts: number[] = [];
    ctx.addThickSegment(
      prongVerts,
      wx + cos * 12 + normX * 3,
      wy + sin * 12 + normY * 3,
      wx + cos * 18 + normX * 2,
      wy + sin * 18 + normY * 2,
      1.5
    );
    ctx.addThickSegment(
      prongVerts,
      wx + cos * 12 - normX * 3,
      wy + sin * 12 - normY * 3,
      wx + cos * 18 - normX * 2,
      wy + sin * 18 - normY * 2,
      1.5
    );
    ctx.bufferAndDraw(new Float32Array(prongVerts));
  }

  // Two armored spacesuit hands gripping weapon
  setColor(ctx, 0.35, 0.4, 0.5);
  ctx.drawCircle(wx + cos * 6 + normX * 4, wy + sin * 6 + normY * 4, 3, 8);
  ctx.drawCircle(wx + cos * 12 - normX * 3, wy + sin * 12 - normY * 3, 3, 8);
}

// fallow-ignore-next-line complexity
export function renderTacticalPawn(
  ctx: RenderContext,
  pawn: PawnState,
  equippedWeapon: WeaponType = 'kinetic_carbine',
  timeSec: number,
  recoil = 0
): void {
  const isMoving = Math.hypot(pawn.vx, pawn.vy) > 0.05;
  const walkSway = isMoving ? Math.sin(timeSec * 14.0) * 1.5 : 0.0;

  const cos = Math.cos(pawn.facingAngle);
  const sin = Math.sin(pawn.facingAngle);
  const normX = -sin;
  const normY = cos;

  // Base position offset by weapon recoil kickback
  const px = pawn.x - cos * recoil;
  const py = pawn.y - sin * recoil;

  // 1. Rear EVA Life Support / Oxygen Thruster Backpack
  const packX = px - cos * 9;
  const packY = py - sin * 9;
  setColor(ctx, 0.14, 0.16, 0.22);
  const packVerts: number[] = [];
  ctx.addThickSegment(
    packVerts,
    packX - normX * 7,
    packY - normY * 7,
    packX + normX * 7,
    packY + normY * 7,
    6.0
  );
  ctx.bufferAndDraw(new Float32Array(packVerts));

  // Micro-thruster nozzles with subtle cyan exhaust when moving
  if (isMoving) {
    setColor(ctx, 0.0, 0.95, 1.0, 0.65 + 0.35 * Math.sin(timeSec * 25.0));
    ctx.drawCircle(packX - cos * 3 - normX * 5, packY - sin * 3 - normY * 5, 2, 6);
    ctx.drawCircle(packX - cos * 3 + normX * 5, packY - sin * 3 + normY * 5, 2, 6);
  }

  // 2. Spacesuit Shoulder Pauldrons & Torso
  let suitR = 0.22;
  let suitG = 0.26;
  let suitB = 0.34;
  if (pawn.color?.startsWith('#') && pawn.color.length >= 7) {
    suitR = parseInt(pawn.color.slice(1, 3), 16) / 255;
    suitG = parseInt(pawn.color.slice(3, 5), 16) / 255;
    suitB = parseInt(pawn.color.slice(5, 7), 16) / 255;
  }

  // Torso base
  setColor(ctx, suitR * 0.7, suitG * 0.7, suitB * 0.7);
  ctx.drawCircle(px, py, 11, 16);

  // Left & Right Shoulders with walk sway oscillation
  const leftX = px - cos * 2 + normX * (8 + walkSway);
  const leftY = py - sin * 2 + normY * (8 + walkSway);
  const rightX = px - cos * 2 - normX * (8 - walkSway);
  const rightY = py - sin * 2 - normY * (8 - walkSway);

  setColor(ctx, suitR, suitG, suitB);
  ctx.drawCircle(leftX, leftY, 4.5, 10);
  ctx.drawCircle(rightX, rightY, 4.5, 10);

  // Role chevrons on shoulders
  const role = (pawn.role || 'tactical').toLowerCase();
  const roleColor = ROLE_ACCENTS[role] || [1.0, 0.84, 0.0];
  setColor(ctx, roleColor[0], roleColor[1], roleColor[2]);
  ctx.drawCircle(leftX, leftY, 2.2, 8);
  ctx.drawCircle(rightX, rightY, 2.2, 8);

  // 3. Equipped Weapon in Hands
  const weaponOriginX = px + cos * 6;
  const weaponOriginY = py + sin * 6;
  renderWeaponInHands(ctx, weaponOriginX, weaponOriginY, cos, sin, equippedWeapon, timeSec);

  // 4. Helmet Dome & Convex Visor Arc
  const headX = px + cos * 3;
  const headY = py + sin * 3;

  // Helmet shell
  setColor(ctx, 0.88, 0.9, 0.94);
  ctx.drawCircle(headX, headY, 6.5, 14);

  // Tinted reflective visor glass facing forward
  const visorX = headX + cos * 4;
  const visorY = headY + sin * 4;
  setColor(ctx, 0.0, 0.92, 1.0);
  ctx.drawCircle(visorX, visorY, 3.8, 10);

  // Visor glass specular highlight
  setColor(ctx, 1.0, 1.0, 1.0, 0.85);
  ctx.drawCircle(visorX + cos * 1.5 - normX * 1.2, visorY + sin * 1.5 - normY * 1.2, 1.4, 6);
}

// fallow-ignore-next-line complexity
export function renderRaiderIntruder(
  ctx: RenderContext,
  intruder: NonNullable<BoardingTacticsTelemetry['intruders']>[number],
  timeSec: number
): void {
  const cos = Math.cos(intruder.facingAngle);
  const sin = Math.sin(intruder.facingAngle);
  const normX = -sin;
  const normY = cos;

  // 1. Spiked pirate backpack
  setColor(ctx, 0.12, 0.12, 0.14);
  const packVerts: number[] = [];
  ctx.addThickSegment(
    packVerts,
    intruder.x - cos * 8 - normX * 6,
    intruder.y - sin * 8 - normY * 6,
    intruder.x - cos * 8 + normX * 6,
    intruder.y - sin * 8 + normY * 6,
    5.0
  );
  ctx.bufferAndDraw(new Float32Array(packVerts));

  // 2. Heavy charcoal body armor with blood-red hazard plates
  setColor(ctx, 0.18, 0.18, 0.2);
  ctx.drawCircle(intruder.x, intruder.y, 11, 14);

  // Spiked angular shoulder pauldrons
  setColor(ctx, 0.82, 0.12, 0.16);
  ctx.drawCircle(intruder.x + normX * 8, intruder.y + normY * 8, 4.5, 8);
  ctx.drawCircle(intruder.x - normX * 8, intruder.y - normY * 8, 4.5, 8);

  // Raider plasma carbine in hands
  setColor(ctx, 0.1, 0.1, 0.12);
  const gunVerts: number[] = [];
  ctx.addThickSegment(
    gunVerts,
    intruder.x + cos * 4,
    intruder.y + sin * 4,
    intruder.x + cos * 18,
    intruder.y + sin * 18,
    3.0
  );
  // Plasma emitter tip
  ctx.addThickSegment(
    gunVerts,
    intruder.x + cos * 18,
    intruder.y + sin * 18,
    intruder.x + cos * 22,
    intruder.y + sin * 22,
    1.6
  );
  ctx.bufferAndDraw(new Float32Array(gunVerts));

  // Glowing red plasma chamber
  setColor(ctx, 1.0, 0.15, 0.25, 0.85 + 0.15 * Math.sin(timeSec * 10.0));
  ctx.drawCircle(intruder.x + cos * 14, intruder.y + sin * 14, 2.2, 8);

  // 3. Menacing angular helmet with crimson visor slit
  setColor(ctx, 0.14, 0.14, 0.16);
  ctx.drawCircle(intruder.x + cos * 3, intruder.y + sin * 3, 6.5, 12);

  // Glowing crimson visor slit
  setColor(ctx, 1.0, 0.08, 0.12);
  const slitVerts: number[] = [];
  ctx.addThickSegment(
    slitVerts,
    intruder.x + cos * 6 - normX * 3,
    intruder.y + sin * 6 - normY * 3,
    intruder.x + cos * 6 + normX * 3,
    intruder.y + sin * 6 + normY * 3,
    1.8
  );
  ctx.bufferAndDraw(new Float32Array(slitVerts));

  // 4. Tactical segmented health gauge over intruder
  const hpPct = Math.max(0, intruder.health / (intruder.maxHealth || 100));
  setColor(ctx, 0.08, 0.08, 0.1, 0.85);
  ctx.drawQuad(intruder.x - 14, intruder.y - 20, 28, 4);

  setColor(ctx, 1.0, 0.2, 0.25);
  ctx.drawQuad(intruder.x - 14, intruder.y - 20, 28 * hpPct, 4);
}

export function renderSentryTurret(
  ctx: RenderContext,
  sentry: NonNullable<BoardingTacticsTelemetry['sentries']>[number],
  timeSec: number
): void {
  const cos = Math.cos(sentry.facingAngle);
  const sin = Math.sin(sentry.facingAngle);
  const normX = -sin;
  const normY = cos;

  // 1. Armored octagonal base mounting plate
  setColor(ctx, 0.2, 0.24, 0.32);
  ctx.drawCircle(sentry.x, sentry.y, 11, 8);
  setColor(ctx, 0.32, 0.38, 0.48);
  ctx.drawCircle(sentry.x, sentry.y, 8, 8);

  // 2. Rotating turret housing
  setColor(ctx, 0.15, 0.18, 0.24);
  ctx.drawCircle(sentry.x, sentry.y, 6.5, 12);

  // Flanking ammo drum
  setColor(ctx, 0.1, 0.12, 0.16);
  ctx.drawCircle(sentry.x - cos * 3, sentry.y - sin * 3, 4.0, 10);

  // 3. Twin reciprocating auto-cannon barrels
  setColor(ctx, 0.3, 0.35, 0.45);
  const barrelVerts: number[] = [];
  ctx.addThickSegment(
    barrelVerts,
    sentry.x + normX * 3,
    sentry.y + normY * 3,
    sentry.x + cos * 15 + normX * 3,
    sentry.y + sin * 15 + normY * 3,
    2.0
  );
  ctx.addThickSegment(
    barrelVerts,
    sentry.x - normX * 3,
    sentry.y - normY * 3,
    sentry.x + cos * 15 - normX * 3,
    sentry.y + sin * 15 - normY * 3,
    2.0
  );
  ctx.bufferAndDraw(new Float32Array(barrelVerts));

  // Barrel muzzle brakes
  setColor(ctx, 0.1, 0.12, 0.15);
  ctx.drawCircle(sentry.x + cos * 15 + normX * 3, sentry.y + sin * 15 + normY * 3, 1.8, 6);
  ctx.drawCircle(sentry.x + cos * 15 - normX * 3, sentry.y + sin * 15 - normY * 3, 1.8, 6);

  // 4. Sweeping red laser targeting sight beam
  const sweep = Math.sin(timeSec * 3.0) * 0.05;
  const sightCos = Math.cos(sentry.facingAngle + sweep);
  const sightSin = Math.sin(sentry.facingAngle + sweep);
  setColor(ctx, 1.0, 0.1, 0.2, 0.45);
  const sightVerts: number[] = [];
  ctx.addThickSegment(
    sightVerts,
    sentry.x + sightCos * 16,
    sentry.y + sightSin * 16,
    sentry.x + sightCos * 90,
    sentry.y + sightSin * 90,
    1.2
  );
  ctx.bufferAndDraw(new Float32Array(sightVerts));
}
