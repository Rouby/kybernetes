import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  WallSegment,
  WeaponType,
} from '@kybernetes/protocol';
import {
  computeVisibilityPolygon,
  createInitialDoors,
  getOpaqueWallSegments,
  HESPERIA_LIGHTS,
  HESPERIA_ROOMS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  isPointInPolygon,
  type Point2D,
  ROOM_AMBIENTS,
} from '@kybernetes/sim-core';
import { createCameraMatrix, createProgram } from './glUtils';
import { type HudDrawState, type HudHitTester, HudRenderer } from './hud';
import { renderRaiderIntruder, renderSentryTurret, renderTacticalPawn } from './PawnModels';
import {
  type RenderContext,
  renderArmoryLocker,
  renderBridgeHelm,
  renderCargoWinch,
  renderCrewBunk,
  renderDispenser,
  renderGalleyPrep,
  renderHydroScrubber,
  renderReactorConsole,
  renderStationInteractionAura,
} from './StationModels';
import {
  DECK_FLOOR_FS,
  DECK_FLOOR_VS,
  FLAT_FS,
  FLAT_VS,
  FOW_AMBIENT_FS,
  FOW_AMBIENT_VS,
  FOW_STAMP_FS,
  FOW_STAMP_VS,
  LIGHT_FAN_FS,
  LIGHT_FAN_VS,
  LIGHTMAP_APPLY_FS,
  LIGHTMAP_APPLY_VS,
  PROJECTILE_FS,
  PROJECTILE_VS,
  STARFIELD_FS,
  STARFIELD_VS,
} from './shaders';

export interface WebGLRenderState extends HudDrawState {
  impacts?: Array<{ x: number; y: number; type: 'kinetic' | 'laser' | 'welder' }>;
  muzzleFlashes?: Array<{ x: number; y: number; weaponType: WeaponType }>;
  zoom?: number;
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

function initFboTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export class WebGL2Renderer {
  private gl: WebGL2RenderingContext;
  private flatProg: WebGLProgram;
  private starProg: WebGLProgram;
  private deckProg: WebGLProgram;
  private projProg: WebGLProgram;
  private lightFanProg: WebGLProgram;
  private lightmapApplyProg: WebGLProgram;
  private fowStampProg: WebGLProgram;
  private fowAmbientProg: WebGLProgram;

  private quadBuffer: WebGLBuffer;
  private dynamicBuffer: WebGLBuffer;

  private starVAO: WebGLVertexArrayObject;
  private deckVAO: WebGLVertexArrayObject;
  private flatVAO: WebGLVertexArrayObject;
  private projVAO: WebGLVertexArrayObject;
  private vignetteVAO: WebGLVertexArrayObject;
  private lightFanVAO: WebGLVertexArrayObject;
  private lightmapApplyVAO: WebGLVertexArrayObject;
  private fowStampVAO: WebGLVertexArrayObject;
  private fowAmbientVAO: WebGLVertexArrayObject;

  private lightFBO: WebGLFramebuffer | null = null;
  private lightTexture: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  private sceneFBO: WebGLFramebuffer | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private sceneWidth = 0;
  private sceneHeight = 0;

  private fowFBO: WebGLFramebuffer | null = null;
  private fowTexture: WebGLTexture | null = null;
  private readonly fowWidth = 1200;
  private readonly fowHeight = 800;

  private cachedStaticLights = new Map<string, Point2D[]>();
  private lastDoorsHash = '';
  private lastPlayerLosPoly: Point2D[] = [];

  private currentLights = new Float32Array(24);
  private currentLightColors = new Float32Array(18);
  private particles: ImpactParticle[] = [];
  private hudRenderer: HudRenderer;

  private doorOpenRatios = new Map<string, number>();
  private dustMotes: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
  }> = [];
  private muzzleFlashes: Array<{
    x: number;
    y: number;
    weaponType: WeaponType;
    life: number;
    maxLife: number;
  }> = [];
  private lastWeaponRecoil = 0;

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

    for (let i = 0; i < 40; i++) {
      this.dustMotes.push({
        x: 60 + Math.random() * 1080,
        y: 60 + Math.random() * 680,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        size: 1.2 + Math.random() * 1.5,
        alpha: 0.12 + Math.random() * 0.22,
      });
    }

    this.flatProg = createProgram(gl, FLAT_VS, FLAT_FS);
    this.starProg = createProgram(gl, STARFIELD_VS, STARFIELD_FS);
    this.deckProg = createProgram(gl, DECK_FLOOR_VS, DECK_FLOOR_FS);
    this.projProg = createProgram(gl, PROJECTILE_VS, PROJECTILE_FS);
    this.lightFanProg = createProgram(gl, LIGHT_FAN_VS, LIGHT_FAN_FS);
    this.lightmapApplyProg = createProgram(gl, LIGHTMAP_APPLY_VS, LIGHTMAP_APPLY_FS);
    this.fowStampProg = createProgram(gl, FOW_STAMP_VS, FOW_STAMP_FS);
    this.fowAmbientProg = createProgram(gl, FOW_AMBIENT_VS, FOW_AMBIENT_FS);

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

