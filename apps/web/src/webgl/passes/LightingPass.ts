import type { ProjectileState, WallSegment } from '@kybernetes/protocol';
import {
  computeVisibilityPolygon,
  getWorldLights,
  isPointInPolygon,
  type Point2D,
} from '@kybernetes/sim-core';
import { createProgram } from '../glUtils';
import { LIGHT_FAN_FS, LIGHT_FAN_VS, LIGHTMAP_APPLY_FS, LIGHTMAP_APPLY_VS } from '../shaders';
import type { FramebufferManager } from '../systems/FramebufferManager';
import { buildPolygonFanVertices, type FogOfWarPass } from './FogOfWarPass';

export interface LightSourceConfig {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: [number, number, number];
  isDirectional?: boolean;
  facingAngle?: number;
  fov?: number;
  ambientRadius?: number;
}

export class LightingPass {
  private gl: WebGL2RenderingContext;
  private lightFanProg: WebGLProgram;
  private lightmapApplyProg: WebGLProgram;
  private lightFanVAO: WebGLVertexArrayObject;
  private lightmapApplyVAO: WebGLVertexArrayObject;
  private quadBuffer: WebGLBuffer;
  private dynamicBuffer: WebGLBuffer;

  private cachedStaticLights = new Map<string, Point2D[]>();
  private lastDoorsHash = '';
  public currentLights = new Float32Array(24);
  public currentLightColors = new Float32Array(18);

