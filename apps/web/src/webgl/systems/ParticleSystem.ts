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

export class ParticleSystem {
  private particles: ImpactParticle[] = [];
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
  public addImpact(x: number, y: number, type: 'kinetic' | 'laser' | 'welder'): void {
    if (type === 'kinetic') {
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

  public addMuzzleFlash(flash: { x: number; y: number; weaponType: WeaponType }): void {
    this.muzzleFlashes.push({ ...flash, life: 0.05, maxLife: 0.05 });
    this.lastWeaponRecoil = flash.weaponType === 'kinetic_carbine' ? 2.5 : 4.0;
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
    matrix: Float32Array,
    timeSec: number,
    dt: number,
    drawCircle: (cx: number, cy: number, r: number, segments: number) => void
  ): void {
    gl.useProgram(flatProg);
    gl.uniformMatrix3fv(gl.getUniformLocation(flatProg, 'u_matrix'), false, matrix);

    for (const m of this.dustMotes) {
      m.x = 60 + ((m.x + m.vx * dt - 60 + 1080) % 1080);
      m.y = 60 + ((m.y + m.vy * dt - 60 + 680) % 680);

      const shimmer = m.alpha * (0.8 + 0.2 * Math.sin(timeSec * 3.0 + m.x));
      gl.uniform4f(gl.getUniformLocation(flatProg, 'u_color'), 0.8, 0.9, 1.0, shimmer);
      drawCircle(m.x, m.y, m.size, 6);
    }
  }

  // fallow-ignore-next-line complexity
  public renderImpactParticles(
    gl: WebGL2RenderingContext,
    flatProg: WebGLProgram,
    matrix: Float32Array,
    dt: number,
    drawQuad: (x: number, y: number, w: number, h: number) => void
  ): void {
    if (this.particles.length === 0) return;

    gl.useProgram(flatProg);
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
  }
}
