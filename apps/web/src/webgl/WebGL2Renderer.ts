import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  RoomAtmosphereSummary,
  WeaponType,
} from '@kybernetes/protocol';
import {
  createInitialDoors,
  findWorldRoom,
  getAirflowDragVector,
  getDecompressionAirflowSources,
  getWorldDoors,
  getWorldOpaqueWalls,
  getWorldStations,
  HESPERIA_WALLS,
  isAboardShip,
  isImpactVisible,
  isPointInPolygon,
  isShipSideRoom,
  type Point2D,
} from '@kybernetes/sim-core';
import { addThickSegment, createCameraMatrix, createProgram } from './glUtils';
import { type HudDrawState, type HudHitTester, HudRenderer } from './hud';
import { renderRaiderIntruder, renderSentryTurret, renderTacticalPawn } from './PawnModels';
import { AtmosOverlayPass } from './passes/AtmosOverlayPass';
import { DeckPass } from './passes/DeckPass';
import { FogOfWarPass } from './passes/FogOfWarPass';
import { LightingPass } from './passes/LightingPass';
import { StarfieldPass } from './passes/StarfieldPass';
import { STATION_NPCS } from './StationHub';
import {
  type RenderContext,
  renderAirlockConsole,
  renderArmoryLocker,
  renderAvionicsTerminal,
  renderBridgeHelm,
  renderCargoWinch,
  renderCrewBunk,
  renderDispenser,
  renderGalleyPrep,
  renderHydroScrubber,
  renderJobBoard,
  renderReactorConsole,
  renderStationInteractionAura,
  renderStationNpc,
} from './StationModels';
import {
  FLAT_FS,
  FLAT_VS,
  FROST_EDGE_FS,
  FROST_EDGE_VS,
  PROJECTILE_FS,
  PROJECTILE_VS,
} from './shaders';
import { FramebufferManager } from './systems/FramebufferManager';
import { ParticleSystem } from './systems/ParticleSystem';

export interface WebGLRenderState extends HudDrawState {
  shipOffset?: { x: number; y: number };
  impacts?: Array<{
    x: number;
    y: number;
    type: 'kinetic' | 'laser' | 'welder';
    shipVelocity?: { vx: number; vy: number };
  }>;
  muzzleFlashes?: Array<{ x: number; y: number; weaponType: WeaponType }>;
  zoom?: number;
  nearestDoorId?: string;
}

function getPlayerAtmosphere(state: WebGLRenderState) {
  const atmospheres = state.telemetry?.roomAtmospheres;
  if (!atmospheres) return undefined;

  const offset = state.shipOffset ?? { x: 0, y: 0 };
  const roomId = findWorldRoom(state.pawn.x, state.pawn.y, offset);
  if (!roomId) return undefined;
  if (roomId !== 'corridor') return atmospheres[roomId];
  if (state.pawn.x <= 440) return atmospheres.corridor_fwd ?? atmospheres.corridor;
  if (state.pawn.x < 760) return atmospheres.corridor_mid ?? atmospheres.corridor;
  return atmospheres.corridor_aft ?? atmospheres.corridor;
}

function computeTargetFrostIntensity(
  state: WebGLRenderState,
  playerAtmosphere: RoomAtmosphereSummary | undefined
): number {
  let intensity = 0;

  if (playerAtmosphere) {
    if (playerAtmosphere.pressureKpa < 20 || playerAtmosphere.tempCelsius < -50) {
      intensity = Math.max(intensity, 0.88);
    } else if (playerAtmosphere.tempCelsius < 5) {
      intensity = Math.max(intensity, Math.min(0.75, (5 - playerAtmosphere.tempCelsius) / 25));
    }
    if (playerAtmosphere.isVenting && playerAtmosphere.pressureKpa > 1.0) {
      intensity = Math.max(intensity, 0.95);
    }
  }

  const bodyTemp = state.vitals?.bodyTempCelsius;
  if (bodyTemp !== undefined && bodyTemp < 35.5) {
    const hypothermiaRatio = Math.min(1.0, (35.5 - bodyTemp) / 8.0);
    intensity = Math.max(intensity, hypothermiaRatio);
  }

  return intensity;
}

// fallow-ignore-next-line complexity
function getRaycastIntersectionT(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): number | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