    // 6. Light Fan VAO
    this.lightFanVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightFanVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const fanPos = gl.getAttribLocation(this.lightFanProg, 'a_position');
    gl.enableVertexAttribArray(fanPos);
    gl.vertexAttribPointer(fanPos, 2, gl.FLOAT, false, 0, 0);

    // 7. Lightmap Apply VAO
    this.lightmapApplyVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightmapApplyVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const applyPos = gl.getAttribLocation(this.lightmapApplyProg, 'a_position');
    gl.enableVertexAttribArray(applyPos);
    gl.vertexAttribPointer(applyPos, 2, gl.FLOAT, false, 0, 0);

    // 8. FoW Stamp VAO
    this.fowStampVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.fowStampVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const stampPos = gl.getAttribLocation(this.fowStampProg, 'a_position');
    gl.enableVertexAttribArray(stampPos);
    gl.vertexAttribPointer(stampPos, 2, gl.FLOAT, false, 0, 0);

    // 9. FoW Ambient VAO
    this.fowAmbientVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.fowAmbientVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const fowAmbPos = gl.getAttribLocation(this.fowAmbientProg, 'a_position');
    gl.enableVertexAttribArray(fowAmbPos);
    gl.vertexAttribPointer(fowAmbPos, 2, gl.FLOAT, false, 0, 0);

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
    welders?: Array<{
      active: boolean;
      originX: number;
      originY: number;
      facingAngle: number;
      range?: number;
    }>
  ): void {
    this.currentLights.fill(0);
    this.currentLightColors.fill(0);

    let lightIdx = 0;

    // 1. Welder continuous electric arc lighting
    if (welders) {
      for (const welder of welders) {
        if (welder.active && lightIdx < 6) {
          const arcMidX = welder.originX + Math.cos(welder.facingAngle) * 24;
          const arcMidY = welder.originY + Math.sin(welder.facingAngle) * 24;
          this.currentLights[lightIdx * 4 + 0] = arcMidX;
          this.currentLights[lightIdx * 4 + 1] = arcMidY;
          this.currentLights[lightIdx * 4 + 2] = 60.0;
          this.currentLights[lightIdx * 4 + 3] = 1.6;

          this.currentLightColors[lightIdx * 3 + 0] = 0.1;
          this.currentLightColors[lightIdx * 3 + 1] = 0.9;
          this.currentLightColors[lightIdx * 3 + 2] = 1.0;
          lightIdx++;
        }
      }
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
  private ensureLightFBO(width: number, height: number): void {
    const gl = this.gl;
    if (this.fboWidth === width && this.fboHeight === height && this.lightFBO) {
      return;
    }
    this.fboWidth = width;
    this.fboHeight = height;

    if (!this.lightTexture) {
      this.lightTexture = gl.createTexture();
    }
    initFboTexture(gl, this.lightTexture, width, height);

    if (!this.lightFBO) {
      this.lightFBO = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.lightTexture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fallow-ignore-next-line complexity
  private ensureSceneFBO(width: number, height: number): void {
    const gl = this.gl;
    if (this.sceneWidth === width && this.sceneHeight === height && this.sceneFBO) {
      return;
    }
    this.sceneWidth = width;
    this.sceneHeight = height;

    if (!this.sceneTexture) {
      this.sceneTexture = gl.createTexture();
    }
    initFboTexture(gl, this.sceneTexture, width, height);

    if (!this.sceneFBO) {
      this.sceneFBO = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneTexture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private ensureFowFBO(): void {
    if (this.fowFBO && this.fowTexture) return;
    const gl = this.gl;
    this.fowTexture = gl.createTexture();
    initFboTexture(gl, this.fowTexture, this.fowWidth, this.fowHeight);

    this.fowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fowFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.fowTexture,
      0
    );

    gl.viewport(0, 0, this.fowWidth, this.fowHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fallow-ignore-next-line unused-class-member
  public resetFogOfWar(): void {
    if (!this.fowFBO) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fowFBO);
    gl.viewport(0, 0, this.fowWidth, this.fowHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fallow-ignore-next-line unused-class-member
  public getLastLoSPolygon(): Point2D[] {
    return this.lastPlayerLosPoly;
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
      addThickSegment: this.addThickSegment.bind(this),
      bufferAndDraw: this.bufferAndDraw.bind(this),
    };
  }

  // fallow-ignore-next-line complexity
  private buildPolygonFanVertices(origin: { x: number; y: number }, poly: Point2D[]): Float32Array {
    const hasOrigin =
      poly.length > 0 &&
      Math.abs(poly[0].x - origin.x) < 0.01 &&
      Math.abs(poly[0].y - origin.y) < 0.01;

    if (hasOrigin) {
      const count = Math.max(0, poly.length - 2);
      const verts = new Float32Array(count * 6);
      let vIdx = 0;
      for (let i = 1; i < poly.length - 1; i++) {
        verts[vIdx++] = origin.x;
        verts[vIdx++] = origin.y;
        verts[vIdx++] = poly[i].x;
        verts[vIdx++] = poly[i].y;
        verts[vIdx++] = poly[i + 1].x;
        verts[vIdx++] = poly[i + 1].y;
      }
      return verts;
    }

    const verts = new Float32Array(poly.length * 6);
    let vIdx = 0;
    for (let i = 0; i < poly.length; i++) {
      const next = (i + 1) % poly.length;
      verts[vIdx++] = origin.x;
      verts[vIdx++] = origin.y;
      verts[vIdx++] = poly[i].x;
      verts[vIdx++] = poly[i].y;
      verts[vIdx++] = poly[next].x;
      verts[vIdx++] = poly[next].y;
    }
    return verts;
  }

  // fallow-ignore-next-line complexity
  private stampFowExploration(poly: Point2D[], pawnPos: { x: number; y: number }): void {
    const gl = this.gl;
    this.ensureFowFBO();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fowFBO);
    gl.viewport(0, 0, this.fowWidth, this.fowHeight);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.fowStampProg);
    gl.bindVertexArray(this.fowStampVAO);

    const stampMatrix = new Float32Array([
      2.0 / this.fowWidth,
      0,
      0,
      0,
      2.0 / this.fowHeight,
      0,
      -1.0,
      -1.0,
      1,
    ]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.fowStampProg, 'u_matrix'), false, stampMatrix);

    if (poly.length >= 3) {
      const verts = this.buildPolygonFanVertices(pawnPos, poly);
      this.bufferAndDraw(verts);
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fallow-ignore-next-line complexity
  private drawLightPolygonFan(
    matrix: Float32Array,
    light: {
      x: number;
      y: number;
      radius: number;
      intensity: number;
      color: [number, number, number];
      isDirectional?: boolean;
      facingAngle?: number;
      fov?: number;
      ambientRadius?: number;
    },
    poly: Point2D[]
  ): void {
    if (poly.length < 3) return;
    const gl = this.gl;
    const verts = this.buildPolygonFanVertices({ x: light.x, y: light.y }, poly);

    gl.useProgram(this.lightFanProg);
    gl.bindVertexArray(this.lightFanVAO);

    gl.uniformMatrix3fv(gl.getUniformLocation(this.lightFanProg, 'u_matrix'), false, matrix);
    gl.uniform2f(gl.getUniformLocation(this.lightFanProg, 'u_lightOrigin'), light.x, light.y);
    gl.uniform3f(
      gl.getUniformLocation(this.lightFanProg, 'u_lightColor'),
      light.color[0],
      light.color[1],
      light.color[2]
    );
    gl.uniform1f(gl.getUniformLocation(this.lightFanProg, 'u_intensity'), light.intensity);
    gl.uniform1f(gl.getUniformLocation(this.lightFanProg, 'u_radius'), light.radius);
    gl.uniform1f(
      gl.getUniformLocation(this.lightFanProg, 'u_isDirectional'),
      light.isDirectional ? 1.0 : 0.0
    );
    gl.uniform1f(
      gl.getUniformLocation(this.lightFanProg, 'u_facingAngle'),
      light.facingAngle ?? 0.0
    );
    gl.uniform1f(gl.getUniformLocation(this.lightFanProg, 'u_fov'), light.fov ?? Math.PI / 2);
    gl.uniform1f(
      gl.getUniformLocation(this.lightFanProg, 'u_ambientRadius'),
      light.ambientRadius ?? 75.0
    );

    this.bufferAndDraw(verts);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderShipAmbientRooms(matrix: Float32Array): void {
    const gl = this.gl;
    this.ensureFowFBO();
    gl.useProgram(this.fowAmbientProg);
    gl.bindVertexArray(this.fowAmbientVAO);

    gl.uniformMatrix3fv(gl.getUniformLocation(this.fowAmbientProg, 'u_matrix'), false, matrix);
    gl.uniform2f(
      gl.getUniformLocation(this.fowAmbientProg, 'u_worldBounds'),
      this.fowWidth,
      this.fowHeight
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fowTexture);
    gl.uniform1i(gl.getUniformLocation(this.fowAmbientProg, 'u_fowTexture'), 0);

    for (const room of HESPERIA_ROOMS) {
      const amb = ROOM_AMBIENTS[room.id] ?? [0.2, 0.2, 0.2];
      gl.uniform3f(
        gl.getUniformLocation(this.fowAmbientProg, 'u_roomAmbient'),
        amb[0],
        amb[1],
        amb[2]
      );
      this.drawQuad(room.x, room.y, room.width, room.height);
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderStaticShipLights(
    matrix: Float32Array,
    timeSec: number,
    opaqueWalls: WallSegment[]
  ): void {
    for (const light of HESPERIA_LIGHTS) {
      let intensity = light.intensity;
      if (light.flickerSpeed && light.flickerAmount) {
        intensity += Math.sin(timeSec * light.flickerSpeed) * light.flickerAmount;
      }

      let poly = this.cachedStaticLights.get(light.id);
      if (!poly) {
        poly = computeVisibilityPolygon({ x: light.x, y: light.y }, light.radius, opaqueWalls, 36);
        this.cachedStaticLights.set(light.id, poly);
      }

      this.drawLightPolygonFan(
        matrix,
        {
          x: light.x,
          y: light.y,
          radius: light.radius,
          intensity,
          color: light.color,
        },
        poly
      );
    }
  }

  // fallow-ignore-next-line complexity
  private renderDynamicLightSources(
    matrix: Float32Array,
    state: WebGLRenderState,
    opaqueWalls: WallSegment[],
    timeSec: number
  ): void {
    if (state.boarding?.projectiles) {
      for (const p of state.boarding.projectiles) {
        if (p.weaponType === 'kinetic_carbine') continue;
        const isLaser = p.weaponType === 'pulse_laser';
        const color: [number, number, number] =
          p.color === '#ff1744' ? [1.0, 0.15, 0.25] : isLaser ? [0.1, 0.95, 1.0] : [0.4, 0.75, 1.0];
        const radius = isLaser ? 110 + (p.chargeRatio ?? 1.0) * 40 : 100;
        const poly = computeVisibilityPolygon({ x: p.x, y: p.y }, radius, opaqueWalls, 32);
        this.drawLightPolygonFan(matrix, { x: p.x, y: p.y, radius, intensity: 0.9, color }, poly);
      }
    }

    // Active weapon muzzle flash bursts
    for (const mf of this.muzzleFlashes) {
      const isLaser = mf.weaponType === 'pulse_laser';
      const radius = isLaser ? 140 : 105;
      const color: [number, number, number] = isLaser ? [0.2, 0.95, 1.0] : [1.0, 0.85, 0.4];
      const intensity = (mf.life / mf.maxLife) * 1.8;
      const poly = computeVisibilityPolygon({ x: mf.x, y: mf.y }, radius, opaqueWalls, 28);
      this.drawLightPolygonFan(matrix, { x: mf.x, y: mf.y, radius, intensity, color }, poly);
    }

    // Engineering Reactor Core atmospheric ambient light breathing
    const reactorPulse = 0.75 + 0.25 * Math.sin(timeSec * 4.0);
    const reactorPoly = computeVisibilityPolygon({ x: 970, y: 570 }, 140, opaqueWalls, 28);
    this.drawLightPolygonFan(
      matrix,
      { x: 970, y: 570, radius: 140, intensity: 0.6 * reactorPulse, color: [1.0, 0.55, 0.1] },
      reactorPoly
    );

    if (state.welderState?.active) {
      const arcX = state.welderState.originX + Math.cos(state.welderState.facingAngle) * 24;
      const arcY = state.welderState.originY + Math.sin(state.welderState.facingAngle) * 24;
      const poly = computeVisibilityPolygon({ x: arcX, y: arcY }, 90, opaqueWalls, 32);
      this.drawLightPolygonFan(
        matrix,
        { x: arcX, y: arcY, radius: 90, intensity: 1.2, color: [0.2, 0.85, 1.0] },
        poly
      );
    }
  }

  // fallow-ignore-next-line complexity
  private renderLightmap(
    matrix: Float32Array,
    state: WebGLRenderState,
    timeSec: number,
    opaqueWalls: WallSegment[],
    width: number,
    height: number
  ): void {
    const gl = this.gl;
    this.ensureLightFBO(width, height);

    // 1. Invalidate static light cache if doors changed
    const doorsHash = (state.boarding?.doors || [])
      .map((d) => `${d.id}:${d.isOpen ? '1' : '0'}`)
      .join('|');
    if (doorsHash !== this.lastDoorsHash) {
      this.cachedStaticLights.clear();
      this.lastDoorsHash = doorsHash;
    }

    // 2. Compute Player active Line of Sight polygon & stamp into Fog of War
    const playerFov = (160 * Math.PI) / 180;
    const playerLoSRange = 540;
    const perceptionRadius = 24;
    const playerLoSPoly = computeVisibilityPolygon(
      { x: state.pawn.x, y: state.pawn.y },
      playerLoSRange,
      opaqueWalls,
      36,
      { facingAngle: state.pawn.facingAngle, fov: playerFov, perceptionRadius }
    );
    this.lastPlayerLosPoly = playerLoSPoly;
    this.stampFowExploration(playerLoSPoly, state.pawn);

    // 3. Render Lightmap FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFBO);
    gl.viewport(0, 0, width, height);

    // Deep space remains fully illuminated (1.0)
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ZERO);

    // 4. Baseline ambient darkness inside rooms modulated by Fog of War
    this.renderShipAmbientRooms(matrix);

    // 5. Additive blending for light sources
    gl.blendFunc(gl.ONE, gl.ONE);

    // Static ship fixtures (corridors and rooms)
    this.renderStaticShipLights(matrix, timeSec, opaqueWalls);

    // Player Flashlight (160 degree cone, 540 range, 24px personal perception radius)
    this.drawLightPolygonFan(
      matrix,
      {
        x: state.pawn.x,
        y: state.pawn.y,
        radius: playerLoSRange,
        intensity: 1.5,
        color: [1.0, 0.98, 0.95],
        isDirectional: true,
        facingAngle: state.pawn.facingAngle,
        fov: playerFov,
        ambientRadius: perceptionRadius,
      },
      playerLoSPoly
    );

    // Projectiles and continuous electric arc
    this.renderDynamicLightSources(matrix, state, opaqueWalls, timeSec);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
  }

  private applyLightmap(width: number, height: number): void {
    if (!this.lightTexture || !this.sceneTexture) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.lightmapApplyProg);
    gl.bindVertexArray(this.lightmapApplyVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform1i(gl.getUniformLocation(this.lightmapApplyProg, 'u_sceneTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
    gl.uniform1i(gl.getUniformLocation(this.lightmapApplyProg, 'u_lightTexture'), 1);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderCorridorLampFixtures(matrix: Float32Array, time: number): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    const corridorLights = HESPERIA_LIGHTS.filter((l) => l.room === 'corridor');
    for (const cl of corridorLights) {
      const flicker = cl.flickerSpeed ? 0.95 + 0.05 * Math.sin(time * cl.flickerSpeed) : 1.0;

      // Dark mounting housing
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.12, 0.15, 0.2, 1.0);
      this.drawQuad(cl.x - 11, cl.y - 5, 22, 10);

      // Glowing inner lens
      gl.uniform4f(
        gl.getUniformLocation(this.flatProg, 'u_color'),
        cl.color[0] * flicker,
        cl.color[1] * flicker,
        cl.color[2] * flicker,
        1.0
      );
      this.drawQuad(cl.x - 7, cl.y - 2.5, 14, 5);

      // White-hot center diode
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 1.0, 1.0, 1.0, 0.9 * flicker);
      this.drawQuad(cl.x - 2, cl.y - 1, 4, 2);
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public render(state: WebGLRenderState, width: number, height: number): void {
    const gl = this.gl;
    const zoom = state.zoom ?? 1.0;
    const matrix = createCameraMatrix(width, height, state.camera.x, state.camera.y, zoom);
    const timeSec = state.timeMs * 0.001;
    const dt = 0.016;

    // Process queued impacts
    if (state.impacts) {
      for (const imp of state.impacts) {
        this.addImpact(imp.x, imp.y, imp.type);
      }
    }

    // Process queued muzzle flashes & weapon recoil
    if (state.muzzleFlashes) {
      for (const mf of state.muzzleFlashes) {
        this.muzzleFlashes.push({ ...mf, life: 0.05, maxLife: 0.05 });
        this.lastWeaponRecoil = mf.weaponType === 'kinetic_carbine' ? 2.5 : 4.0;
      }
    }
    this.lastWeaponRecoil = Math.max(0, this.lastWeaponRecoil - dt * 20.0);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) {
        this.muzzleFlashes.splice(i, 1);
      }
    }

    const welders = state.welderArcs || (state.welderState ? [state.welderState] : []);

    // Update dynamic lights from active projectiles & continuous welder
    this.updateLights(state.boarding?.projectiles, welders);

    const doors = state.boarding?.doors || createInitialDoors();
    const opaqueWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors);

    // PASS 1: Render Lightmap FBO (Shadow Casting & Multi-light Accumulation)
    this.renderLightmap(matrix, state, timeSec, opaqueWalls, width, height);

    // PASS 2: Render Ship Base Scene into Scene FBO
    this.ensureSceneFBO(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, width, height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.015, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 1. Procedural deep space parallax starfield
    this.renderStarfield(width, height, state.camera, timeSec);

    // 1.5. FTL-style outer ship armor hull & thrusters
    this.renderOuterHull(matrix, timeSec);

    // 2. FTL Grid Deck Floors with diagonal vacuum stripes and dark corridor plating
    this.renderDeckFloors(matrix, timeSec, state.boarding);

    // 3. Bulkhead walls & blast doors
    this.renderBulkheads(matrix);
    this.renderDoors(matrix, doors, dt);

    // 3.5. Corridor ceiling lamp fixtures
    this.renderCorridorLampFixtures(matrix, timeSec);

    // 4. Stations & mechanical fixtures
    this.renderStations(matrix, state.nearestStation?.id, timeSec);

    // 5. Pawns & Raiders & Sentries (Only render in active LoS cone)
    this.renderPawn(matrix, state.pawn, state.equippedWeapon, timeSec);
    if (state.remotePawns) {
      for (const rp of state.remotePawns) {
        const inLoS =
          this.lastPlayerLosPoly.length >= 3 &&
          isPointInPolygon({ x: rp.x, y: rp.y }, this.lastPlayerLosPoly);
        if (inLoS) {
          const rpWeapon: WeaponType = rp.isWelding ? 'arc_welder' : 'kinetic_carbine';
          this.renderPawn(matrix, rp, rpWeapon, timeSec);
        }
      }
    }
    this.renderIntruders(matrix, state.boarding?.intruders || [], timeSec);
    this.renderSentries(matrix, state.boarding?.sentries || [], timeSec);

    // 5.5. Ambient floating atmospheric dust motes
    this.renderDustMotes(matrix, timeSec, dt);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // PASS 3: Composite Scene with Lightmap & Desaturate Explored Non-LoS Areas
    this.applyLightmap(width, height);

    // PASS 4: Render Emissive Passes (Glow in the dark)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 6. Projectiles with Additive Glow Shader
    this.renderProjectiles(matrix, state.boarding?.projectiles || [], timeSec);

    // 6.5. Continuous Welder Arcs (local & peers)
    for (const w of welders) {
      if (w.active) {
        this.renderWelderArc(matrix, w, doors);
      }
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

    // PASS 5: Render WebGL2 Curved Helmet HUD & Diegetic Telemetry
    const hudW = state.screenWidth ?? width;
    const hudH = state.screenHeight ?? height;
    this.hudRenderer.render(state, hudW, hudH, timeSec, this.lastPlayerLosPoly);
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

    const roomTypeMap: Record<string, number> = {
      bridge: 0,
      quarters: 1,
      mess: 2,
      corridor: 3,
      armory: 4,
      cargo: 5,
      engineering: 6,
    };

    for (const room of HESPERIA_ROOMS) {
      const o2 = boarding?.roomO2?.[room.id] ?? 100;
      const isVented = Boolean(boarding?.ventedRooms?.includes(room.id) || o2 < 25);

      gl.uniform1f(gl.getUniformLocation(this.deckProg, 'u_isVacuum'), isVented ? 1.0 : 0.0);
      gl.uniform1i(gl.getUniformLocation(this.deckProg, 'u_roomType'), roomTypeMap[room.id] ?? 1);
      gl.uniform4f(
        gl.getUniformLocation(this.deckProg, 'u_roomBounds'),
        room.x,
        room.y,
        room.width,
        room.height
      );

      if (room.id === 'corridor') {
        gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.12, 0.14, 0.18);
      } else {
        gl.uniform3f(gl.getUniformLocation(this.deckProg, 'u_floorColor'), 0.9, 0.92, 0.95);
      }

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

  // fallow-ignore-next-line complexity
  private renderBulkheads(matrix: Float32Array): void {
    const gl = this.gl;
    this.bindFlatProgram(matrix);

    // 1. Soft Wall Drop Shadows cast onto the floor along bottom/right (+4, +5)
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.0, 0.0, 0.42);
    const shadowLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      this.addThickSegment(shadowLines, wall.x1 + 4, wall.y1 + 5, wall.x2 + 4, wall.y2 + 5, 10);
    }
    this.bufferAndDraw(new Float32Array(shadowLines));

    // 2. Heavy Armored Structural Casing Core (7.5px dark charcoal gunmetal)
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.07, 0.09, 0.13, 1.0);
    const coreLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      this.addThickSegment(coreLines, wall.x1, wall.y1, wall.x2, wall.y2, 7.5);
    }
    this.bufferAndDraw(new Float32Array(coreLines));

    // 3. Metallic Beveled Edge Highlight (2.8px steel blue)
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.32, 0.38, 0.48, 1.0);
    const bevelLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      this.addThickSegment(bevelLines, wall.x1, wall.y1, wall.x2, wall.y2, 2.8);
    }
    this.bufferAndDraw(new Float32Array(bevelLines));

    // 4. Panel Seams
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.52, 0.58, 0.7, 1.0);
    const detailLines: number[] = [];
    for (const wall of HESPERIA_WALLS) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len = Math.hypot(dx, dy);
      if (len > 32) {
        const nx = -dy / len;
        const ny = dx / len;
        const steps = Math.floor(len / 32);
        for (let i = 1; i < steps; i++) {
          const px = wall.x1 + (dx * i) / steps;
          const py = wall.y1 + (dy * i) / steps;
          this.addThickSegment(
            detailLines,
            px - nx * 3.5,
            py - ny * 3.5,
            px + nx * 3.5,
            py + ny * 3.5,
            1.4
          );
        }
      }
    }
    this.bufferAndDraw(new Float32Array(detailLines));

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

    // Animated rear thruster plasma plumes (3 engines)
    const flicker = 0.8 + 0.2 * Math.sin(time * 15.0);
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.0, 0.85, 1.0, flicker);
    this.drawQuad(160, 330, 40, 18);
    this.drawQuad(160, 410, 40, 18);
    this.drawQuad(160, 490, 40, 18);

    // Hot white inner thruster core
    gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.9, 0.98, 1.0, 0.95);
    this.drawQuad(175, 334, 25, 10);
    this.drawQuad(175, 414, 25, 10);
    this.drawQuad(175, 494, 25, 10);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderDoors(matrix: Float32Array, doors: DoorState[], dt: number): void {
    this.bindFlatProgram(matrix);
    const gl = this.gl;

    for (const door of doors) {
      const isHoriz = Math.abs(door.y2 - door.y1) < Math.abs(door.x2 - door.x1);
      const minX = Math.min(door.x1, door.x2);
      const minY = Math.min(door.y1, door.y2);
      const w = isHoriz ? Math.abs(door.x2 - door.x1) : 14;
      const h = isHoriz ? 14 : Math.abs(door.y2 - door.y1);
      const x = isHoriz ? minX : door.x1 - 7;
      const y = isHoriz ? door.y1 - 7 : minY;

      const targetRatio = door.isOpen ? 1.0 : 0.0;
      const prevRatio = this.doorOpenRatios.get(door.id) ?? targetRatio;
      const newRatio = prevRatio + (targetRatio - prevRatio) * Math.min(1.0, dt * 9.0);
      this.doorOpenRatios.set(door.id, newRatio);

      // 1. Recessed door frame track housing (fixed at jambs)
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.12, 0.14, 0.18, 1.0);
      if (isHoriz) {
        this.drawQuad(x, y, 7, h);
        this.drawQuad(x + w - 7, y, 7, h);
      } else {
        this.drawQuad(x, y, w, 7);
        this.drawQuad(x, y + h - 7, w, 7);
      }

      // 2. Frame clearance indicator LED (green when open, red when closed)
      const ledCol: [number, number, number] = door.isOpen ? [0.1, 0.95, 0.35] : [0.95, 0.2, 0.2];
      gl.uniform4f(
        gl.getUniformLocation(this.flatProg, 'u_color'),
        ledCol[0],
        ledCol[1],
        ledCol[2],
        1.0
      );
      if (isHoriz) {
        this.drawQuad(x + 2, y + 2, 3, 3);
        this.drawQuad(x + w - 5, y + 2, 3, 3);
      } else {
        this.drawQuad(x + 2, y + 2, 3, 3);
        this.drawQuad(x + 2, y + h - 5, 3, 3);
      }

      // 3. Sliding Blast Door Slabs (retract towards jambs as newRatio -> 1.0)
      const slideOffset = (isHoriz ? w * 0.42 : h * 0.42) * newRatio;
      const slabW = isHoriz ? w * 0.5 - 2 : w - 2;
      const slabH = isHoriz ? h - 2 : h * 0.5 - 2;

      // Slab 1 (Left / Top)
      const s1x = isHoriz ? x + 1 - slideOffset : x + 1;
      const s1y = isHoriz ? y + 1 : y + 1 - slideOffset;
      // Slab 2 (Right / Bottom)
      const s2x = isHoriz ? x + w * 0.5 + 1 + slideOffset : x + 1;
      const s2y = isHoriz ? y + 1 : y + h * 0.5 + 1 + slideOffset;

      // Slab armor base
      gl.uniform4f(
        gl.getUniformLocation(this.flatProg, 'u_color'),
        0.88,
        0.68,
        0.05,
        1.0 - newRatio * 0.8
      );
      this.drawQuad(s1x, s1y, slabW, slabH);
      this.drawQuad(s2x, s2y, slabW, slabH);

      // Hazard chevron stripes on door slabs
      gl.uniform4f(
        gl.getUniformLocation(this.flatProg, 'u_color'),
        0.12,
        0.14,
        0.16,
        1.0 - newRatio * 0.8
      );
      const stripes = isHoriz ? Math.floor(w / 16) : Math.floor(h / 16);
      for (let i = 0; i < stripes; i += 2) {
        const sx = isHoriz ? x + i * 16 : x;
        const sy = isHoriz ? y : y + i * 16;
        this.drawQuad(sx + 2, sy + 2, isHoriz ? 7 : w - 4, isHoriz ? h - 4 : 7);
      }

      // Central hydraulic clamp coupling
      if (newRatio < 0.8) {
        const mx = (door.x1 + door.x2) / 2;
        const my = (door.y1 + door.y2) / 2;
        gl.uniform4f(
          gl.getUniformLocation(this.flatProg, 'u_color'),
          0.18,
          0.22,
          0.28,
          1.0 - newRatio
        );
        this.drawQuad(mx - 10, my - 4, 20, 8);
        gl.uniform4f(
          gl.getUniformLocation(this.flatProg, 'u_color'),
          0.95,
          0.18,
          0.22,
          1.0 - newRatio
        );
        this.drawQuad(mx - 4, my - 2, 8, 4);
      }
    }
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderStations(matrix: Float32Array, nearestId?: string, timeSec = 0): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const st of HESPERIA_STATIONS) {
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
        if (st.id === 'mess_prep') {
          renderGalleyPrep(ctx, st, isNear, timeSec);
        } else {
          renderDispenser(ctx, st, isNear, st.id.includes('water'), timeSec);
        }
      }
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
    renderTacticalPawn(ctx, pawn, equippedWeapon, timeSec, this.lastWeaponRecoil);
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderIntruders(
    matrix: Float32Array,
    intruders: NonNullable<BoardingTacticsTelemetry['intruders']>,
    timeSec = 0
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const intruder of intruders) {
      if (intruder.state === 'neutralized') continue;

      const inLoS =
        this.lastPlayerLosPoly.length >= 3 &&
        isPointInPolygon({ x: intruder.x, y: intruder.y }, this.lastPlayerLosPoly);
      if (!inLoS) continue;

      renderRaiderIntruder(ctx, intruder, timeSec);
    }
    this.gl.bindVertexArray(null);
  }

  private renderSentries(
    matrix: Float32Array,
    sentries: NonNullable<BoardingTacticsTelemetry['sentries']>,
    timeSec = 0
  ): void {
    this.bindFlatProgram(matrix);
    const ctx = this.getRenderContext();

    for (const sentry of sentries) {
      const inLoS =
        this.lastPlayerLosPoly.length >= 3 &&
        isPointInPolygon({ x: sentry.x, y: sentry.y }, this.lastPlayerLosPoly);
      if (!inLoS) continue;

      renderSentryTurret(ctx, sentry, timeSec);
    }
    this.gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  private renderDustMotes(matrix: Float32Array, timeSec: number, dt: number): void {
    this.bindFlatProgram(matrix);
    const gl = this.gl;
    for (const m of this.dustMotes) {
      m.x = 60 + ((m.x + m.vx * dt - 60 + 1080) % 1080);
      m.y = 60 + ((m.y + m.vy * dt - 60 + 680) % 680);

      const shimmer = m.alpha * (0.8 + 0.2 * Math.sin(timeSec * 3.0 + m.x));
      gl.uniform4f(gl.getUniformLocation(this.flatProg, 'u_color'), 0.8, 0.9, 1.0, shimmer);
      this.drawCircle(m.x, m.y, m.size, 6);
    }
    this.gl.bindVertexArray(null);
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
      if (
        this.lastPlayerLosPoly.length >= 3 &&
        !isPointInPolygon({ x: proj.x, y: proj.y }, this.lastPlayerLosPoly)
      ) {
        continue;
      }
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
        beamLen = 32;
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
    welder: NonNullable<WebGLRenderState['welderState']>,
    doors?: DoorState[]
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

    for (const wall of HESPERIA_WALLS) {
      if (wall.isTraversable) continue;
      const t = getRaycastIntersectionT(
        p1,
        p2,
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 }
      );
      if (t !== null && t < minT) minT = t;
    }

    if (doors) {
      for (const door of doors) {
        if (door.isOpen) continue;
        const t = getRaycastIntersectionT(
          p1,
          p2,
          { x: door.x1, y: door.y1 },
          { x: door.x2, y: door.y2 }
        );
        if (t !== null && t < minT) minT = t;
      }
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

    this.addImpact(endX, endY, 'welder');

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
