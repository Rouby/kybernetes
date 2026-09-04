import type { StationFixture } from '@kybernetes/protocol';

export interface RenderContext {
  gl: WebGL2RenderingContext;
  flatProg: WebGLProgram;
  drawQuad: (x: number, y: number, w: number, h: number) => void;
  drawCircle: (cx: number, cy: number, r: number, segments: number) => void;
  addThickSegment: (
    verts: number[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number
  ) => void;
  bufferAndDraw: (verts: Float32Array, mode?: number) => void;
}

function setColor(ctx: RenderContext, r: number, g: number, b: number, a = 1.0): void {
  ctx.gl.uniform4f(ctx.gl.getUniformLocation(ctx.flatProg, 'u_color'), r, g, b, a);
}

export function renderStationInteractionAura(
  ctx: RenderContext,
  st: StationFixture,
  time: number
): void {
  const pulse = 0.65 + 0.35 * Math.sin(time * 4.0);
  setColor(ctx, 0.0, 0.9, 1.0, 0.25 * pulse);
  ctx.drawCircle(st.x, st.y, st.radius + 6, 24);

  // Tactical corner brackets around the station
  setColor(ctx, 0.0, 0.95, 1.0, 0.75 * pulse);
  const size = st.radius + 2;
  const bracket = 8;
  const verts: number[] = [];

  // Top-left
  ctx.addThickSegment(verts, st.x - size, st.y - size + bracket, st.x - size, st.y - size, 1.8);
  ctx.addThickSegment(verts, st.x - size, st.y - size, st.x - size + bracket, st.y - size, 1.8);

  // Top-right
  ctx.addThickSegment(verts, st.x + size - bracket, st.y - size, st.x + size, st.y - size, 1.8);
  ctx.addThickSegment(verts, st.x + size, st.y - size, st.x + size, st.y - size + bracket, 1.8);

  // Bottom-left
  ctx.addThickSegment(verts, st.x - size, st.y + size - bracket, st.x - size, st.y + size, 1.8);
  ctx.addThickSegment(verts, st.x - size, st.y + size, st.x - size + bracket, st.y + size, 1.8);

  // Bottom-right
  ctx.addThickSegment(verts, st.x + size - bracket, st.y + size, st.x + size, st.y + size, 1.8);
  ctx.addThickSegment(verts, st.x + size, st.y + size, st.x + size, st.y + size - bracket, 1.8);

  ctx.bufferAndDraw(new Float32Array(verts));
}

export function renderBridgeHelm(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Curved command console base
  setColor(ctx, 0.12, 0.15, 0.22);
  ctx.drawQuad(st.x - 24, st.y - 12, 48, 24);

  // Front beveled edge
  setColor(ctx, 0.25, 0.32, 0.44);
  ctx.drawQuad(st.x - 22, st.y + 8, 44, 4);

  // Center primary navigation display
  setColor(ctx, 0.05, 0.1, 0.16);
  ctx.drawQuad(st.x - 10, st.y - 10, 20, 14);

  // Center navigation radar sweep
  const sweepAngle = time * 2.5;
  setColor(ctx, 0.0, 0.95, 1.0, isNear ? 0.95 : 0.7);
  const radarVerts: number[] = [];
  ctx.addThickSegment(
    radarVerts,
    st.x,
    st.y - 3,
    st.x + Math.cos(sweepAngle) * 7,
    st.y - 3 + Math.sin(sweepAngle) * 5,
    1.4
  );
  ctx.bufferAndDraw(new Float32Array(radarVerts));

  // Flanking telemetry screens (Left: Green engine stats, Right: Amber comms)
  setColor(ctx, 0.1, 0.8, 0.3, isNear ? 0.9 : 0.6);
  ctx.drawQuad(st.x - 20, st.y - 9, 8, 12);
  setColor(ctx, 1.0, 0.7, 0.1, isNear ? 0.9 : 0.6);
  ctx.drawQuad(st.x + 12, st.y - 9, 8, 12);
}

export function renderReactorConsole(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Heavy reinforced monitor console base
  setColor(ctx, 0.14, 0.16, 0.2);
  ctx.drawQuad(st.x - 20, st.y - 14, 40, 28);

  // Flanking containment fuel rod pillars
  const pulseLeft = 0.5 + 0.5 * Math.sin(time * 3.0);
  const pulseRight = 0.5 + 0.5 * Math.cos(time * 3.0);

  // Left rod chamber
  setColor(ctx, 0.08, 0.1, 0.14);
  ctx.drawQuad(st.x - 18, st.y - 12, 6, 24);
  setColor(ctx, 0.2, 0.9, 0.4, 0.8 * pulseLeft);
  ctx.drawQuad(st.x - 17, st.y - 10 + (1 - pulseLeft) * 10, 4, 18 * pulseLeft);

  // Right rod chamber
  setColor(ctx, 0.08, 0.1, 0.14);
  ctx.drawQuad(st.x + 12, st.y - 12, 6, 24);
  setColor(ctx, 0.2, 0.9, 0.4, 0.8 * pulseRight);
  ctx.drawQuad(st.x + 13, st.y - 10 + (1 - pulseRight) * 10, 4, 18 * pulseRight);

  // Center core plasma monitor
  setColor(ctx, 0.05, 0.08, 0.12);
  ctx.drawQuad(st.x - 9, st.y - 11, 18, 15);

  const coreHeat = 0.85 + 0.15 * Math.sin(time * 5.0);
  setColor(ctx, 1.0, 0.55 * coreHeat, 0.1, isNear ? 0.95 : 0.75);
  ctx.drawCircle(st.x, st.y - 3, 5, 12);
}

export function renderArmoryLocker(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Heavy ballistic locker cabinet
  setColor(ctx, 0.15, 0.17, 0.22);
  ctx.drawQuad(st.x - 18, st.y - 18, 36, 36);

  // Beveled locker door seams
  setColor(ctx, 0.25, 0.29, 0.38);
  const seamVerts: number[] = [];
  ctx.addThickSegment(seamVerts, st.x, st.y - 18, st.x, st.y + 18, 1.5);
  ctx.addThickSegment(seamVerts, st.x - 18, st.y, st.x + 18, st.y, 1.2);
  ctx.bufferAndDraw(new Float32Array(seamVerts));

  // Left compartment: rifle racks
  setColor(ctx, 0.08, 0.09, 0.12);
  ctx.drawQuad(st.x - 15, st.y - 14, 12, 28);
  setColor(ctx, 0.4, 0.45, 0.55);
  const rifleVerts: number[] = [];
  ctx.addThickSegment(rifleVerts, st.x - 11, st.y - 12, st.x - 11, st.y + 10, 2.0);
  ctx.addThickSegment(rifleVerts, st.x - 7, st.y - 12, st.x - 7, st.y + 10, 2.0);
  ctx.bufferAndDraw(new Float32Array(rifleVerts));

  // Right compartment: ammo canister rack with copper/gold tips
  setColor(ctx, 0.08, 0.09, 0.12);
  ctx.drawQuad(st.x + 3, st.y - 14, 12, 28);
  setColor(ctx, 0.85, 0.65, 0.2);
  ctx.drawQuad(st.x + 5, st.y - 10, 8, 4);
  ctx.drawQuad(st.x + 5, st.y - 2, 8, 4);
  ctx.drawQuad(st.x + 5, st.y + 6, 8, 4);

  // Top keypad access light
  const blink = Math.sin(time * 4.0) > 0;
  setColor(ctx, blink ? 0.0 : 0.9, blink ? 0.9 : 0.1, 0.15, isNear ? 1.0 : 0.6);
  ctx.drawCircle(st.x + 12, st.y - 14, 2, 8);
}

export function renderCargoWinch(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Winch frame base
  setColor(ctx, 0.2, 0.22, 0.26);
  ctx.drawQuad(st.x - 20, st.y - 14, 40, 28);

  // Yellow hazard diagonal safety borders
  setColor(ctx, 0.92, 0.75, 0.05);
  ctx.drawQuad(st.x - 20, st.y - 14, 40, 4);
  ctx.drawQuad(st.x - 20, st.y + 10, 40, 4);

  // Winch cable drum spool
  setColor(ctx, 0.1, 0.12, 0.15);
  ctx.drawQuad(st.x - 12, st.y - 8, 24, 16);

  // Coiled steel cable ridges
  setColor(ctx, 0.5, 0.55, 0.65);
  const cableVerts: number[] = [];
  for (let i = -8; i <= 8; i += 4) {
    ctx.addThickSegment(cableVerts, st.x + i, st.y - 7, st.x + i, st.y + 7, 1.6);
  }
  ctx.bufferAndDraw(new Float32Array(cableVerts));

  // Mag-crane winch status beacon
  const rot = time * 3.0;
  setColor(ctx, 0.0, 0.9, 1.0, isNear ? 0.95 : 0.6);
  ctx.drawCircle(st.x + 14, st.y - 10, 3, 8);
  const hookVerts: number[] = [];
  ctx.addThickSegment(hookVerts, st.x, st.y + 8, st.x + Math.sin(rot) * 6, st.y + 14, 2.0);
  ctx.bufferAndDraw(new Float32Array(hookVerts));
}

export function renderHydroScrubber(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Cylindrical scrubber intake housing
  setColor(ctx, 0.15, 0.18, 0.23);
  ctx.drawCircle(st.x, st.y, 18, 24);

  // Outer bezel ring
  setColor(ctx, 0.28, 0.35, 0.44);
  ctx.drawCircle(st.x, st.y, 15, 20);

  // Recessed intake vent
  setColor(ctx, 0.06, 0.08, 0.12);
  ctx.drawCircle(st.x, st.y, 11, 16);

  // Spinning centrifugal turbine fan blades (4 blades)
  const angle = time * 6.0;
  setColor(ctx, 0.0, 0.85, 0.95, isNear ? 0.9 : 0.65);
  const fanVerts: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2;
    ctx.addThickSegment(fanVerts, st.x, st.y, st.x + Math.cos(a) * 9, st.y + Math.sin(a) * 9, 2.2);
  }
  ctx.bufferAndDraw(new Float32Array(fanVerts));