  constructor(gl: WebGL2RenderingContext, quadBuffer: WebGLBuffer, dynamicBuffer: WebGLBuffer) {
    this.gl = gl;
    this.quadBuffer = quadBuffer;
    this.dynamicBuffer = dynamicBuffer;

    this.lightFanProg = createProgram(gl, LIGHT_FAN_VS, LIGHT_FAN_FS);
    this.lightmapApplyProg = createProgram(gl, LIGHTMAP_APPLY_VS, LIGHTMAP_APPLY_FS);

    this.lightFanVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightFanVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const fanPos = gl.getAttribLocation(this.lightFanProg, 'a_position');
    gl.enableVertexAttribArray(fanPos);
    gl.vertexAttribPointer(fanPos, 2, gl.FLOAT, false, 0, 0);

    this.lightmapApplyVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightmapApplyVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const applyPos = gl.getAttribLocation(this.lightmapApplyProg, 'a_position');
    gl.enableVertexAttribArray(applyPos);
    gl.vertexAttribPointer(applyPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public updateLights(
    projectiles?: ProjectileState[],
    welders?: Array<{
      active: boolean;
      originX: number;
      originY: number;
      facingAngle: number;
      range?: number;
    }>,
    playerLoSPoly?: Point2D[]
  ): void {
    this.currentLights.fill(0);
    this.currentLightColors.fill(0);

    let lightIdx = 0;

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
      if (p.weaponType === 'kinetic_carbine') continue;
      if (
        !p.fromPlayer &&
        playerLoSPoly &&
        playerLoSPoly.length >= 3 &&
        !isPointInPolygon({ x: p.x, y: p.y }, playerLoSPoly)
      ) {
        continue;
      }

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
  public drawLightPolygonFan(
    matrix: Float32Array,
    light: LightSourceConfig,
    poly: Point2D[]
  ): void {
    if (poly.length < 3) return;
    const gl = this.gl;
    const verts = buildPolygonFanVertices({ x: light.x, y: light.y }, poly);

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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);

    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderStaticShipLights(
    matrix: Float32Array,
    timeSec: number,
    opaqueWalls: WallSegment[],
    shipDx = 0
  ): void {
    for (const light of getWorldLights({ x: shipDx, y: 0 })) {
      let intensity = light.intensity;
      if (light.flickerSpeed && light.flickerAmount) {
        intensity += Math.sin(timeSec * light.flickerSpeed) * light.flickerAmount;
      }

      let poly: Point2D[] | undefined;
      if (shipDx === 0) {
        poly = this.cachedStaticLights.get(light.id);
      }
      if (!poly) {
        poly = computeVisibilityPolygon({ x: light.x, y: light.y }, light.radius, opaqueWalls, 36);
        if (shipDx === 0) {
          this.cachedStaticLights.set(light.id, poly);
        }
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
  public renderDynamicLightSources(
    matrix: Float32Array,
    projectiles: ProjectileState[] | undefined,
    muzzleFlashes: ReadonlyArray<{
      x: number;
      y: number;
      weaponType: string;
      life: number;
      maxLife: number;
    }>,
    welderState:
      | { active: boolean; originX: number; originY: number; facingAngle: number }
      | undefined,
    opaqueWalls: WallSegment[],
    timeSec: number,
    playerLoSPoly?: Point2D[]
  ): void {
    if (projectiles) {
      for (const p of projectiles) {
        if (p.weaponType === 'kinetic_carbine') continue;
        if (
          !p.fromPlayer &&
          playerLoSPoly &&
          playerLoSPoly.length >= 3 &&
          !isPointInPolygon({ x: p.x, y: p.y }, playerLoSPoly)
        ) {
          continue;
        }
        const isLaser = p.weaponType === 'pulse_laser';
        const color: [number, number, number] =
          p.color === '#ff1744' ? [1.0, 0.15, 0.25] : isLaser ? [0.1, 0.95, 1.0] : [0.4, 0.75, 1.0];
        const radius = isLaser ? 110 + (p.chargeRatio ?? 1.0) * 40 : 100;
        const poly = computeVisibilityPolygon({ x: p.x, y: p.y }, radius, opaqueWalls, 32);
        this.drawLightPolygonFan(matrix, { x: p.x, y: p.y, radius, intensity: 0.9, color }, poly);
      }
    }

    for (const mf of muzzleFlashes) {
      if (
        playerLoSPoly &&
        playerLoSPoly.length >= 3 &&
        !isPointInPolygon({ x: mf.x, y: mf.y }, playerLoSPoly)
      ) {
        continue;
      }
      const isLaser = mf.weaponType === 'pulse_laser';
      const radius = isLaser ? 140 : 105;
      const color: [number, number, number] = isLaser ? [0.2, 0.95, 1.0] : [1.0, 0.85, 0.4];
      const intensity = (mf.life / mf.maxLife) * 1.8;
      const poly = computeVisibilityPolygon({ x: mf.x, y: mf.y }, radius, opaqueWalls, 28);
      this.drawLightPolygonFan(matrix, { x: mf.x, y: mf.y, radius, intensity, color }, poly);
    }

    const reactorPulse = 0.75 + 0.25 * Math.sin(timeSec * 4.0);
    const reactorPoly = computeVisibilityPolygon({ x: 970, y: 570 }, 140, opaqueWalls, 28);
    this.drawLightPolygonFan(
      matrix,
      { x: 970, y: 570, radius: 140, intensity: 0.6 * reactorPulse, color: [1.0, 0.55, 0.1] },
      reactorPoly
    );

    if (welderState?.active) {
      const arcX = welderState.originX + Math.cos(welderState.facingAngle) * 24;
      const arcY = welderState.originY + Math.sin(welderState.facingAngle) * 24;
      if (
        !playerLoSPoly ||
        playerLoSPoly.length < 3 ||
        isPointInPolygon({ x: arcX, y: arcY }, playerLoSPoly)
      ) {
        const poly = computeVisibilityPolygon({ x: arcX, y: arcY }, 90, opaqueWalls, 32);
        this.drawLightPolygonFan(
          matrix,
          { x: arcX, y: arcY, radius: 90, intensity: 1.2, color: [0.2, 0.85, 1.0] },
          poly
        );
      }
    }
  }

  // fallow-ignore-next-line complexity
  public renderLightmap(
    matrix: Float32Array,
    pawn: { x: number; y: number; facingAngle: number },
    doorsHash: string,
    projectiles: ProjectileState[] | undefined,
    muzzleFlashes: ReadonlyArray<{
      x: number;
      y: number;
      weaponType: string;
      life: number;
      maxLife: number;
    }>,
    welderState:
      | { active: boolean; originX: number; originY: number; facingAngle: number }
      | undefined,
    timeSec: number,
    opaqueWalls: WallSegment[],
    width: number,
    height: number,
    fboManager: FramebufferManager,
    fogOfWarPass: FogOfWarPass,
    shipDx = 0
  ): Point2D[] {
    const gl = this.gl;
    const { fbo } = fboManager.ensureLightFBO(width, height);

    if (doorsHash !== this.lastDoorsHash) {
      this.cachedStaticLights.clear();
      this.lastDoorsHash = doorsHash;
    }

    const playerFov = (160 * Math.PI) / 180;
    const playerLoSRange = 540;
    const perceptionRadius = 24;
    const playerLoSPoly = computeVisibilityPolygon(
      { x: pawn.x, y: pawn.y },
      playerLoSRange,
      opaqueWalls,
      36,
      { facingAngle: pawn.facingAngle, fov: playerFov, perceptionRadius }
    );
    fogOfWarPass.setLastPlayerLosPoly(playerLoSPoly);
    fogOfWarPass.stampFowExploration(fboManager, playerLoSPoly, pawn);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ZERO);

    fogOfWarPass.renderShipAmbientRooms(fboManager, matrix, shipDx);

    gl.blendFunc(gl.ONE, gl.ONE);
    this.renderStaticShipLights(matrix, timeSec, opaqueWalls, shipDx);

    this.drawLightPolygonFan(
      matrix,
      {
        x: pawn.x,
        y: pawn.y,
        radius: playerLoSRange,
        intensity: 1.5,
        color: [1.0, 0.98, 0.95],
        isDirectional: true,
        facingAngle: pawn.facingAngle,
        fov: playerFov,
        ambientRadius: perceptionRadius,
      },
      playerLoSPoly
    );

    this.renderDynamicLightSources(
      matrix,
      projectiles,
      muzzleFlashes,
      welderState,
      opaqueWalls,
      timeSec,
      playerLoSPoly
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    return playerLoSPoly;
  }

  public applyLightmap(fboManager: FramebufferManager, width: number, height: number): void {
    const lightTex = fboManager.getLightTexture();
    const sceneTex = fboManager.getSceneTexture();
    if (!lightTex || !sceneTex) return;

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.lightmapApplyProg);
    gl.bindVertexArray(this.lightmapApplyVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(this.lightmapApplyProg, 'u_sceneTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.uniform1i(gl.getUniformLocation(this.lightmapApplyProg, 'u_lightTexture'), 1);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.lightFanVAO);
    gl.deleteVertexArray(this.lightmapApplyVAO);
    gl.deleteProgram(this.lightFanProg);
    gl.deleteProgram(this.lightmapApplyProg);
  }
}
