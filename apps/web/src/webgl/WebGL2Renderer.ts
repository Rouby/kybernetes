import type {
  AirFlow,
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  RoomAtmosphereSummary,
  WeaponType,
} from '@kybernetes/protocol';
import {
  type BreachRenderModel,
  createInitialDoors,
  type ExplorationGrid,
  findWorldRoom,
  getWorldDoors,
  getWorldOpaqueWalls,
  getWorldRooms,
  getWorldStations,
  HESPERIA_WALLS,
  isImpactVisible,
  isPointInPolygon,
  type Point2D,
  resetExplorationGrid,
  throatFlowToPx,
  updateExplorationGrid,
} from '@kybernetes/sim-core';
import { renderClutter } from './Clutter';
import { clearFowGrid, createFowGrid, loadFowGrid, saveFowGrid } from './fowMemory';
import { addThickSegment, createCameraMatrix, createProgram } from './glUtils';
import { type HudDrawState, type HudHitTester, HudRenderer } from './hud';
import { type LivingView, renderLivingFixtures } from './LivingFixtures';
import { renderRaiderIntruder, renderSentryTurret, renderTacticalPawn } from './PawnModels';
import { DeckPass, THRUSTER_BELLS } from './passes/DeckPass';
import { FogOfWarPass } from './passes/FogOfWarPass';
import { LightingPass } from './passes/LightingPass';
import { StarfieldPass } from './passes/StarfieldPass';
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

export interface ImpactRenderState {
  readonly x: number;
  readonly y: number;
  readonly type: 'kinetic' | 'laser' | 'welder' | 'breach';
  readonly shipVelocity?: { vx: number; vy: number };
  /** Surface tangent in radians. Orients spark cone + crater. */
  readonly angle?: number;
  readonly weapon?: string;
  /** Normalized hit energy 0-1. Scales sparks + flash. */
  readonly energy?: number;
  /** Live breach area m2; punctures read as 0.05. Scales the throw. */
  readonly breachAreaM2?: number;
  /** Room pressure kPa; vacuum damps sparks, ΔP drives vapor. */
  readonly pressureKpa?: number;
}

export interface DecalRenderState {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly weapon: string;
  /** 0 fresh .. 1 cooled. */
  readonly cool: number;
}

export interface DockRenderState {
  readonly walkable: boolean;
  readonly phase: string;
  readonly secondsToSeal: number;
}

/** Welder arcs feeding the light and emissive passes (live state or arc list). */
type WelderArcSet = Array<{
  active: boolean;
  originX: number;
  originY: number;
  facingAngle: number;
  range: number;
}>;

export interface WebGLRenderState extends HudDrawState {
  shipOffset?: { x: number; y: number };
  /** True while the vessel is underway (in transit); exhaust burns full. */
  shipUnderway?: boolean;
  impacts?: Array<ImpactRenderState>;
  /** Persistent scorch decals (server LRU, world-space). */
  decals?: DecalRenderState[];
  /** Dock walkway state for the gauntlet tube visual. */
  dock?: DockRenderState;
  /** Live breach models cut from snapshot portal geometry (oldest first). */
  breaches?: BreachRenderModel[];
  /** TELEMETRY throat velocities keyed by portal id. */
  breachFlows?: readonly AirFlow[];
  muzzleFlashes?: Array<{ x: number; y: number; weaponType: WeaponType }>;
  zoom?: number;
  nearestDoorId?: string;
  /** Living fixtures in world coords (snapshot state, ship offset applied). */
  livingFixtures?: readonly LivingView[];
  nearestLivingId?: string | null;
}

function bareRoomId(roomA: string): string {
  const dot = roomA.indexOf('.');
  return dot < 0 ? roomA : roomA.slice(dot + 1);
}

