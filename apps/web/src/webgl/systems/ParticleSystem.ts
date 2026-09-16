import type { WeaponType } from '@kybernetes/protocol';
import { createProgram } from '../glUtils.js';
import { PARTICLE_INST_FS, PARTICLE_INST_VS } from '../shaders.js';

/** Interleaved instance fields: x, y, size, kind, r, g, b, a. */
const INSTANCE_FLOATS = 8;
/** Worst case: 600 impact + 500 airflow + 40 motes, plus headroom. */
export const PARTICLE_MAX_INSTANCES = 1200;

const KIND_SQUARE = 0;
const KIND_DISC = 1;
const KIND_VAPOR = 2;

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

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface MuzzleFlash {
  x: number;
  y: number;
  weaponType: WeaponType;
  life: number;
  maxLife: number;
}

interface AirflowParticle {
  kind: 'vapor' | 'glint';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  intensity: number;
  seed: number;
}

export class ParticleSystem {
  private particles: ImpactParticle[] = [];
  private airflowParticles: AirflowParticle[] = [];
  private dustMotes: DustMote[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private lastWeaponRecoil = 0;
  private ambientWind = { x: 0, y: 0 };
  private particleProg: WebGLProgram | null = null;
  private particleVAO: WebGLVertexArrayObject | null = null;
  private particleQuad: WebGLBuffer | null = null;
  private particleInst: WebGLBuffer | null = null;
  private instanceScratch = new Float32Array(PARTICLE_MAX_INSTANCES * INSTANCE_FLOATS);

  constructor() {
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
  }

  // fallow-ignore-next-line complexity
  /** Suction drift for dust motes (px/s); rooms exhaling through breaches lean. */
  public setAmbientWind(u: number, v: number): void {
    this.ambientWind = { x: u, y: v };
  }

  /**
   * Directional breach plume: streak vapor along the flow axis plus a
   * condensation collar at the throat when the pressure drop is violent.
   */
  public emitBreachPlume(
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    speedPx: number,
    intensity: number,
    areaM2: number
  ): void {
    if (speedPx < 20 || intensity <= 0.02) return;
    const wide = Math.min(1, areaM2 / 1.5);
    const perpX = -dy;
    const perpY = dx;
    const halfLen = 6 + 14 * wide;
    const puffs = 2 + Math.round(intensity * 3);
    for (let i = 0; i < puffs; i += 1) {
      const along = (Math.random() - 0.5) * halfLen * 2;
      const across = (Math.random() - 0.5) * (6 + 10 * wide);
      this.emitAirflow(
        cx + dx * along + perpX * across,
        cy + dy * along + perpY * across,
        dx * speedPx,
        dy * speedPx,
        intensity
      );
    }
    if (intensity > 0.5) this.emitThroatCollar(cx, cy, dx, dy, intensity);
  }

  private emitThroatCollar(
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    intensity: number
  ): void {
    this.airflowParticles.push({
      kind: 'vapor',
      x: cx + (Math.random() - 0.5) * 6,
      y: cy + (Math.random() - 0.5) * 6,
      vx: dx * 40 + (Math.random() - 0.5) * 30,
      vy: dy * 40 + (Math.random() - 0.5) * 30,
      size: 3.5,
      maxSize: 9.0,
      life: 0.4,
      maxLife: 0.4,
      intensity: Math.min(1, intensity),
      seed: Math.random() * 100,
    });
    if (this.airflowParticles.length > 500) this.airflowParticles.shift();
  }

  public addDirectionalImpact(hit: {
    x: number;
    y: number;
    type: 'kinetic' | 'laser' | 'welder' | 'breach';
    angle: number;
    weapon: string;
    energy: number;
    breachAreaM2?: number;
    pressureKpa?: number;
    shipVelocity?: { vx: number; vy: number };
  }): void {
    // Directional cone around the surface normal + hot core + lingering ember.
    // Throw scales with the hole being cut and the air shoving through it:
    // full breaches in shirt-sleeves vent dramatically, punctures in vacuum
    // barely spit.
    const energy = Math.min(1, Math.max(0, hit.energy));
    const areaFactor = 0.55 + 0.65 * Math.min(1, (hit.breachAreaM2 ?? 0.05) / 1.5);
    const pressureFactor = 0.4 + 0.6 * Math.min(1, (hit.pressureKpa ?? 101.3) / 101.3);
    const throwScale = areaFactor * pressureFactor;
    const count = Math.max(3, Math.round((4 + energy * 6) * throwScale));
    const baseSpeed = (90 + energy * 160) * (0.6 + 0.4 * pressureFactor);
    const palette = weaponSpark(hit.weapon, hit.type);
    const svx = hit.shipVelocity?.vx ?? 0;
    const svy = hit.shipVelocity?.vy ?? 0;
    for (let i = 0; i < count; i += 1) {
      const spread = (Math.random() - 0.5) * 1.1;
      const a = hit.angle + Math.PI / 2 + spread;
      const spd = baseSpeed * (0.5 + Math.random() * 0.9);
      this.particles.push({
        x: hit.x,
        y: hit.y,
        vx: Math.cos(a) * spd + svx,
        vy: Math.sin(a) * spd + svy,
        r: palette.r,
        g: palette.g + Math.random() * 0.2,
        b: palette.b,
        size: 2 + Math.random() * (2 + energy * 2),
        life: 0.22 + Math.random() * (0.15 + energy * 0.25),
        maxLife: 0.5,
      });
    }
    // Hot core flash + slow ember.
    this.particles.push({
      x: hit.x,
      y: hit.y,
      vx: svx * 0.2,
      vy: svy * 0.2,
      r: 1.0,
      g: 0.95,
      b: 0.85,
      size: 4 + energy * 3,
      life: 0.08,
      maxLife: 0.08,
    });
    if (this.particles.length > 600) {
      this.particles.splice(0, this.particles.length - 600);
    }
  }

  private burstSparks(
    x: number,
    y: number,
    svx: number,
    svy: number,
    count: number,
    speedBase: number,
    speedRand: number,
    tint: (particle: ImpactParticle) => void,
    size: (particle: ImpactParticle) => void,
    life: (particle: ImpactParticle) => void
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = speedBase + Math.random() * speedRand;
      const particle: ImpactParticle = {
        x,
        y,
        vx: Math.cos(a) * spd + svx,
        vy: Math.sin(a) * spd + svy,
        r: 1.0,
        g: 1.0,
        b: 1.0,
        size: 2.5,
        life: 0.2,
        maxLife: 0.35,
      };
      tint(particle);
      size(particle);
      life(particle);
      this.particles.push(particle);
    }
  }