  // Central fan cap
  setColor(ctx, 0.9, 0.95, 1.0);
  ctx.drawCircle(st.x, st.y, 3, 10);
}

export function renderCrewBunk(
  ctx: RenderContext,
  st: StationFixture,
  _isNear: boolean,
  _time: number
): void {
  // Bunk frame outer capsule
  setColor(ctx, 0.18, 0.2, 0.26);
  ctx.drawQuad(st.x - 22, st.y - 12, 44, 24);

  // Soft thermal sleeping mattress
  setColor(ctx, 0.72, 0.76, 0.84);
  ctx.drawQuad(st.x - 18, st.y - 9, 36, 18);

  // Pillow headrest
  setColor(ctx, 0.92, 0.94, 0.98);
  ctx.drawQuad(st.x - 17, st.y - 8, 8, 16);

  // Thermal blanket fold
  setColor(ctx, 0.35, 0.45, 0.6);
  ctx.drawQuad(st.x - 5, st.y - 9, 23, 18);

  // Wall-mounted sleep terminal
  setColor(ctx, 0.0, 0.85, 1.0, 0.6);
  ctx.drawQuad(st.x - 18, st.y - 12, 6, 2);
}

export function renderGalleyPrep(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  _time: number
): void {
  // Stainless steel countertop
  setColor(ctx, 0.65, 0.7, 0.78);
  ctx.drawQuad(st.x - 18, st.y - 12, 36, 24);

  // Dark countertop edge trim
  setColor(ctx, 0.2, 0.24, 0.3);
  ctx.drawQuad(st.x - 18, st.y + 9, 36, 3);

  // Induction stove heating element (dual circular rings)
  setColor(ctx, 0.85, 0.25, 0.15, isNear ? 0.9 : 0.5);
  ctx.drawCircle(st.x - 8, st.y - 1, 6, 14);
  setColor(ctx, 0.65, 0.7, 0.78);
  ctx.drawCircle(st.x - 8, st.y - 1, 4, 12);

  // Cutting / ration assembly tray
  setColor(ctx, 0.82, 0.85, 0.88);
  ctx.drawQuad(st.x + 3, st.y - 7, 12, 14);
}