function getPlayerAtmosphere(state: WebGLRenderState) {
  const atmospheres = state.telemetry?.roomAtmospheres;
  if (!atmospheres) return undefined;

  const offset = state.shipOffset ?? { x: 0, y: 0 };
  const roomId = findWorldRoom(state.pawn.x, state.pawn.y, offset);
  if (!roomId) return undefined;
  if (roomId !== 'korridor_schiff') return atmospheres[roomId];
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
  private hudRenderer: HudRenderer;
  private currentFrostIntensity = 0;
  private fowGrid: ExplorationGrid = createFowGrid();
  private fowBeacon: string | null = null;
  private fowUserId: string | null = null;
  private fowHydratedKey: string | null = null;
  private fowFramesSinceSave = 0;

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
    this.fogOfWarPass = new FogOfWarPass(gl, this.dynamicBuffer);
    this.lightingPass = new LightingPass(gl, this.quadBuffer, this.dynamicBuffer);
  }

  // fallow-ignore-next-line unused-class-member -- live: HarborViewport sets the per-player FOW key every frame; analyzer misses the session-indirected call
  public setFowIdentity(beacon: string, userId: string): void {
    if (this.fowBeacon === beacon && this.fowUserId === userId) return;
    this.fowBeacon = beacon;
    this.fowUserId = userId;
    this.fowHydratedKey = null;
    this.fowFramesSinceSave = 0;
  }

  private fowIdentityKey(): string | null {
    if (this.fowBeacon === null || this.fowUserId === null) return null;
    return `${this.fowBeacon}:${this.fowUserId}`;
  }

  private ensureFowHydrated(): void {
    const key = this.fowIdentityKey();
    if (key === null || this.fowHydratedKey === key) return;
    this.fowHydratedKey = key;
    if (typeof window === 'undefined' || this.fowBeacon === null || this.fowUserId === null) return;
    try {
      const restored = loadFowGrid(window.localStorage, this.fowBeacon, this.fowUserId);
      if (restored !== null) {
        this.fowGrid = restored;
        this.fogOfWarPass.restoreFromExplorationGrid(this.framebufferManager, restored);
      }
    } catch {
      // GPU mask alone still tracks this session.
    }
  }

  private trackFowExploration(pawn: { x: number; y: number }, poly: Point2D[]): void {
    updateExplorationGrid(this.fowGrid, poly, pawn, 0);
    this.fowFramesSinceSave += 1;
    if (this.fowFramesSinceSave < 300) return;
    this.fowFramesSinceSave = 0;
    if (this.fowBeacon === null || this.fowUserId === null || typeof window === 'undefined') return;
    saveFowGrid(window.localStorage, this.fowBeacon, this.fowUserId, this.fowGrid);
  }

  // fallow-ignore-next-line unused-class-member
  public resetFogOfWar(): void {
    resetExplorationGrid(this.fowGrid);
    this.framebufferManager.resetFogOfWar();
    this.fowFramesSinceSave = 0;
    if (this.fowBeacon !== null && this.fowUserId !== null && typeof window !== 'undefined') {
      clearFowGrid(window.localStorage, this.fowBeacon, this.fowUserId);
    }
  }

  // fallow-ignore-next-line unused-class-member
  public getLastLoSPolygon(): Point2D[] {
    return this.fogOfWarPass.getLastPlayerLosPoly();
  }

  // fallow-ignore-next-line unused-class-member -- live: HarborViewport click path calls this (click-fire e2e); analyzer misses the session-indirected call
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
    shipOffset: { x: number; y: number } = { x: 0, y: 0 },
    living: readonly LivingView[] = [],
    nearestLivingId?: string | null
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    renderClutter(
      ctx,
      getWorldRooms(shipOffset).map((room) => ({
        id: room.id,
        x: room.x,
        y: room.y,
        w: room.width,
        h: room.height,
      })),
      timeSec
    );

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
    renderLivingFixtures(ctx, living, nearestLivingId, timeSec);
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

  /** Live exhaust at the three aft bells; idle trickle while docked. */
  private exhaustAcc = 0;
  private exhaustBell = 0;
  private emitBreachPlumes(state: WebGLRenderState, frameOffset: { x: number; y: number }): void {
    const breaches = state.breaches ?? [];
    if (breaches.length === 0) return;
    const flows = new Map(
      (state.breachFlows ?? []).map((flow) => [flow.portalId, flow.velocityMps])
    );
    const rooms = state.telemetry?.roomAtmospheres;
    for (const breach of breaches) {
      this.emitBreachPlume(breach, flows.get(breach.id) ?? 0, rooms, frameOffset);
    }
  }

  private emitBreachPlume(
    breach: BreachRenderModel,
    velocityMps: number,
    rooms: Record<string, RoomAtmosphereSummary> | undefined,
    frameOffset: { x: number; y: number }
  ): void {
    const speed = Math.abs(velocityMps);
    if (speed < 0.5) return;
    const pressure = rooms?.[bareRoomId(breach.roomA)]?.pressureKpa ?? 101.3;
    if (pressure < 1) return;
    const sign = velocityMps >= 0 ? 1 : -1;
    const intensity = Math.min(1, speed / 30) * Math.min(1, pressure / 101.3);
    const wx = breach.frameId === 'ship' ? frameOffset.x : 0;
    const wy = breach.frameId === 'ship' ? frameOffset.y : 0;
    this.particleSystem.emitBreachPlume(
      breach.cx + wx,
      breach.cy + wy,
      breach.nx * sign,
      breach.ny * sign,
      Math.abs(throatFlowToPx(velocityMps)),
      intensity,
      breach.areaM2
    );
  }

  private applyAmbientWind(state: WebGLRenderState): void {
    const roomId = state.currentRoomId;
    const wind = roomId === undefined ? undefined : state.telemetry?.roomAtmospheres?.[roomId];
    this.particleSystem.setAmbientWind(wind?.windX ?? 0, wind?.windY ?? 0);
  }

  private emitThrusterExhaust(
    offset: { x: number; y: number },
    underway: boolean,
    dt: number
  ): void {
    this.exhaustAcc += dt * (underway ? 90 : 8);
    while (this.exhaustAcc >= 1) {
      this.exhaustAcc -= 1;
      this.exhaustBell = (this.exhaustBell + 1) % THRUSTER_BELLS.length;
      const bell = THRUSTER_BELLS[this.exhaustBell];
      if (bell === undefined) return;
      this.particleSystem.emitExhaust(
        bell.x + offset.x,
        bell.y + offset.y,
        0,
        1,
        underway ? 1 : 0.3
      );
    }
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

  public render(state: WebGLRenderState, width: number, height: number): void {
    const zoom = state.zoom ?? 1.0;
    const matrix = createCameraMatrix(width, height, state.camera.x, state.camera.y, zoom);
    const timeSec = state.timeMs * 0.001;
    const dt = 0.016;

    const frameOffset = state.shipOffset ?? { x: 0, y: 0 };
    this.deckPass.shipOffset = frameOffset;

    const doors = this.updateFrameSimulation(state, frameOffset, dt);
    const { playerLoSPoly, welders } = this.renderLightmapPass(
      state,
      matrix,
      doors,
      frameOffset,
      timeSec,
      width,
      height
    );
    this.renderScenePass(
      state,
      matrix,
      doors,
      frameOffset,
      playerLoSPoly,
      timeSec,
      dt,
      width,
      height
    );
    this.renderEmissivePass(
      state,
      matrix,
      doors,
      frameOffset,
      welders,
      playerLoSPoly,
      timeSec,
      dt,
      width,
      height
    );
    this.renderHudPass(state, width, height, playerLoSPoly, timeSec);
  }

  /** Tick particles, frost, impacts, and exhaust ahead of the frame passes. */
  private updateFrameSimulation(
    state: WebGLRenderState,
    frameOffset: { x: number; y: number },
    dt: number
  ): DoorState[] {
    const doors = state.telemetry?.boarding?.doors || state.boarding?.doors || createInitialDoors();
    this.updateFrostIntensity(state, dt);
    this.ingestFrameEvents(state, frameOffset, doors);
    this.emitBreachPlumes(state, frameOffset);
    this.applyAmbientWind(state);
    this.particleSystem.update(dt);
    this.emitThrusterExhaust(frameOffset, state.shipUnderway === true, dt);
    return doors;
  }

  /** Ease the visor-frost overlay toward its target intensity. */
  private updateFrostIntensity(state: WebGLRenderState, dt: number): void {
    const playerAtmosphere = getPlayerAtmosphere(state);
    const targetFrost = computeTargetFrostIntensity(state, playerAtmosphere);
    const thawRate = targetFrost > this.currentFrostIntensity ? 0.85 : 0.45;
    this.currentFrostIntensity +=
      (targetFrost - this.currentFrostIntensity) * Math.min(1.0, dt * thawRate * 3.5);
    if (this.currentFrostIntensity < 0.005) {
      this.currentFrostIntensity = 0;
    }
  }

  /** Feed fresh impacts and muzzle flashes into the particle system. */
  private ingestFrameEvents(
    state: WebGLRenderState,
    frameOffset: { x: number; y: number },
    doors: DoorState[]
  ): void {
    const impactDoors = getWorldDoors(doors, frameOffset);
    if (state.impacts) {
      for (const imp of state.impacts) {
        if (
          isImpactVisible({ x: state.pawn.x, y: state.pawn.y }, { x: imp.x, y: imp.y }, impactDoors)
        ) {
          this.particleSystem.addDirectionalImpact({
            x: imp.x,
            y: imp.y,
            type: imp.type,
            angle: imp.angle ?? 0,
            weapon: imp.weapon ?? 'kinetic_carbine',
            energy: imp.energy ?? 0.5,
            breachAreaM2: imp.breachAreaM2 ?? 0.05,
            pressureKpa: imp.pressureKpa ?? 101.3,
            shipVelocity: imp.shipVelocity,
          });
        }
      }
    }
    if (state.muzzleFlashes) {
      for (const mf of state.muzzleFlashes) {
        this.particleSystem.addMuzzleFlash(mf);
      }
    }
  }

  /** PASS 1: lightmap FBO plus dynamic light uniforms. */
  private renderLightmapPass(
    state: WebGLRenderState,
    matrix: Float32Array,
    doors: DoorState[],
    frameOffset: { x: number; y: number },
    timeSec: number,
    width: number,
    height: number
  ): { playerLoSPoly: Point2D[]; welders: WelderArcSet } {
    const carveBreaches = (state.breaches ?? []).filter((breach) => breach.sizeClass === 'breach');
    const opaqueWalls = getWorldOpaqueWalls(HESPERIA_WALLS, doors, carveBreaches, frameOffset);
    const doorsHash = (state.boarding?.doors || [])
      .map((d) => `${d.id}:${d.isOpen ? '1' : '0'}`)
      .join('|');

    this.ensureFowHydrated();
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
      frameOffset.x,
      frameOffset.y
    );

    this.trackFowExploration(state.pawn, playerLoSPoly);
    const welders = state.welderArcs || (state.welderState ? [state.welderState] : []);
    this.lightingPass.updateLights(state.boarding?.projectiles, welders, playerLoSPoly);
    return { playerLoSPoly, welders };
  }

  /** PASS 2: ship base scene into the scene FBO. */
  private renderScenePass(
    state: WebGLRenderState,
    matrix: Float32Array,
    doors: DoorState[],
    frameOffset: { x: number; y: number },
    playerLoSPoly: Point2D[],
    timeSec: number,
    dt: number,
    width: number,
    height: number
  ): void {
    const gl = this.gl;
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
    this.deckPass.renderFurniture(this.flatProg, this.flatVAO, matrix, timeSec);
    this.deckPass.renderBulkheads(
      this.flatProg,
      this.flatVAO,
      matrix,
      state.breaches ?? [],
      timeSec,
      (state.decals ?? []).map((decal) => ({
        x: decal.x,
        y: decal.y,
        angle: decal.angle,
        radius: decal.radius,
        weapon: decal.weapon,
        cool: decal.cool,
      }))
    );
    this.deckPass.renderDockTube(this.flatProg, this.flatVAO, matrix, state.dock, timeSec);
    this.deckPass.renderDoors(this.flatProg, this.flatVAO, matrix, doors, dt, state.nearestDoorId);
    this.deckPass.renderCorridorLampFixtures(this.flatProg, this.flatVAO, matrix, timeSec);
    this.renderStations(
      matrix,
      state.nearestStation?.id,
      timeSec,
      frameOffset,
      state.livingFixtures ?? [],
      state.nearestLivingId ?? null
    );

    this.renderPawn(matrix, state.pawn, state.equippedWeapon, timeSec);
    this.renderVisibleRemotePawns(state, matrix, playerLoSPoly, timeSec);
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
  }

  /** PASS 3+4: lightmap composite plus emissive overlays. */
  private renderEmissivePass(
    state: WebGLRenderState,
    matrix: Float32Array,
    doors: DoorState[],
    frameOffset: { x: number; y: number },
    welders: WelderArcSet,
    playerLoSPoly: Point2D[],
    timeSec: number,
    dt: number,
    width: number,
    height: number
  ): void {
    const gl = this.gl;
    // PASS 3: Composite Scene with Lightmap
    this.lightingPass.applyLightmap(this.framebufferManager, width, height);

    // PASS 4: Emissive passes
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.renderProjectiles(matrix, state.boarding?.projectiles || [], timeSec, playerLoSPoly);
    this.renderVisibleWelderArcs(state, matrix, doors, frameOffset, welders);

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
    this.renderHypoxiaOverlay(state, timeSec);
  }

  /** Remote pawns culled to the player visibility polygon. */
  private renderVisibleRemotePawns(
    state: WebGLRenderState,
    matrix: Float32Array,
    playerLoSPoly: Point2D[],
    timeSec: number
  ): void {
    if (!state.remotePawns) return;
    for (const rp of state.remotePawns) {
      const inLoS =
        playerLoSPoly.length >= 3 && isPointInPolygon({ x: rp.x, y: rp.y }, playerLoSPoly);
      if (inLoS) {
        const rpWeapon: WeaponType = rp.isWelding ? 'arc_welder' : 'kinetic_carbine';
        this.renderPawn(matrix, rp, rpWeapon, timeSec);
      }
    }
  }

  /** Live welder arcs with line-of-sight from the player. */
  private renderVisibleWelderArcs(
    state: WebGLRenderState,
    matrix: Float32Array,
    doors: DoorState[],
    shipOffset: { x: number; y: number },
    welders: WelderArcSet
  ): void {
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
  }

  /** Hypoxia vignette while oxygen-starved or incapacitated. */
  private renderHypoxiaOverlay(state: WebGLRenderState, timeSec: number): void {
    if (!state.vitals) return;
    if (state.vitals.hypoxiaPercent > 20 || state.vitals.incapacitated?.isIncapacitated) {
      this.renderHypoxiaVignette(
        state.vitals.hypoxiaPercent,
        Boolean(state.vitals.incapacitated?.isIncapacitated),
        timeSec
      );
    }
  }

  /** PASS 5: curved visor plus tactical diegetic HUD. */
  private renderHudPass(
    state: WebGLRenderState,
    width: number,
    height: number,
    playerLoSPoly: Point2D[],
    timeSec: number
  ): void {
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