  private burstKinetic(x: number, y: number, svx: number, svy: number): void {
    this.burstSparks(
      x,
      y,
      svx,
      svy,
      10,
      70,
      160,
      (p) => {
        p.g = 0.65 + Math.random() * 0.35;
        p.b = 0.15;
      },
      (p) => {
        p.size = 2.5 + Math.random() * 2.0;
      },
      (p) => {
        p.life = 0.2 + Math.random() * 0.15;
      }
    );
  }

  private burstBreach(x: number, y: number, svx: number, svy: number): void {
    this.burstSparks(
      x,
      y,
      svx,
      svy,
      14,
      90,
      220,
      (p) => {
        p.g = 0.45 + Math.random() * 0.4;
        p.b = 0.1;
      },
      (p) => {
        p.size = 3.0 + Math.random() * 3.0;
      },
      (p) => {
        p.life = 0.35 + Math.random() * 0.3;
        p.maxLife = 0.65;
      }
    );
  }

  private burstLaser(x: number, y: number, svx: number, svy: number): void {
    this.burstSparks(
      x,
      y,
      svx,
      svy,
      6,
      40,
      90,
      (p) => {
        p.r = 0.0;
        p.g = 0.95;
      },
      (p) => {
        p.size = 4.0;
      },
      (p) => {
        p.life = 0.16;
        p.maxLife = 0.16;
      }
    );
  }