export function renderDispenser(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  isWater: boolean,
  time: number
): void {
  // Wall-recessed housing unit
  setColor(ctx, 0.16, 0.19, 0.25);
  ctx.drawQuad(st.x - 12, st.y - 10, 24, 20);

  // Dispensing alcove basin
  setColor(ctx, 0.08, 0.1, 0.14);
  ctx.drawQuad(st.x - 8, st.y - 6, 16, 14);

  if (isWater) {
    // Water dispenser: cool cyan illumination & dripping droplet
    const drip = Math.sin(time * 3.0) * 3;
    setColor(ctx, 0.0, 0.9, 1.0, isNear ? 0.95 : 0.7);
    ctx.drawQuad(st.x - 3, st.y - 6, 6, 3);
    ctx.drawCircle(st.x, st.y + drip, 2, 8);
  } else {
    // Nutrient paste dispenser: amber ration hopper
    setColor(ctx, 0.95, 0.7, 0.15, isNear ? 0.95 : 0.7);
    ctx.drawQuad(st.x - 6, st.y - 6, 12, 4);
    setColor(ctx, 0.8, 0.45, 0.1);
    ctx.drawQuad(st.x - 4, st.y - 1, 8, 6);
  }
}

export function renderAvionicsTerminal(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Server rack cabinet base
  setColor(ctx, 0.12, 0.15, 0.22);
  ctx.drawQuad(st.x - 18, st.y - 14, 36, 28);

  // Optical bus server blades
  const pulse = 0.6 + 0.4 * Math.sin(time * 6.0);
  setColor(ctx, 0.05, 0.08, 0.12);
  ctx.drawQuad(st.x - 14, st.y - 10, 28, 20);

  // Status indicator LEDs
  setColor(ctx, 0.0, 0.85, 1.0, isNear ? 0.95 : 0.7 * pulse);
  ctx.drawQuad(st.x - 10, st.y - 6, 8, 4);
  setColor(ctx, 0.2, 0.95, 0.4, isNear ? 0.95 : 0.6);
  ctx.drawQuad(st.x + 2, st.y - 6, 8, 4);
  setColor(ctx, 1.0, 0.7, 0.1, 0.8 * pulse);
  ctx.drawQuad(st.x - 10, st.y + 2, 20, 3);
}

export function renderAirlockConsole(
  ctx: RenderContext,
  st: StationFixture,
  isNear: boolean,
  time: number
): void {
  // Heavy yellow/black hazard console mount
  setColor(ctx, 0.18, 0.16, 0.14);
  ctx.drawQuad(st.x - 16, st.y - 12, 32, 24);

  // Hazard border
  setColor(ctx, 0.92, 0.75, 0.05);
  ctx.drawQuad(st.x - 16, st.y - 12, 32, 3);
  ctx.drawQuad(st.x - 16, st.y + 9, 32, 3);

  // Cycling status display
  const blink = Math.sin(time * 4.0) > 0;
  setColor(ctx, blink ? 0.0 : 0.9, blink ? 0.9 : 0.2, 0.2, isNear ? 1.0 : 0.7);
  ctx.drawQuad(st.x - 8, st.y - 5, 16, 10);
}