export class WebGL2Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private projProg: WebGLProgram;
  private frostProg: WebGLProgram;

  private quadBuffer: WebGLBuffer;
  private dynamicBuffer: WebGLBuffer;

  private flatVAO: WebGLVertexArrayObject;
  private projVAO: WebGLVertexArrayObject;
  private vignetteVAO: WebGLVertexArrayObject;
  private frostVAO: WebGLVertexArrayObject;

  private framebufferManager: FramebufferManager;
  private particleSystem: ParticleSystem;
  private starfieldPass: StarfieldPass;
  private deckPass: DeckPass;
  private lightingPass: LightingPass;
  private fogOfWarPass: FogOfWarPass;
  private atmosOverlayPass: AtmosOverlayPass;
  private hudRenderer: HudRenderer;
  private currentFrostIntensity = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL 2 is required but could not be initialized.');
    }
    this.gl = gl;
    this.hudRenderer = new HudRenderer(gl);

    const fsQuad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, fsQuad, gl.STATIC_DRAW);

    this.dynamicBuffer = gl.createBuffer()!;

    this.flatProg = createProgram(gl, FLAT_VS, FLAT_FS);
    this.projProg = createProgram(gl, PROJECTILE_VS, PROJECTILE_FS);
    this.frostProg = createProgram(gl, FROST_EDGE_VS, FROST_EDGE_FS);

    this.flatVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.flatVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const flatPos = gl.getAttribLocation(this.flatProg, 'a_position');
    gl.enableVertexAttribArray(flatPos);
    gl.vertexAttribPointer(flatPos, 2, gl.FLOAT, false, 0, 0);

    this.projVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.projVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const pPos = gl.getAttribLocation(this.projProg, 'a_position');
    const pUv = gl.getAttribLocation(this.projProg, 'a_uv');
    gl.enableVertexAttribArray(pPos);
    gl.vertexAttribPointer(pPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(pUv);
    gl.vertexAttribPointer(pUv, 2, gl.FLOAT, false, 16, 8);

    this.vignetteVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.vignetteVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const vPos = gl.getAttribLocation(this.flatProg, 'a_position');
    gl.enableVertexAttribArray(vPos);
    gl.vertexAttribPointer(vPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.frostVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.frostVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const frostPos = gl.getAttribLocation(this.frostProg, 'a_position');
    gl.enableVertexAttribArray(frostPos);
    gl.vertexAttribPointer(frostPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.framebufferManager = new FramebufferManager(gl);
    this.particleSystem = new ParticleSystem();
    this.starfieldPass = new StarfieldPass(gl, this.quadBuffer);
    this.deckPass = new DeckPass(gl, this.dynamicBuffer);
    this.atmosOverlayPass = new AtmosOverlayPass(gl);
    this.fogOfWarPass = new FogOfWarPass(gl, this.dynamicBuffer);
    this.lightingPass = new LightingPass(gl, this.quadBuffer, this.dynamicBuffer);
  }

  // fallow-ignore-next-line unused-class-member
  public resetFogOfWar(): void {
    this.framebufferManager.resetFogOfWar();
  }

  // fallow-ignore-next-line unused-class-member
  public getLastLoSPolygon(): Point2D[] {
    return this.fogOfWarPass.getLastPlayerLosPoly();
  }

  public getHitTester(): HudHitTester {
    return this.hudRenderer.getHitTester();
  }

  private getRenderContext(): RenderContext {
    return {
      gl: this.gl,
      flatProg: this.flatProg,
      drawQuad: this.drawQuad.bind(this),
      drawCircle: this.drawCircle.bind(this),
      addThickSegment: (verts, x1, y1, x2, y2, th) => addThickSegment(verts, x1, y1, x2, y2, th),
      bufferAndDraw: this.bufferAndDraw.bind(this),
    };
  }

  private bindFlatProgram(matrix: Float32Array): void {
    const gl = this.gl;
    gl.useProgram(this.flatProg);
    gl.bindVertexArray(this.flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.flatProg, 'u_matrix'), false, matrix);
    gl.uniform4fv(
      gl.getUniformLocation(this.flatProg, 'u_projLights'),
      this.lightingPass.currentLights
    );
    gl.uniform3fv(
      gl.getUniformLocation(this.flatProg, 'u_projColors'),
      this.lightingPass.currentLightColors
    );
  }

  private bufferAndDraw(verts: Float32Array, mode?: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.drawArrays(mode ?? gl.TRIANGLES, 0, verts.length / 2);
  }

  private drawQuad(x: number, y: number, w: number, h: number): void {
    const x2 = x + w;
    const y2 = y + h;
    const verts = new Float32Array([x, y, x2, y, x, y2, x, y2, x2, y, x2, y2]);
    this.bufferAndDraw(verts);
  }

  private drawCircle(cx: number, cy: number, r: number, segments: number): void {
    const verts: number[] = [];
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;
      verts.push(
        cx,
        cy,
        cx + Math.cos(a1) * r,
        cy + Math.sin(a1) * r,
        cx + Math.cos(a2) * r,
        cy + Math.sin(a2) * r
      );
    }
    this.bufferAndDraw(new Float32Array(verts));
  }

  // fallow-ignore-next-line complexity
  private renderStations(
    matrix: Float32Array,
    nearestId?: string,
    timeSec = 0,
    shipOffset: { x: number; y: number } = { x: 0, y: 0 }
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const st of getWorldStations(shipOffset)) {
      const isNear = st.id === nearestId;
      if (isNear) {
        renderStationInteractionAura(ctx, st, timeSec);
      }

      if (st.stationType === 'bridge') {
        renderBridgeHelm(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'reactor') {
        renderReactorConsole(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'armory') {
        renderArmoryLocker(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'cargo') {
        renderCargoWinch(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'hydroponics') {
        renderHydroScrubber(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'bunk') {
        renderCrewBunk(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'mess') {
        if (st.id.includes('prep')) {
          renderGalleyPrep(ctx, st, isNear, timeSec);
        } else {
          renderDispenser(ctx, st, isNear, st.id.includes('water'), timeSec);
        }
      } else if (st.stationType === 'avionics') {
        renderAvionicsTerminal(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'airlock') {
        renderAirlockConsole(ctx, st, isNear, timeSec);
      } else if (st.stationType === 'job_board') {
        renderJobBoard(ctx, st, isNear, timeSec);
      }
    }
    this.gl.bindVertexArray(null);
  }

  private renderStationNpcs(matrix: Float32Array, timeSec: number): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();
    for (const npc of STATION_NPCS) {
      renderStationNpc(ctx, npc.x, npc.y, npc.color, timeSec);
    }
    this.gl.bindVertexArray(null);
  }

  private renderPawn(
    matrix: Float32Array,
    pawn: PawnState,
    equippedWeapon: WeaponType = 'kinetic_carbine',
    timeSec = 0
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();
    renderTacticalPawn(ctx, pawn, equippedWeapon, timeSec, this.particleSystem.getWeaponRecoil());
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderIntruders(
    matrix: Float32Array,
    intruders: NonNullable<BoardingTacticsTelemetry['intruders']>,
    timeSec = 0,
    losPoly: Point2D[] = []
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const intruder of intruders) {
      if (intruder.state === 'neutralized') continue;
      const inLoS =
        losPoly.length >= 3 && isPointInPolygon({ x: intruder.x, y: intruder.y }, losPoly);
      if (!inLoS) continue;
      renderRaiderIntruder(ctx, intruder, timeSec);
    }
    this.gl.bindVertexArray(null);
  }

  private renderSentries(
    matrix: Float32Array,
    sentries: NonNullable<BoardingTacticsTelemetry['sentries']>,
    timeSec = 0,
    losPoly: Point2D[] = []
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const sentry of sentries) {
      const inLoS = losPoly.length >= 3 && isPointInPolygon({ x: sentry.x, y: sentry.y }, losPoly);
      if (!inLoS) continue;
      renderSentryTurret(ctx, sentry, timeSec);
    }
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderProjectiles(
    matrix: Float32Array,
    projectiles: ProjectileState[],
    time: number,
    losPoly: Point2D[] = []
  ): void {
    const gl = this.gl;
    gl.useProgram(this.projProg);
    gl.bindVertexArray(this.projVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.projProg, 'u_matrix'), false, matrix);
    gl.uniform1f(gl.getUniformLocation(this.projProg, 'u_time'), time);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    for (const proj of projectiles) {
      if (losPoly.length >= 3 && !isPointInPolygon({ x: proj.x, y: proj.y }, losPoly)) {
        continue;
      }
      let r = 0.0;
      let g = 0.95;
      let b = 1.0;
      let style = 1;
      let beamLen = 22;
      let halfW = 6.5;

      if (proj.weaponType === 'kinetic_carbine') {
        style = 0;
        r = 1.0;
        g = 0.82;
        b = 0.25;
        beamLen = 32;
        halfW = 2.0;
      } else if (proj.weaponType === 'railgun_pistol') {
        style = 0;
        r = 1.0;
        g = 0.95;
        b = 0.75;
        beamLen = 45;
        halfW = 2.2;
      } else if (proj.weaponType === 'pulse_laser') {
        const charge = proj.chargeRatio ?? 1.0;
        style = 1;
        r = 0.0;
        g = 0.95;
        b = 1.0;
        beamLen = Math.round(18 + charge * 24);
        halfW = Number((4.5 + charge * 4.5).toFixed(1));
      } else if (proj.weaponType === 'raider_plasma' || proj.color === '#ff1744') {
        style = 3;
        r = 1.0;
        g = 0.09;
        b = 0.27;
        beamLen = 22;
        halfW = 6.5;
      }

      gl.uniform4f(gl.getUniformLocation(this.projProg, 'u_color'), r, g, b, 1.0);
      gl.uniform1i(gl.getUniformLocation(this.projProg, 'u_style'), style);

      const speed = Math.hypot(proj.vx, proj.vy);
      const fx = speed > 0 ? proj.vx / speed : 1;
      const fy = speed > 0 ? proj.vy / speed : 0;
      const nx = -fy;
      const ny = fx;

      const headX = proj.x + fx * 4;
      const headY = proj.y + fy * 4;
      const tailX = proj.x - fx * beamLen;
      const tailY = proj.y - fy * beamLen;

      const c0x = tailX - nx * halfW;
      const c0y = tailY - ny * halfW;
      const c1x = tailX + nx * halfW;
      const c1y = tailY + ny * halfW;
      const c2x = headX - nx * halfW;
      const c2y = headY - ny * halfW;
      const c3x = headX + nx * halfW;
      const c3y = headY + ny * halfW;

      const verts = new Float32Array([
        c0x,
        c0y,
        -1.0,
        -1.0,
        c2x,
        c2y,
        1.0,
        -1.0,
        c1x,
        c1y,
        -1.0,
        1.0,
        c1x,
        c1y,
        -1.0,
        1.0,
        c2x,
        c2y,
        1.0,
        -1.0,
        c3x,
        c3y,
        1.0,
        1.0,
      ]);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderWelderArc(
    matrix: Float32Array,
    welder: NonNullable<WebGLRenderState['welderState']>,
    doors?: DoorState[],
    offset: { x: number; y: number } = { x: 0, y: 0 }
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const startX = welder.originX + Math.cos(welder.facingAngle) * 14;
    const startY = welder.originY + Math.sin(welder.facingAngle) * 14;
    const nominalDist = welder.range || 48;
    const nominalEndX = startX + Math.cos(welder.facingAngle) * nominalDist;
    const nominalEndY = startY + Math.sin(welder.facingAngle) * nominalDist;

    let minT = 1.0;
    const p1 = { x: startX, y: startY };
    const p2 = { x: nominalEndX, y: nominalEndY };

    for (const wall of getWorldOpaqueWalls(HESPERIA_WALLS, doors, undefined, offset)) {
      if (wall.isTraversable) continue;
      const t = getRaycastIntersectionT(
        p1,
        p2,
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 }
      );
      if (t !== null && t < minT) minT = t;
    }

    const endX = startX + (nominalEndX - startX) * minT;
    const endY = startY + (nominalEndY - startY) * minT;

    const segments = 8;
    const dx = endX - startX;
    const dy = endY - startY;
    const perpX = -Math.sin(welder.facingAngle);
    const perpY = Math.cos(welder.facingAngle);

    const mainVerts: number[] = [];
    let curX = startX;
    let curY = startY;

    for (let i = 1; i <= segments; i++) {
      const prog = i / segments;
      const baseNextX = startX + dx * prog;
      const baseNextY = startY + dy * prog;
      const jitter = i === segments ? 0 : (Math.random() - 0.5) * 14 * Math.sin(prog * Math.PI);
      const nextX = baseNextX + perpX * jitter;
      const nextY = baseNextY + perpY * jitter;

      addThickSegment(mainVerts, curX, curY, nextX, nextY, 3.2);
      curX = nextX;
      curY = nextY;
    }

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.9, 1.0, 0.85);
    this.bufferAndDraw(new Float32Array(mainVerts));

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.95);
    this.bufferAndDraw(new Float32Array(mainVerts));

    this.particleSystem.addImpact(endX, endY, 'welder');

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderChargingReticle(
    matrix: Float32Array,
    pawn: PawnState,
    mouse: { x: number; y: number },
    charging: NonNullable<WebGLRenderState['chargingState']>,
    time: number
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const mx = pawn.x + Math.cos(pawn.facingAngle) * 16;
    const my = pawn.y + Math.sin(pawn.facingAngle) * 16;
    const orbRadius = 3.0 + charging.ratio * 8.0;
    const pulse = 0.85 + 0.15 * Math.sin(time * 30.0);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.95, 1.0, 0.85 * pulse);
    this.drawCircle(mx, my, orbRadius, 16);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.95);
    this.drawCircle(mx, my, orbRadius * 0.45, 12);

    const arcSegs: number[] = [];
    const steps = Math.max(4, Math.floor(charging.ratio * 24));
    for (let i = 0; i < steps; i++) {
      const a1 = (i / 24) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / 24) * Math.PI * 2 - Math.PI / 2;
      addThickSegment(
        arcSegs,
        mouse.x + Math.cos(a1) * 14,
        mouse.y + Math.sin(a1) * 14,
        mouse.x + Math.cos(a2) * 14,
        mouse.y + Math.sin(a2) * 14,
        2.2
      );
    }
    if (arcSegs.length > 0) {
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.95, 1.0, 0.9);
      this.bufferAndDraw(new Float32Array(arcSegs));
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  private renderAimingReticle(
    matrix: Float32Array,
    pawn: PawnState,
    mouse: { x: number; y: number }
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.9, 1.0, 0.35);
    const lineVerts: number[] = [];
    addThickSegment(lineVerts, pawn.x, pawn.y, mouse.x, mouse.y, 1.2);

    addThickSegment(lineVerts, mouse.x - 8, mouse.y, mouse.x - 3, mouse.y, 1.5);
    addThickSegment(lineVerts, mouse.x + 3, mouse.y, mouse.x + 8, mouse.y, 1.5);
    addThickSegment(lineVerts, mouse.x, mouse.y - 8, mouse.x, mouse.y - 3, 1.5);
    addThickSegment(lineVerts, mouse.x, mouse.y + 3, mouse.x, mouse.y + 8, 1.5);

    this.bufferAndDraw(new Float32Array(lineVerts));
    gl.bindVertexArray(null);
  }

  private renderFullscreenVignette(r: number, g: number, b: number, a: number): void {
    const gl = this.gl;
    gl.useProgram(this.flatProg);
    gl.bindVertexArray(this.vignetteVAO);

    const idMat = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.flatProg, 'u_matrix'), false, idMat);
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), r, g, b, a);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  private renderHypoxiaVignette(
    hypoxiaPercent: number,
    isIncapacitated: boolean,
    time: number
  ): void {
    const alpha = isIncapacitated
      ? 0.88 + 0.07 * Math.sin(time * 2.5)
      : Math.min(0.75, ((hypoxiaPercent - 20) / 80) * 0.75);
    this.renderFullscreenVignette(0.01, 0.01, 0.02, alpha);
  }

  private renderFrostCrystals(timeSec: number, intensity: number, aspect: number): void {
    const gl = this.gl;
    gl.useProgram(this.frostProg);
    gl.bindVertexArray(this.frostVAO);
    gl.uniform1f(gl.getUniformLocation(this.frostProg, 'u_time'), timeSec);
    gl.uniform1f(gl.getUniformLocation(this.frostProg, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(this.frostProg, 'u_aspect'), aspect);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public render(state: WebGLRenderState, width: number, height: number): void {
    const gl = this.gl;
    const zoom = state.zoom ?? 1.0;
    const matrix = createCameraMatrix(width, height, state.camera.x, state.camera.y, zoom);
    const timeSec = state.timeMs * 0.001;
    const dt = 0.016;

    const frameOffset = state.shipOffset ?? { x: 0, y: 0 };
    this.deckPass.shipOffset = frameOffset;

    const doors = state.telemetry?.boarding?.doors || state.boarding?.doors || createInitialDoors();
    const playerAtmosphere = getPlayerAtmosphere(state);
    const decompressionSources = getDecompressionAirflowSources(
      doors,
      state.telemetry?.hull?.breaches,
      state.telemetry?.roomAtmospheres
    );
    const targetFrost = computeTargetFrostIntensity(state, playerAtmosphere);
    const thawRate = targetFrost > this.currentFrostIntensity ? 0.85 : 0.45;
    this.currentFrostIntensity +=
      (targetFrost - this.currentFrostIntensity) * Math.min(1.0, dt * thawRate * 3.5);
    if (this.currentFrostIntensity < 0.005) {
      this.currentFrostIntensity = 0;
    }
    const impactDoors = getWorldDoors(doors, frameOffset);
    if (state.impacts) {
      for (const imp of state.impacts) {
        if (
          isImpactVisible({ x: state.pawn.x, y: state.pawn.y }, { x: imp.x, y: imp.y }, impactDoors)
        ) {
          this.particleSystem.addImpact(imp.x, imp.y, imp.type, imp.shipVelocity);
        }
      }
    }
    if (state.muzzleFlashes) {
      for (const mf of state.muzzleFlashes) {
        this.particleSystem.addMuzzleFlash(mf);
      }
    }
    const particleOffset = frameOffset;
    for (const source of decompressionSources) {
      const sx = isShipSideRoom(source.roomId) ? source.x + particleOffset.x : source.x;
      this.particleSystem.emitAirflow(sx, source.y, source.u, source.v, source.intensity);
    }
    const dragAboard = isAboardShip(state.pawn.x, state.pawn.y, particleOffset);
    if (playerAtmosphere?.isVenting && playerAtmosphere.pressureKpa > 0.5) {
      const airflow = getAirflowDragVector(
        dragAboard ? state.pawn.x - particleOffset.x : state.pawn.x,
        dragAboard ? state.pawn.y - particleOffset.y : state.pawn.y,
        doors,
        state.telemetry?.hull?.breaches,
        state.telemetry?.roomAtmospheres
      );
      const intensity = Math.min(1.0, playerAtmosphere.pressureKpa / 101.3);
      this.particleSystem.emitAirflow(state.pawn.x, state.pawn.y, airflow.u, airflow.v, intensity);
    }
    this.particleSystem.update(dt);

    const opaqueWalls = getWorldOpaqueWalls(
      HESPERIA_WALLS,
      doors,
      state.telemetry?.hull?.breaches,
      frameOffset
    );
    const doorsHash = (state.boarding?.doors || [])
      .map((d) => `${d.id}:${d.isOpen ? '1' : '0'}`)
      .join('|');

    // PASS 1: Render Lightmap FBO
    const playerLoSPoly = this.lightingPass.renderLightmap(
      matrix,
      state.pawn,
      doorsHash,
      state.boarding?.projectiles,
      this.particleSystem.getMuzzleFlashes(),
      state.welderState,
      timeSec,
      opaqueWalls,
      width,
      height,
      this.framebufferManager,
      this.fogOfWarPass,
      frameOffset.x
    );

    const welders = state.welderArcs || (state.welderState ? [state.welderState] : []);
    this.lightingPass.updateLights(state.boarding?.projectiles, welders, playerLoSPoly);

    // PASS 2: Render Ship Base Scene into Scene FBO
    const { fbo: sceneFbo } = this.framebufferManager.ensureSceneFBO(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, width, height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.015, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.starfieldPass.render(width, height, state.camera, timeSec);
    this.deckPass.renderOuterHull(this.flatProg, this.flatVAO, matrix, timeSec);
    this.deckPass.renderDeckFloors(
      matrix,
      timeSec,
      this.lightingPass.currentLights,
      this.lightingPass.currentLightColors
    );
    this.atmosOverlayPass.render(
      matrix,
      state.boarding?.doors,
      state.telemetry?.hull?.breaches,
      state.telemetry?.activeFires,
      state.telemetry?.roomAtmospheres,
      state.overlayMode ?? 'off',
      timeSec,
      frameOffset.x
    );
    this.deckPass.renderFurniture(this.flatProg, this.flatVAO, matrix, timeSec);
    const partitionHoles =
      state.telemetry?.boarding?.partitionHoles || state.boarding?.partitionHoles;
    this.deckPass.renderBulkheads(
      this.flatProg,
      this.flatVAO,
      matrix,
      state.telemetry?.hull?.breaches,
      timeSec,
      partitionHoles
    );
    this.deckPass.renderDoors(this.flatProg, this.flatVAO, matrix, doors, dt, state.nearestDoorId);
    this.deckPass.renderCorridorLampFixtures(this.flatProg, this.flatVAO, matrix, timeSec);
    this.renderStations(matrix, state.nearestStation?.id, timeSec, frameOffset);
    this.renderStationNpcs(matrix, timeSec);

    this.renderPawn(matrix, state.pawn, state.equippedWeapon, timeSec);
    if (state.remotePawns) {
      for (const rp of state.remotePawns) {
        const inLoS =
          playerLoSPoly.length >= 3 && isPointInPolygon({ x: rp.x, y: rp.y }, playerLoSPoly);
        if (inLoS) {
          const rpWeapon: WeaponType = rp.isWelding ? 'arc_welder' : 'kinetic_carbine';
          this.renderPawn(matrix, rp, rpWeapon, timeSec);
        }
      }
    }
    this.renderIntruders(matrix, state.boarding?.intruders || [], timeSec, playerLoSPoly);
    this.renderSentries(matrix, state.boarding?.sentries || [], timeSec, playerLoSPoly);
    this.particleSystem.renderDustMotes(
      gl,
      this.flatProg,
      this.flatVAO,
      matrix,
      timeSec,
      dt,
      this.drawCircle.bind(this)
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // PASS 3: Composite Scene with Lightmap
    this.lightingPass.applyLightmap(this.framebufferManager, width, height);

    // PASS 4: Emissive passes
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.renderProjectiles(matrix, state.boarding?.projectiles || [], timeSec, playerLoSPoly);
    const shipOffset = state.shipOffset ?? { x: 0, y: 0 };
    const worldDoors = getWorldDoors(doors, shipOffset);
    for (const w of welders) {
      if (
        w.active &&
        isImpactVisible(
          { x: state.pawn.x, y: state.pawn.y },
          { x: w.originX, y: w.originY },
          worldDoors
        )
      ) {
        this.renderWelderArc(matrix, w, doors, shipOffset);
      }
    }

    if (state.chargingState?.active && state.chargingState.weaponType === 'pulse_laser') {
      this.renderChargingReticle(
        matrix,
        state.pawn,
        state.mouseWorld,
        state.chargingState,
        timeSec
      );
    }

    this.particleSystem.renderImpactParticles(
      gl,
      this.flatProg,
      this.flatVAO,
      matrix,
      dt,
      this.drawQuad.bind(this)
    );
    this.particleSystem.renderAirflowParticles(
      gl,
      this.flatProg,
      this.flatVAO,
      matrix,
      timeSec,
      dt,
      this.drawQuad.bind(this),
      this.drawCircle.bind(this)
    );
    this.renderAimingReticle(matrix, state.pawn, state.mouseWorld);

    if (state.vitals) {
      if (state.vitals.hypoxiaPercent > 20 || state.vitals.incapacitated?.isIncapacitated) {
        this.renderHypoxiaVignette(
          state.vitals.hypoxiaPercent,
          Boolean(state.vitals.incapacitated?.isIncapacitated),
          timeSec
        );
      }
    }

    // PASS 5: Curved Visor & Tactical Diegetic HUD
    const hudW = state.screenWidth ?? width;
    const hudH = state.screenHeight ?? height;
    this.hudRenderer.render(state, hudW, hudH, timeSec, playerLoSPoly);
    if (this.currentFrostIntensity > 0.005) {
      this.renderFrostCrystals(timeSec, this.currentFrostIntensity, hudW / Math.max(1, hudH));
    }
  }

  // fallow-ignore-next-line unused-class-member
  public dispose(): void {
    const gl = this.gl;
    this.framebufferManager.dispose();
    this.starfieldPass.dispose();
    this.deckPass.dispose();
    this.atmosOverlayPass.dispose();
    this.lightingPass.dispose();
    this.fogOfWarPass.dispose();
    gl.deleteProgram(this.flatProg);
    gl.deleteProgram(this.projProg);
    gl.deleteProgram(this.frostProg);
    gl.deleteVertexArray(this.flatVAO);
    gl.deleteVertexArray(this.projVAO);
    gl.deleteVertexArray(this.vignetteVAO);
    gl.deleteVertexArray(this.frostVAO);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.dynamicBuffer);
  }
}