  private burstWelder(x: number, y: number, svx: number, svy: number): void {
    this.burstSparks(
      x,
      y,
      svx,
      svy,
      8,
      90,
      150,
      (p) => {
        p.r = Math.random() > 0.5 ? 0.0 : 0.75;
        p.g = 0.85;
      },
      (p) => {
        p.size = 3.5;
      },
      (p) => {
        p.life = 0.15;
        p.maxLife = 0.15;
      }
    );
  }

  public addImpact(
    x: number,
    y: number,
    type: 'kinetic' | 'laser' | 'welder' | 'breach',
    shipVelocity?: { vx: number; vy: number }
  ): void {
    const svx = shipVelocity?.vx ?? 0;
    const svy = shipVelocity?.vy ?? 0;
    if (type === 'kinetic') this.burstKinetic(x, y, svx, svy);
    else if (type === 'breach') this.burstBreach(x, y, svx, svy);
    else if (type === 'laser') this.burstLaser(x, y, svx, svy);
    else this.burstWelder(x, y, svx, svy);
  }

  public addMuzzleFlash(flash: { x: number; y: number; weaponType: WeaponType }): void {
    this.muzzleFlashes.push({ ...flash, life: 0.05, maxLife: 0.05 });
    this.lastWeaponRecoil = flash.weaponType === 'kinetic_carbine' ? 2.5 : 4.0;
  }

