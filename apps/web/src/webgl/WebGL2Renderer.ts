import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  StationFixture,
  WeaponType,
} from '@kybernetes/protocol';
import {
  createInitialDoors,
  HESPERIA_ROOMS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
} from '@kybernetes/sim-core';
import { createCameraMatrix, createProgram } from './glUtils';
import {
  DECK_FLOOR_FS,
  DECK_FLOOR_VS,
  FLAT_FS,
  FLAT_VS,
  PROJECTILE_FS,
  PROJECTILE_VS,
  STARFIELD_FS,
  STARFIELD_VS,
} from './shaders';

export interface WebGLRenderState {
  pawn: PawnState;
  nearestStation: StationFixture | null;
  boarding?: BoardingTacticsTelemetry;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  camera: { x: number; y: number };
  mouseWorld: { x: number; y: number };
  timeMs: number;
  impacts?: Array<{ x: number; y: number; type: 'kinetic' | 'laser' | 'welder' }>;
  chargingState?: { active: boolean; ratio: number; weaponType: WeaponType };
  welderState?: {
    active: boolean;
    originX: number;
    originY: number;
    facingAngle: number;
    range: number;
  };
}

interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  size: number;
  life: number;
  maxLife: number;
}

export class WebGL2Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private starProg: WebGLProgram;
  private deckProg: WebGLProgram;
  private projProg: WebGLProgram;

  private quadBuffer: WebGLBuffer;
  private dynamicBuffer: WebGLBuffer;

  private starVAO: WebGLVertexArrayObject;
  private deckVAO: WebGLVertexArrayObject;
  private flatVAO: WebGLVertexArrayObject;
  private projVAO: WebGLVertexArrayObject;
  private vignetteVAO: WebGLVertexArrayObject;

  private currentLights = new Float32Array(24);
  private currentLightColors = new Float32Array(18);
  private particles: ImpactParticle[] = [];

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

    this.flatProg = createProgram(gl, FLAT_VS, FLAT_FS);
    this.starProg = createProgram(gl, STARFIELD_VS, STARFIELD_FS);
    this.deckProg = createProgram(gl, DECK_FLOOR_VS, DECK_FLOOR_FS);
    this.projProg = createProgram(gl, PROJECTILE_VS, PROJECTILE_FS);

    // Fullscreen quad [-1, -1] to [1, 1]
    const fsQuad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, fsQuad, gl.STATIC_DRAW);

    this.dynamicBuffer = gl.createBuffer()!;

    // 1. Starfield VAO
    this.starVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.starVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const starPos = gl.getAttribLocation(this.starProg, 'a_position');
    gl.enableVertexAttribArray(starPos);
    gl.vertexAttribPointer(starPos, 2, gl.FLOAT, false, 0, 0);

    // 2. Deck VAO
    this.deckVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.deckVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const deckPos = gl.getAttribLocation(this.deckProg, 'a_position');
    gl.enableVertexAttribArray(deckPos);
    gl.vertexAttribPointer(deckPos, 2, gl.FLOAT, false, 0, 0);

    // 3. Flat VAO
    this.flatVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.flatVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const flatPos = gl.getAttribLocation(this.flatProg, 'a_position');
    gl.enableVertexAttribArray(flatPos);
    gl.vertexAttribPointer(flatPos, 2, gl.FLOAT, false, 0, 0);

    // 4. Projectile VAO
    this.projVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.projVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const pPos = gl.getAttribLocation(this.projProg, 'a_position');
    const pUv = gl.getAttribLocation(this.projProg, 'a_uv');
    gl.enableVertexAttribArray(pPos);
    gl.vertexAttribPointer(pPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(pUv);
    gl.vertexAttribPointer(pUv, 2, gl.FLOAT, false, 16, 8);

    // 5. Vignette VAO
    this.vignetteVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.vignetteVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const vPos = gl.getAttribLocation(this.flatProg, 'a_position');
    gl.enableVertexAttribArray(vPos);
    gl.vertexAttribPointer(vPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private addImpact(x: number, y: number, type: 'kinetic' | 'laser' | 'welder'): void {
    if (type === 'kinetic') {
      // Normal bullet impact: 10 metallic ricochet sparks spraying outward
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 160;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          r: 1.0,
          g: 0.65 + Math.random() * 0.35,
          b: 0.15,
          size: 2.5 + Math.random() * 2.0,
          life: 0.2 + Math.random() * 0.15,
          maxLife: 0.35,
        });
      }
    } else if (type === 'laser') {
      // Laser burst impact: bright cyan plasma dissipation
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 90;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          r: 0.0,
          g: 0.95,
          b: 1.0,
          size: 4.0,
          life: 0.16,
          maxLife: 0.16,
        });
      }
    } else {
      // Welder electric zap: erratic electrical sparks
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 90 + Math.random() * 150;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          r: Math.random() > 0.5 ? 0.0 : 0.75,
          g: 0.85,
          b: 1.0,
          size: 3.5,
          life: 0.15,
          maxLife: 0.15,
        });
      }
    }
  }

  // fallow-ignore-next-line complexity
  private updateLights(
    projectiles?: ProjectileState[],
    welder?: WebGLRenderState['welderState']
  ): void {
    this.currentLights.fill(0);
    this.currentLightColors.fill(0);

    let lightIdx = 0;

    // 1. Welder continuous electric arc lighting
    if (welder?.active && lightIdx < 6) {
      const arcMidX = welder.originX + Math.cos(welder.facingAngle) * 55;
      const arcMidY = welder.originY + Math.sin(welder.facingAngle) * 55;
      this.currentLights[lightIdx * 4 + 0] = arcMidX;
      this.currentLights[lightIdx * 4 + 1] = arcMidY;
      this.currentLights[lightIdx * 4 + 2] = 110.0;
      this.currentLights[lightIdx * 4 + 3] = 1.6;

      this.currentLightColors[lightIdx * 3 + 0] = 0.1;
      this.currentLightColors[lightIdx * 3 + 1] = 0.9;
      this.currentLightColors[lightIdx * 3 + 2] = 1.0;
      lightIdx++;
    }

    if (!projectiles) return;

    for (const p of projectiles) {
      if (lightIdx >= 6) break;
      // Bullets do not emit ambient glow/light; only energy bolts do
      if (p.weaponType === 'kinetic_carbine') continue;

      const isLaser = p.weaponType === 'pulse_laser' || p.color === '#00f0ff';
      const isWelder = p.weaponType === 'arc_welder';

      const charge = p.chargeRatio ?? 1.0;
      const radius = isLaser ? 70.0 + charge * 45.0 : isWelder ? 65.0 : 75.0;
      const intensity = isLaser ? 0.9 + charge * 1.0 : isWelder ? 1.0 : 0.9;

      this.currentLights[lightIdx * 4 + 0] = p.x;
      this.currentLights[lightIdx * 4 + 1] = p.y;
      this.currentLights[lightIdx * 4 + 2] = radius;
      this.currentLights[lightIdx * 4 + 3] = intensity;

      let r = 0.0;
      let g = 0.9;
      let b = 1.0;
      if (p.color === '#ff1744') {
        r = 1.0;
        g = 0.1;
        b = 0.25;
      } else if (p.color === '#00f0ff' || isLaser) {
        r = 0.0;
        g = 0.95;
        b = 1.0;
      } else if (isWelder) {
        r = 0.4;
        g = 0.7;
        b = 1.0;
      }
      this.currentLightColors[lightIdx * 3 + 0] = r;
      this.currentLightColors[lightIdx * 3 + 1] = g;
      this.currentLightColors[lightIdx * 3 + 2] = b;
      lightIdx++;
    }
  }

  // fallow-ignore-next-line complexity
  public render(state: WebGLRenderState, width: number, height: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.clearColor(0.015, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const matrix = createCameraMatrix(width, height, state.camera.x, state.camera.y);
    const timeSec = state.timeMs * 0.001;

    // Process queued impacts
    if (state.impacts) {
      for (const imp of state.impacts) {
        this.addImpact(imp.x, imp.y, imp.type);
      }
    }

    // Update dynamic lights from active projectiles & continuous welder
    this.updateLights(state.boarding?.projectiles, state.welderState);

    // 1. Procedural deep space parallax starfield
    this.renderStarfield(width, height, state.camera, timeSec);

    // 1.5. FTL-style outer ship armor hull & thrusters
    this.renderOuterHull(matrix, timeSec);

    // 2. FTL Grid Deck Floors with diagonal vacuum stripes and dynamic laser lighting
    this.renderDeckFloors(matrix, timeSec, state.boarding);

    // 3. Bulkhead walls & blast doors (with dynamic laser glow on walls)
    this.renderBulkheads(matrix);
    this.renderDoors(matrix, state.boarding?.doors || createInitialDoors());

    // 4. Stations & mechanical fixtures
    this.renderStations(matrix, state.nearestStation?.id);

    // 5. Pawns & Raiders
    this.renderPawn(matrix, state.pawn);
    this.renderIntruders(matrix, state.boarding?.intruders || []);
    this.renderSentries(matrix, state.boarding?.sentries || []);

    // 6. Projectiles with Additive Glow Shader
    this.renderProjectiles(matrix, state.boarding?.projectiles || [], timeSec);

    // 6.5. Continuous Welder Arc
    if (state.welderState?.active) {
      this.renderWelderArc(matrix, state.welderState);
    }

    // 6.6. Charging Energy Reticle (for Laser charge-up)
    if (state.chargingState?.active && state.chargingState.weaponType === 'pulse_laser') {
      this.renderChargingReticle(
        matrix,
        state.pawn,
        state.mouseWorld,
        state.chargingState,
        timeSec
      );
    }

    // 6.7. Impact spark particles
    this.renderParticles(matrix, 0.016);

    // 7. Tactical Laser Aiming Reticle
    this.renderAimingReticle(matrix, state.pawn, state.mouseWorld);

    // 8. Screen space alert flash
    if (state.alertLevel === 'red') {
      this.renderRedAlertVignette(timeSec);
    }
  }

  private renderStarfield(
    width: number,
    height: number,
    camera: { x: number; y: number },
    time: number
  ): void {
    const gl = this.gl;
    gl.useProgram(this.starProg);
    gl.bindVertexArray(this.starVAO);

    gl.uniform2f(gl.getUniformLocation(this.starProg, 'u_resolution'), width, height);
    gl.uniform2f(gl.getUniformLocation(this.starProg, 'u_camera'), camera.x, camera.y);
    gl.uniform1f(gl.getUniformLocation(this.starProg, 'u_time'), time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderDeckFloors(
    matrix: Float32Array,
    time: number,
    boarding?: BoardingTacticsTelemetry
  ): void {
    const gl = this.gl;
    gl.useProgram(this.deckProg);
    gl.bindVertexArray(this.deckVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.deckProg, 'u_matrix'), false, matrix);
    gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_time'), time);

    gl.uniform4fv(gl.getUniformLocation(this.deckProg, 'u_projLights'), this.currentLights);
    gl.uniform3fv(gl.getUniformLocation(this.deckProg, 'u_projColors'), this.currentLightColors);

    for (const room of HESPERIA_ROOMS) {
      const o2 = boarding?.roomO2?.[room.id] ?? 100;
      const isVented = Boolean(boarding?.ventedRooms?.includes(room.id) || o2 < 25);

      gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_isVacuum'), isVented ? 1.0 : 0.0);
      gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.93, 0.94, 0.96);

      const x1 = room.x;
      const y1 = room.y;
      const x2 = room.x + room.width;
      const y2 = room.y + room.height;

      const verts = new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
  }

  private bindFlatProgram(matrix: Float32Array): void {
    const gl = this.gl;
    gl.useProgram(this.flatProg);
    gl.bindVertexArray(this.flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.flatProg, 'u_matrix'), false, matrix);
    gl.uniform4fv(gl.getUniformLocation(this.flatProg, 'u_projLights'), this.currentLights);
    gl.uniform3fv(gl.getUniformLocation(this.flatProg, 'u_projColors'), this.currentLightColors);
  }

  private bufferAndDraw(verts: Float32Array, mode?: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.drawArrays(mode ?? gl.TRIANGLES, 0, verts.length / 2);
  }

  private renderBulkheads(matrix: Float32Array): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.12, 0.16, 0.22, 1.0);

    const lines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      this.addThickSegment(lines, wall.x1, wall.y1, wall.x2, wall.y2, 5);
    }
    this.bufferAndDraw(new Float32Array(lines));
    gl.bindVertexArray(null);
  }

  private renderOuterHull(matrix: Float32Array, time: number): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    // Dark armor hull base enclosing the ship
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    this.drawQuad(380, 170, 730, 600);
    this.drawQuad(200, 270, 200, 400);

    // Armor perimeter outline
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.2, 0.25, 0.35, 1.0);
    const hullLines: number[] = [];
    this.addThickSegment(hullLines, 200, 270, 380, 170, 4);
    this.addThickSegment(hullLines, 380, 170, 1110, 170, 4);
    this.addThickSegment(hullLines, 1110, 170, 1110, 770, 4);
    this.addThickSegment(hullLines, 1110, 770, 380, 770, 4);
    this.addThickSegment(hullLines, 380, 770, 200, 670, 4);
    this.addThickSegment(hullLines, 200, 670, 200, 270, 4);
    this.bufferAndDraw(new Float32Array(hullLines));

    // Animated rear thruster plasma plumes
    const flicker = 0.8 + 0.2 * Math.sin(time * 15.0);
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.85, 1.0, flicker);
    this.drawQuad(160, 330, 40, 18);
    this.drawQuad(160, 410, 40, 18);
    this.drawQuad(160, 490, 40, 18);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderOpenDoor(x: number, y: number, w: number, h: number, isHoriz: boolean): void {
    const gl = this.gl;
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.13, 0.77, 0.36, 1.0);
    this.drawQuad(isHoriz ? x : x + 2, isHoriz ? y + 2 : y, 6, 6);
    this.drawQuad(isHoriz ? x + w - 6 : x + 2, isHoriz ? y + 2 : y + h - 6, 6, 6);
  }

  // fallow-ignore-next-line complexity
  private renderClosedDoor(
    x: number,
    y: number,
    w: number,
    h: number,
    isHoriz: boolean,
    mx: number,
    my: number
  ): void {
    const gl = this.gl;
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.92, 0.7, 0.03, 1.0);
    this.drawQuad(x, y, w, h);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.1, 0.1, 0.12, 1.0);
    const count = isHoriz ? Math.floor(w / 14) : Math.floor(h / 14);
    for (let i = 0; i < count; i += 2) {
      this.drawQuad(
        isHoriz ? x + i * 14 : x,
        isHoriz ? y : y + i * 14,
        isHoriz ? 7 : w,
        isHoriz ? h : 7
      );
    }

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.15, 0.18, 0.24, 1.0);
    this.drawQuad(mx - 14, my - 5, 28, 10);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.94, 0.27, 0.27, 1.0);
    this.drawQuad(mx - 6, my - 3, 12, 6);
  }

  // fallow-ignore-next-line complexity
  private renderDoors(matrix: Float32Array, doors: DoorState[]): void {
    this.bindFlatProgram(matrix);
    for (const door of doors) {
      const isHoriz = Math.abs(door.y2 - door.y1) < Math.abs(door.x2 - door.x1);
      const minX = Math.min(door.x1, door.x2);
      const minY = Math.min(door.y1, door.y2);
      const w = isHoriz ? Math.abs(door.x2 - door.x1) : 12;
      const h = isHoriz ? 12 : Math.abs(door.y2 - door.y1);
      const x = isHoriz ? minX : door.x1 - 6;
      const y = isHoriz ? door.y1 - 6 : minY;

      if (door.isOpen) {
        this.renderOpenDoor(x, y, w, h, isHoriz);
      } else {
        const mx = (door.x1 + door.x2) / 2;
        const my = (door.y1 + door.y2) / 2;
        this.renderClosedDoor(x, y, w, h, isHoriz, mx, my);
      }
    }
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderStations(matrix: Float32Array, nearestId?: string): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    for (const st of HESPERIA_STATIONS) {
      const isNear = st.id === nearestId;
      gl.uniform4f(
        gl.getUniformLocation(this.flatProg, 'u_color'),
        isNear ? 0.0 : 0.15,
        isNear ? 0.9 : 0.45,
        isNear ? 1.0 : 0.65,
        1.0
      );
      this.drawCircle(st.x, st.y, st.radius, 16);
    }
    gl.bindVertexArray(null);
  }

  private renderPawn(matrix: Float32Array, pawn: PawnState): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    // Body
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 0.69, 0.0, 1.0);
    this.drawCircle(pawn.x, pawn.y, 14, 16);

    // Visor
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.9, 1.0, 1.0);
    const hx = pawn.x + Math.cos(pawn.facingAngle) * 9;
    const hy = pawn.y + Math.sin(pawn.facingAngle) * 9;
    this.drawCircle(hx, hy, 4, 10);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderIntruders(
    matrix: Float32Array,
    intruders: NonNullable<BoardingTacticsTelemetry['intruders']>
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    for (const intruder of intruders) {
      if (intruder.state === 'neutralized') continue;

      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.72, 0.11, 0.11, 1.0);
      this.drawCircle(intruder.x, intruder.y, 13, 16);

      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 0.1, 0.1, 1.0);
      const vx = intruder.x + Math.cos(intruder.facingAngle) * 8;
      const vy = intruder.y + Math.sin(intruder.facingAngle) * 8;
      this.drawCircle(vx, vy, 3.5, 8);

      const hpPct = Math.max(0, intruder.health / (intruder.maxHealth || 100));
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.1, 0.1, 0.1, 0.8);
      this.drawQuad(intruder.x - 14, intruder.y - 20, 28, 4);

      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 0.2, 0.2, 1.0);
      this.drawQuad(intruder.x - 14, intruder.y - 20, 28 * hpPct, 4);
    }
    gl.bindVertexArray(null);
  }

  private renderSentries(
    matrix: Float32Array,
    sentries: NonNullable<BoardingTacticsTelemetry['sentries']>
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    for (const sentry of sentries) {
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.2, 0.25, 0.35, 1.0);
      this.drawCircle(sentry.x, sentry.y, 10, 12);

      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.9, 1.0, 1.0);
      const bx = sentry.x + Math.cos(sentry.facingAngle) * 14;
      const by = sentry.y + Math.sin(sentry.facingAngle) * 14;
      this.drawQuad(bx - 2, by - 2, 4, 4);
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderProjectiles(
    matrix: Float32Array,
    projectiles: ProjectileState[],
    time: number
  ): void {
    const gl = this.gl;
    gl.useProgram(this.projProg);
    gl.bindVertexArray(this.projVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.projProg, 'u_matrix'), false, matrix);
    gl.uniform1f(gl.getUniformLocation(this.projProg, 'u_time'), time);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    for (const proj of projectiles) {
      let r = 0.0;
      let g = 0.95;
      let b = 1.0;
      let style = 1;
      let beamLen = 22;
      let halfW = 6.5;

      if (proj.weaponType === 'kinetic_carbine') {
        style = 0; // flat tracer trail (no glow)
        r = 1.0;
        g = 0.82;
        b = 0.25;
        beamLen = 28;
        halfW = 2.0;
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
    welder: NonNullable<WebGLRenderState['welderState']>
  ): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const startX = welder.originX + Math.cos(welder.facingAngle) * 14;
    const startY = welder.originY + Math.sin(welder.facingAngle) * 14;
    const endX = startX + Math.cos(welder.facingAngle) * welder.range;
    const endY = startY + Math.sin(welder.facingAngle) * welder.range;

    const segments = 10;
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
      const jitter = i === segments ? 0 : (Math.random() - 0.5) * 22 * Math.sin(prog * Math.PI);
      const nextX = baseNextX + perpX * jitter;
      const nextY = baseNextY + perpY * jitter;

      this.addThickSegment(mainVerts, curX, curY, nextX, nextY, 3.2);
      curX = nextX;
      curY = nextY;
    }

    // Outer cyan electric halo
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.9, 1.0, 0.85);
    this.bufferAndDraw(new Float32Array(mainVerts));

    // Inner white-hot core
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.95);
    this.bufferAndDraw(new Float32Array(mainVerts));

    this.addImpact(curX, curY, 'welder');

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

    // Glowing energy orb at pawn muzzle
    const mx = pawn.x + Math.cos(pawn.facingAngle) * 16;
    const my = pawn.y + Math.sin(pawn.facingAngle) * 16;
    const orbRadius = 3.0 + charging.ratio * 8.0;
    const pulse = 0.85 + 0.15 * Math.sin(time * 30.0);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.95, 1.0, 0.85 * pulse);
    this.drawCircle(mx, my, orbRadius, 16);

    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.95);
    this.drawCircle(mx, my, orbRadius * 0.45, 12);

    // Circular radial charge meter around crosshair
    const arcSegs: number[] = [];
    const steps = Math.max(4, Math.floor(charging.ratio * 24));
    for (let i = 0; i < steps; i++) {
      const a1 = (i / 24) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / 24) * Math.PI * 2 - Math.PI / 2;
      this.addThickSegment(
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

  // fallow-ignore-next-line complexity
  private renderParticles(matrix: Float32Array, dt: number): void {
    if (this.particles.length === 0) return;
    const gl = this.gl;
    this.bindFlatProgram(matrix);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const alpha = p.life / p.maxLife;
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), p.r, p.g, p.b, alpha);
      this.drawQuad(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
    this.addThickSegment(lineVerts, pawn.x, pawn.y, mouse.x, mouse.y, 1.2);

    this.addThickSegment(lineVerts, mouse.x - 8, mouse.y, mouse.x - 3, mouse.y, 1.5);
    this.addThickSegment(lineVerts, mouse.x + 3, mouse.y, mouse.x + 8, mouse.y, 1.5);
    this.addThickSegment(lineVerts, mouse.x - 8, mouse.y, mouse.x - 3, mouse.y, 1.5);
    this.addThickSegment(lineVerts, mouse.x, mouse.y + 3, mouse.x, mouse.y + 8, 1.5);

    this.bufferAndDraw(new Float32Array(lineVerts));
    gl.bindVertexArray(null);
  }

  private renderRedAlertVignette(time: number): void {
    const gl = this.gl;
    gl.useProgram(this.flatProg);
    gl.bindVertexArray(this.vignetteVAO);

    const idMat = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.flatProg, 'u_matrix'), false, idMat);

    const pulse = 0.12 + 0.08 * Math.sin(time * 5.0);
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 0.05, 0.05, pulse);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
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

  private addThickSegment(
    verts: number[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = (-dy / len) * (thickness / 2);
    const ny = (dx / len) * (thickness / 2);

    verts.push(x1 + nx, y1 + ny);
    verts.push(x2 + nx, y2 + ny);
    verts.push(x1 - nx, y1 - ny);

    verts.push(x1 - nx, y1 - ny);
    verts.push(x2 + nx, y2 + ny);
    verts.push(x2 - nx, y2 - ny);
  }
}
