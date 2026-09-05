import type { WeaponType } from '@kybernetes/protocol';

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
  public addImpact(
    x: number,
    y: number,
    type: 'kinetic' | 'laser' | 'welder',
    shipVelocity?: { vx: number; vy: number }
  ): void {
    const svx = shipVelocity?.vx ?? 0;
    const svy = shipVelocity?.vy ?? 0;
    if (type === 'kinetic') {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 160;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd + svx,
          vy: Math.sin(a) * spd + svy,
          r: 1.0,
          g: 0.65 + Math.random() * 0.35,
          b: 0.15,
          size: 2.5 + Math.random() * 2.0,
          life: 0.2 + Math.random() * 0.15,
          maxLife: 0.35,
        });
      }
    } else if (type === 'laser') {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 90;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd + svx,
          vy: Math.sin(a) * spd + svy,
          r: 0.0,
          g: 0.95,
          b: 1.0,
          size: 4.0,
          life: 0.16,
          maxLife: 0.16,
        });
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 90 + Math.random() * 150;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd + svx,
          vy: Math.sin(a) * spd + svy,
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

  public addMuzzleFlash(flash: { x: number; y: number; weaponType: WeaponType }): void {
    this.muzzleFlashes.push({ ...flash, life: 0.05, maxLife: 0.05 });
    this.lastWeaponRecoil = flash.weaponType === 'kinetic_carbine' ? 2.5 : 4.0;
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

  public renderDustMotes(
    gl: WebGL2RenderingContext,
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    timeSec: number,
    dt: number,
    drawCircle: (cx: number, cy: number, r: number, segments: number) => void
  ): void {
    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    for (const m of this.dustMotes) {
      m.x = 60 + ((m.x + m.vx * dt - 60 + 1080) % 1080);
      m.y = 60 + ((m.y + m.vy * dt - 60 + 680) % 680);

      const shimmer = m.alpha * (0.8 + 0.2 * Math.sin(timeSec * 3.0 + m.x));
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.8, 0.9, 1.0, shimmer);
      drawCircle(m.x, m.y, m.size, 6);
    }
    gl.bindVertexArray(null);
  }

  // fallow-ignore-next-line complexity
  public renderImpactParticles(
    gl: WebGL2RenderingContext,
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    dt: number,
    drawQuad: (x: number, y: number, w: number, h: number) => void
  ): void {
    if (this.particles.length === 0) return;

    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);
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
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), p.r, p.g, p.b, alpha);
      drawQuad(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  public renderAirflowParticles(
    gl: WebGL2RenderingContext,
    flatProg: WebGLProgram,
    flatVAO: WebGLVertexArrayObject,
    matrix: Float32Array,
    timeSec: number,
    dt: number,
    drawQuad: (x: number, y: number, w: number, h: number) => void,
    drawCircle: (cx: number, cy: number, r: number, segments: number) => void
  ): void {
    if (this.airflowParticles.length === 0) return;

    gl.useProgram(flatProg);
    gl.bindVertexArray(flatVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    for (let i = this.airflowParticles.length - 1; i >= 0; i--) {
      const particle = this.airflowParticles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.982;
      particle.vy *= 0.982;
      particle.life -= dt;
      if (particle.life <= 0) {
        this.airflowParticles.splice(i, 1);
        continue;
      }

      if (particle.kind === 'vapor') {
        const progress = Math.max(0, 1.0 - particle.life / particle.maxLife);
        const currentRadius =
          particle.size + (particle.maxSize - particle.size) * Math.sqrt(progress);
        const alpha = Math.sin(progress * Math.PI) * 0.18 * particle.intensity;
        gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.88, 0.95, 1.0, alpha);
        drawCircle(particle.x, particle.y, currentRadius, 6);
      } else {
        const glintLife = particle.life / particle.maxLife;
        const shimmer = 0.45 + 0.55 * Math.sin(timeSec * 28.0 + particle.seed);
        const alpha = glintLife * shimmer * 0.75 * particle.intensity;
        gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.96, 0.98, 1.0, alpha);
        drawQuad(
          particle.x - particle.size * 0.5,
          particle.y - particle.size * 0.5,
          particle.size,
          particle.size
        );
      }
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
}