  /** Thruster exhaust: white-hot cores laced with cyan, streaming astern. */
  public emitExhaust(x: number, y: number, dirX: number, dirY: number, intensity = 1.0): void {
    if (intensity <= 0.02) return;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    const count = 1 + (Math.random() < intensity ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const spread = (Math.random() - 0.5) * 0.24;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const speed = 150 + Math.random() * 130;
      const whiteHot = Math.random() < 0.35;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 10,
        vx: (nx * cos - ny * sin) * speed,
        vy: (nx * sin + ny * cos) * speed,
        r: whiteHot ? 0.9 : 0.0,
        g: whiteHot ? 0.97 : 0.8,
        b: 1.0,
        size: 2.5 + Math.random() * 3.0,
        life: 0.3 + Math.random() * 0.35,
        maxLife: 0.65,
      });
    }
    if (this.particles.length > 600) {
      this.particles.splice(0, this.particles.length - 600);
    }
  }

  public emitAirflow(x: number, y: number, u: number, v: number, intensity = 1.0): void {
    const speed = Math.hypot(u, v);
    if (speed < 1 || intensity <= 0.02) return;

    const dirX = u / speed;
    const dirY = v / speed;
    const perpX = -dirY;
    const perpY = dirX;

    // 1. Fine aerosol vapor mist (dense clusters of delicate micro-fog particles)
    const vaporCount = Math.round(intensity * (4 + Math.random() * 4));
    for (let i = 0; i < vaporCount; i++) {
      const offset = (Math.random() - 0.5) * 18;
      const angleJitter = (Math.random() - 0.5) * 0.32;
      const cosJ = Math.cos(angleJitter);
      const sinJ = Math.sin(angleJitter);
      const jDirX = dirX * cosJ - dirY * sinJ;
      const jDirY = dirX * sinJ + dirY * cosJ;
      const particleSpeed = speed * (0.65 + Math.random() * 0.45);

      this.airflowParticles.push({
        kind: 'vapor',
        x: x + perpX * offset,
        y: y + perpY * offset,
        vx: jDirX * particleSpeed,
        vy: jDirY * particleSpeed,
        size: 1.0 + Math.random() * 0.8,
        maxSize: 2.4 + Math.random() * 2.2,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        intensity: Math.min(1.0, intensity),
        seed: Math.random() * 100,
      });
    }

    // 2. Micro-ice glints (tiny sparkling ice needles)
    if (Math.random() < intensity * 1.5) {
      const glintOffset = (Math.random() - 0.5) * 12;
      const glintSpeed = speed * (1.1 + Math.random() * 0.5);
      this.airflowParticles.push({
        kind: 'glint',
        x: x + perpX * glintOffset,
        y: y + perpY * glintOffset,
        vx: dirX * glintSpeed + (Math.random() - 0.5) * 20,
        vy: dirY * glintSpeed + (Math.random() - 0.5) * 20,
        size: 0.8 + Math.random() * 0.6,
        maxSize: 1.4,
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.55,
        intensity: Math.min(1.0, intensity),
        seed: Math.random() * 50,
      });
    }

    if (this.airflowParticles.length > 500) this.airflowParticles.shift();
  }

  public update(dt: number): void {
    this.lastWeaponRecoil = Math.max(0, this.lastWeaponRecoil - dt * 20.0);
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) {
        this.muzzleFlashes.splice(i, 1);
      }
    }
  }

  public getMuzzleFlashes(): ReadonlyArray<MuzzleFlash> {
    return this.muzzleFlashes;
  }

  public getWeaponRecoil(): number {
    return this.lastWeaponRecoil;
  }

  /** Release the instanced particle program and buffers. */
  public disposeGl(gl: WebGL2RenderingContext): void {
    if (this.particleProg) gl.deleteProgram(this.particleProg);
    if (this.particleVAO) gl.deleteVertexArray(this.particleVAO);
    if (this.particleQuad) gl.deleteBuffer(this.particleQuad);
    if (this.particleInst) gl.deleteBuffer(this.particleInst);
    this.particleProg = null;
    this.particleVAO = null;
    this.particleQuad = null;
    this.particleInst = null;
  }

  private ensureGl(gl: WebGL2RenderingContext): void {
    if (this.particleProg !== null) return;
    this.particleProg = createProgram(gl, PARTICLE_INST_VS, PARTICLE_INST_FS);
    this.particleQuad = gl.createBuffer();
    this.particleInst = gl.createBuffer();
    this.particleVAO = gl.createVertexArray();
    if (!this.particleQuad || !this.particleInst || !this.particleVAO) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleQuad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInst);
    gl.bufferData(gl.ARRAY_BUFFER, PARTICLE_MAX_INSTANCES * INSTANCE_FLOATS * 4, gl.STREAM_DRAW);
    gl.bindVertexArray(this.particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleQuad);
    const corner = gl.getAttribLocation(this.particleProg, 'a_corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInst);
    const inst = gl.getAttribLocation(this.particleProg, 'a_inst');
    gl.enableVertexAttribArray(inst);
    gl.vertexAttribPointer(inst, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(inst, 1);
    const col = gl.getAttribLocation(this.particleProg, 'a_col');
    gl.enableVertexAttribArray(col);
    gl.vertexAttribPointer(col, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(col, 1);
    gl.bindVertexArray(null);
  }

  /** Integrate every particle list once per frame (no GL calls). */
  public updateParticles(dt: number): void {
    for (const m of this.dustMotes) {
      m.x = 60 + ((m.x + (m.vx + this.ambientWind.x * 0.35) * dt - 60 + 1080) % 1080);
      m.y = 60 + ((m.y + (m.vy + this.ambientWind.y * 0.35) * dt - 60 + 680) % 680);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const particle of this.airflowParticles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.982;
      particle.vy *= 0.982;
      particle.life -= dt;
    }
    this.airflowParticles = this.airflowParticles.filter((particle) => particle.life > 0);
  }

  private pushInstance(
    o: number,
    x: number,
    y: number,
    size: number,
    kind: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): number {
    const s = this.instanceScratch;
    s[o] = x;
    s[o + 1] = y;
    s[o + 2] = size;
    s[o + 3] = kind;
    s[o + 4] = r;
    s[o + 5] = g;
    s[o + 6] = b;
    s[o + 7] = a;
    return o + INSTANCE_FLOATS;
  }

  private drawInstances(gl: WebGL2RenderingContext, matrix: Float32Array, count: number): void {
    if (
      count === 0 ||
      this.particleProg === null ||
      this.particleVAO === null ||
      this.particleInst === null
    ) {
      return;
    }
    gl.useProgram(this.particleProg);
    gl.bindVertexArray(this.particleVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.particleProg, 'u_matrix'), false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceScratch.subarray(0, count * INSTANCE_FLOATS));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  /** Scene-pass motes: one instanced draw for the persistent 40. */
  public renderMotes(gl: WebGL2RenderingContext, matrix: Float32Array, timeSec: number): void {
    this.ensureGl(gl);
    let o = 0;
    for (const m of this.dustMotes) {
      const shimmer = m.alpha * (0.8 + 0.2 * Math.sin(timeSec * 3.0 + m.x));
      o = this.pushInstance(o, m.x, m.y, m.size, KIND_DISC, 0.8, 0.9, 1.0, shimmer);
    }
    this.drawInstances(gl, matrix, this.dustMotes.length);
  }

  /** Emissive-pass effects: impacts plus airflow in a single instanced draw. */
  public renderFx(gl: WebGL2RenderingContext, matrix: Float32Array, timeSec: number): void {
    this.ensureGl(gl);
    let o = 0;
    let count = 0;
    for (const p of this.particles) {
      if (count >= PARTICLE_MAX_INSTANCES) break;
      o = this.pushInstance(o, p.x, p.y, p.size, KIND_SQUARE, p.r, p.g, p.b, p.life / p.maxLife);
      count += 1;
    }
    const fx = this.fillAirflowInstances(o, count, timeSec);
    this.drawInstances(gl, matrix, fx);
  }

  private fillAirflowInstances(o: number, count: number, timeSec: number): number {
    for (const particle of this.airflowParticles) {
      if (count >= PARTICLE_MAX_INSTANCES) break;
      if (particle.kind === 'vapor') {
        const progress = Math.max(0, 1.0 - particle.life / particle.maxLife);
        const radius = particle.size + (particle.maxSize - particle.size) * Math.sqrt(progress);
        const alpha = Math.sin(progress * Math.PI) * 0.18 * particle.intensity;
        o = this.pushInstance(
          o,
          particle.x,
          particle.y,
          radius,
          KIND_VAPOR,
          0.88,
          0.95,
          1.0,
          alpha
        );
      } else {
        const glintLife = particle.life / particle.maxLife;
        const shimmer = 0.45 + 0.55 * Math.sin(timeSec * 28.0 + particle.seed);
        const alpha = glintLife * shimmer * 0.75 * particle.intensity;
        o = this.pushInstance(
          o,
          particle.x,
          particle.y,
          particle.size,
          KIND_SQUARE,
          0.96,
          0.98,
          1.0,
          alpha
        );
      }
      count += 1;
    }
    return count;
  }

  /** Live effect count across impact and airflow lists (capped at the buffer). */
  public fxCount(): number {
    return Math.min(PARTICLE_MAX_INSTANCES, this.particles.length + this.airflowParticles.length);
  }
}

function weaponSpark(
  weapon: string,
  type: 'kinetic' | 'laser' | 'welder' | 'breach'
): { r: number; g: number; b: number } {
  if (weapon === 'pulse_laser' || type === 'laser') return { r: 0.1, g: 0.9, b: 1.0 };
  if (weapon === 'arc_welder' || type === 'welder') return { r: 0.4, g: 0.85, b: 1.0 };
  if (type === 'breach') return { r: 1.0, g: 0.5, b: 0.15 };
  return { r: 1.0, g: 0.68, b: 0.2 };
}
