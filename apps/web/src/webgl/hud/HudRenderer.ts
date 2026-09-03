import type {
  BoardingTacticsTelemetry,
  DualProtocolBroadcast,
  PawnState,
  PlayerVitals,
  StationFixture,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import type { Point2D } from '@kybernetes/sim-core';
import { isPointInPolygon } from '@kybernetes/sim-core';
import type { ActiveInteraction } from '../../types';
import { createProgram, createScreenMatrix } from '../glUtils';
import {
  HUD_TEXT_FS,
  HUD_TEXT_VS,
  HUD_VECTOR_FS,
  HUD_VECTOR_VS,
  VISOR_GLASS_FS,
  VISOR_GLASS_VS,
} from '../shaders';
import { HudAtlas, type TextRenderOptions } from './HudAtlas';
import { HudHitTester } from './HudHitTester';

export interface HudDrawState {
  pawn: PawnState;
  remotePawns?: PawnState[];
  vitals?: PlayerVitals;
  telemetry?: TelemetryDeltaBroadcast;
  boarding?: BoardingTacticsTelemetry;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  nearestStation?: StationFixture | null;
  promptActionName?: string;
  activeInteraction?: ActiveInteraction | null;
  beaconCode?: string;
  crewCount?: number;
  clearanceLevel?: number;
  clearanceXp?: number;
  credits?: number;
  equippedWeapon?: WeaponType;
  kineticAmmo?: {
    current: number;
    max: number;
    reserve?: number;
    isReloading: boolean;
    reloadProgress?: number;
  };
  welderThermal?: { heat: number; isOverheated: boolean };

  triageNotice?: string | null;
  inGameNotice?: string | null;
  dualProtocol?: DualProtocolBroadcast | null;
  collabShift?: {
    shiftId: string;
    title: string;
    progressPercent: number;
    participants: string[];
    isCompleted: boolean;
  } | null;
  chargingState?: { active: boolean; ratio: number; weaponType: WeaponType };
  welderState?: {
    active: boolean;
    originX: number;
    originY: number;
    facingAngle: number;
    range: number;
  };
  welderArcs?: Array<{
    active: boolean;
    originX: number;
    originY: number;
    facingAngle: number;
    range: number;
  }>;
  camera: { x: number; y: number };
  mouseWorld: { x: number; y: number };
  mouseScreen?: { x: number; y: number };
  screenWidth?: number;
  screenHeight?: number;
  timeMs: number;
  onBeaconClick?: () => void;
  onManifestClick?: () => void;
  onRoleClick?: () => void;
  onDisembarkClick?: () => void;
  onEquipWeapon?: (w: WeaponType) => void;
  onAbortInteraction?: () => void;
  onExecuteDualProtocol?: () => void;
  onJoinCollabShift?: () => void;
}

export class HudRenderer {
  private gl: WebGL2RenderingContext;
  private visorProg: WebGLProgram;
  private vectorProg: WebGLProgram;
  private textProg: WebGLProgram;

  private atlas: HudAtlas;
  private hitTester: HudHitTester;
  private atlasTexture: WebGLTexture;

  private fsQuadBuffer: WebGLBuffer;
  private visorVAO: WebGLVertexArrayObject;

  private vectorBuffer: WebGLBuffer;
  private vectorVAO: WebGLVertexArrayObject;
  private vectorData: number[] = [];

  private textBuffer: WebGLBuffer;
  private textVAO: WebGLVertexArrayObject;
  private textData: number[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.atlas = new HudAtlas();
    this.hitTester = new HudHitTester();

    this.visorProg = createProgram(gl, VISOR_GLASS_VS, VISOR_GLASS_FS);
    this.vectorProg = createProgram(gl, HUD_VECTOR_VS, HUD_VECTOR_FS);
    this.textProg = createProgram(gl, HUD_TEXT_VS, HUD_TEXT_FS);

    this.atlasTexture = gl.createTexture()!;

    // 1. Visor Glass Quad
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.fsQuadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fsQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.visorVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.visorVAO);
    const visorPos = gl.getAttribLocation(this.visorProg, 'a_position');
    gl.enableVertexAttribArray(visorPos);
    gl.vertexAttribPointer(visorPos, 2, gl.FLOAT, false, 0, 0);

    // 2. Vector HUD geometry (x, y, r, g, b, a)
    this.vectorBuffer = gl.createBuffer()!;
    this.vectorVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.vectorVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vectorBuffer);
    const vecPos = gl.getAttribLocation(this.vectorProg, 'a_position');
    const vecCol = gl.getAttribLocation(this.vectorProg, 'a_color');
    gl.enableVertexAttribArray(vecPos);
    gl.vertexAttribPointer(vecPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(vecCol);
    gl.vertexAttribPointer(vecCol, 4, gl.FLOAT, false, 24, 8);

    // 3. Text HUD geometry (x, y, u, v)
    this.textBuffer = gl.createBuffer()!;
    this.textVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.textVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
    const textPos = gl.getAttribLocation(this.textProg, 'a_position');
    const textUv = gl.getAttribLocation(this.textProg, 'a_uv');
    gl.enableVertexAttribArray(textPos);
    gl.vertexAttribPointer(textPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(textUv);
    gl.vertexAttribPointer(textUv, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  public getHitTester(): HudHitTester {
    return this.hitTester;
  }

  private addQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const x2 = x + w;
    const y2 = y + h;
    const d = this.vectorData;
    d.push(x, y, r, g, b, a, x2, y, r, g, b, a, x, y2, r, g, b, a);
    d.push(x, y2, r, g, b, a, x2, y, r, g, b, a, x2, y2, r, g, b, a);
  }

  private addTriangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const d = this.vectorData;
    d.push(x1, y1, r, g, b, a, x2, y2, r, g, b, a, x3, y3, r, g, b, a);
  }

  private addSubdividedQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number,
    segsX = 8,
    segsY = 3
  ): void {
    const stepX = w / segsX;
    const stepY = h / segsY;
    for (let i = 0; i < segsX; i++) {
      const qx = x + i * stepX;
      for (let j = 0; j < segsY; j++) {
        const qy = y + j * stepY;
        this.addQuad(qx, qy, stepX, stepY, r, g, b, a);
      }
    }
  }

  // Segmented borders so linear edges bow smoothly with visor curvature
  private addBorder(
    x: number,
    y: number,
    w: number,
    h: number,
    thick: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const segs = 8;
    const stepX = w / segs;
    const stepY = h / segs;
    for (let i = 0; i < segs; i++) {
      this.addQuad(x + i * stepX, y, stepX, thick, r, g, b, a);
      this.addQuad(x + i * stepX, y + h - thick, stepX, thick, r, g, b, a);
      this.addQuad(x, y + i * stepY, thick, stepY, r, g, b, a);
      this.addQuad(x + w - thick, y + i * stepY, thick, stepY, r, g, b, a);
    }
  }

  private addCurvedPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const rad = Math.max(2, Math.min(8, radius));
    this.addSubdividedQuad(x + rad, y, w - rad * 2, h, r, g, b, a, 8, 3);
    this.addSubdividedQuad(x, y + rad, rad, h - rad * 2, r, g, b, a, 2, 3);
    this.addSubdividedQuad(x + w - rad, y + rad, rad, h - rad * 2, r, g, b, a, 2, 3);
    this.addBorder(x, y, w, h, 1, 0.0, 0.9, 1.0, a * 0.6);
  }

  // fallow-ignore-next-line complexity
  private addCartridge(
    x: number,
    y: number,
    isLoaded: boolean,
    isReloading: boolean,
    isLowAmmo: boolean
  ): void {
    const w = 5;
    const h = 12;

    if (!isLoaded) {
      // Empty spent slot in magazine: faint wireframe outline
      this.addBorder(x, y + 3, w, h - 3, 1, 0.2, 0.3, 0.4, 0.22);
      return;
    }

    let bodyR = 0.82;
    let bodyG = 0.65;
    let bodyB = 0.22;
    let tipR = 1.0;
    let tipG = 0.42;
    let tipB = 0.18;

    if (isReloading) {
      // Pulsing cyan glow while rounds are inserted into the magazine
      bodyR = 0.2;
      bodyG = 0.85;
      bodyB = 1.0;
      tipR = 0.6;
      tipG = 0.95;
      tipB = 1.0;
    } else if (isLowAmmo) {
      // Warning amber/red when low ammo
      bodyR = 0.95;
      bodyG = 0.25;
      bodyB = 0.2;
      tipR = 1.0;
      tipG = 0.55;
      tipB = 0.2;
    }

    // Extractor rim base
    this.addQuad(x - 0.5, y + h - 2, w + 1, 2, bodyR * 0.7, bodyG * 0.7, bodyB * 0.7, 0.95);
    // Brass casing body
    this.addQuad(x, y + 3.5, w, h - 5.5, bodyR, bodyG, bodyB, 0.95);
    // Projectile tip triangle
    this.addTriangle(x, y + 3.5, x + w, y + 3.5, x + w * 0.5, y, tipR, tipG, tipB, 1.0);
  }

  private addProgressBar(
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    fgColor: [number, number, number],
    bgColor: [number, number, number] = [0.08, 0.12, 0.18]
  ): void {
    this.addQuad(x, y, w, h, bgColor[0], bgColor[1], bgColor[2], 0.8);
    const clampedPct = Math.max(0, Math.min(100, pct)) / 100;
    if (clampedPct > 0) {
      this.addQuad(x, y, w * clampedPct, h, fgColor[0], fgColor[1], fgColor[2], 0.95);
    }
    this.addBorder(x, y, w, h, 1, 0.0, 0.9, 1.0, 0.25);
  }

  private addText(text: string, x: number, y: number, opts: TextRenderOptions = {}): void {
    const entry = this.atlas.getOrDrawText(text, opts);
    const y2 = y + entry.height;
    const td = this.textData;

    // Subdivide wide text labels so they curve smoothly with the visor shader
    const segs = entry.width > 35 ? Math.min(6, Math.ceil(entry.width / 24)) : 1;
    if (segs === 1) {
      const x2 = x + entry.width;
      td.push(x, y, entry.u0, entry.v0, x2, y, entry.u1, entry.v0, x, y2, entry.u0, entry.v1);
      td.push(x, y2, entry.u0, entry.v1, x2, y, entry.u1, entry.v0, x2, y2, entry.u1, entry.v1);
    } else {
      const stepX = entry.width / segs;
      const stepU = (entry.u1 - entry.u0) / segs;
      for (let i = 0; i < segs; i++) {
        const sx1 = x + i * stepX;
        const sx2 = sx1 + stepX;
        const su1 = entry.u0 + i * stepU;
        const su2 = su1 + stepU;
        td.push(sx1, y, su1, entry.v0, sx2, y, su2, entry.v0, sx1, y2, su1, entry.v1);
        td.push(sx1, y2, su1, entry.v1, sx2, y, su2, entry.v0, sx2, y2, su2, entry.v1);
      }
    }
  }

  // fallow-ignore-next-line complexity
  private addButton(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts: TextRenderOptions,
    onClick?: () => void
  ): void {
    const isHovered = this.hitTester.isHovered(id);
    const bgR = isHovered ? 0.0 : 0.03;
    const bgG = isHovered ? 0.2 : 0.06;
    const bgB = isHovered ? 0.3 : 0.1;
    const alpha = isHovered ? 0.9 : 0.75;
    this.addQuad(x, y, w, h, bgR, bgG, bgB, alpha);
    this.addBorder(x, y, w, h, 1, 0.0, isHovered ? 1.0 : 0.8, 1.0, isHovered ? 0.9 : 0.4);

    const padX = Math.max(4, Math.floor((w - label.length * 7) / 2));
    this.addText(label, x + padX, y + Math.floor((h - 13) / 2), {
      ...opts,
      color: isHovered ? '#ffffff' : (opts.color ?? '#00e5ff'),
    });

    if (onClick) {
      this.hitTester.register({
        id,
        type: 'rect',
        x,
        y,
        width: w,
        height: h,
        cursor: 'pointer',
        onClick,
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderLowerLeftVitals(state: HudDrawState, width: number, height: number): void {
    const vitals = state.vitals;
    if (!vitals) return;

    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(52, Math.round(height * 0.065));
    const panelW = 260;
    const panelH = 120;
    const x = marginX;
    const y = height - panelH - marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 6, 0.03, 0.06, 0.1, 0.82);

    this.addText('SUIT TELEMETRY // CREW VITALS', x + 10, y + 8, {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    this.addText(`${state.pawn.callsign} [${state.pawn.role.toUpperCase()}]`, x + 10, y + 24, {
      fontSize: 10,
      color: state.pawn.color || '#ffb000',
    });

    // 1. Vitality / Health
    const hpCol: [number, number, number] =
      vitals.health < 25 ? [1.0, 0.13, 0.27] : [0.0, 0.9, 1.0];
    this.addText(`HEALTH: ${Math.round(vitals.health)}%`, x + 10, y + 40, {
      fontSize: 9,
      color: '#e0e6ed',
    });
    this.addProgressBar(x + 10, y + 51, panelW - 20, 5, vitals.health, hpCol);

    // 2. Stamina
    this.addText(
      `STAMINA: ${Math.round(vitals.stamina)} / ${Math.round(vitals.maxStamina)}`,
      x + 10,
      y + 59,
      { fontSize: 9, color: '#e0e6ed' }
    );
    this.addProgressBar(
      x + 10,
      y + 70,
      panelW - 20,
      5,
      (vitals.stamina / vitals.maxStamina) * 100,
      [0.0, 1.0, 0.4]
    );

    // 3. Nutrition & Hydration & Fatigue row
    const hungerCol: [number, number, number] =
      vitals.hunger < 20 ? [1.0, 0.13, 0.27] : [1.0, 0.69, 0.0];
    this.addText(`NUT: ${Math.round(vitals.hunger)}%`, x + 10, y + 78, {
      fontSize: 8,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 10, y + 88, 70, 4, vitals.hunger, hungerCol);

    const thirstCol: [number, number, number] =
      vitals.thirst < 20 ? [1.0, 0.13, 0.27] : [0.0, 0.9, 1.0];
    this.addText(`HYD: ${Math.round(vitals.thirst)}%`, x + 95, y + 78, {
      fontSize: 8,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 95, y + 88, 70, 4, vitals.thirst, thirstCol);

    const fatigueCol: [number, number, number] =
      vitals.fatigue > 80 ? [1.0, 0.13, 0.27] : [1.0, 0.69, 0.0];
    this.addText(`FTG: ${Math.round(vitals.fatigue)}%`, x + 180, y + 78, {
      fontSize: 8,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 180, y + 88, 68, 4, vitals.fatigue, fatigueCol);
    this.addText('[W][A][S][D] Locomotion  •  [E] Station Action', x + 10, y + 102, {
      fontSize: 8,
      color: '#55708a',
    });
  }

  // fallow-ignore-next-line complexity
  private renderLowerRightCombat(state: HudDrawState, width: number, height: number): void {
    const inter = state.activeInteraction;
    const eq = state.equippedWeapon ?? 'kinetic_carbine';
    const isKinetic = eq === 'kinetic_carbine';
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(52, Math.round(height * 0.065));
    const panelW = 250;
    const panelH = isKinetic ? (inter ? 142 : 106) : inter ? 125 : 84;
    const x = width - panelW - marginX;
    const y = height - panelH - marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 6, 0.03, 0.06, 0.1, 0.82);

    // Tool Header with hotkey hint
    this.addText('EQUIPPED TOOL // [1-3] SELECT', x + 10, y + 8, {
      fontSize: 9,
      fontWeight: 'bold',
      color: '#7088a0',
    });

    if (isKinetic) {
      const ammo = state.kineticAmmo ?? {
        current: 30,
        max: 30,
        reserve: 120,
        isReloading: false,
        reloadProgress: 0,
      };

      const reloadPct = Math.round((ammo.reloadProgress ?? 0) * 100);
      const statusText = ammo.isReloading
        ? `[RELOADING ${reloadPct}%]`
        : ammo.current < 8
          ? '[LOW AMMO - R TO RELOAD]'
          : '[R] RELOAD';
      const ammoCol = ammo.isReloading ? '#00e5ff' : ammo.current < 8 ? '#ff3344' : '#00ff88';

      this.addText('KINETIC CARBINE', x + 10, y + 18, {
        fontSize: 10,
        fontWeight: 'bold',
        color: ammoCol,
      });

      const resStr = ammo.reserve !== undefined ? `  RES: ${ammo.reserve}` : '';
      this.addText(`MAG: ${ammo.current}/${ammo.max}${resStr}  ${statusText}`, x + 10, y + 31, {
        fontSize: 8,
        color: '#c8d6e5',
      });

      // Render 30 individual cartridges in double-stack magazine rack (2 rows of 15)
      const isLow = ammo.current < 8 && !ammo.isReloading;
      const startX = x + 12;
      const colStep = 7.5;
      for (let i = 0; i < 30; i++) {
        const row = i < 15 ? 0 : 1;
        const col = i % 15;
        const bx = startX + col * colStep;
        const by = y + 44 + row * 14;

        let isBulletLoaded = i < ammo.current;
        if (ammo.isReloading) {
          const loadedCount = Math.floor((ammo.reloadProgress ?? 0) * ammo.max);
          isBulletLoaded = i < loadedCount;
        }

        this.addCartridge(bx, by, isBulletLoaded, ammo.isReloading, isLow);
      }
    } else if (eq === 'pulse_laser') {
      const ratio = state.chargingState?.active ? state.chargingState.ratio || 0 : 0;
      const pct = Math.round(ratio * 100);
      const isPrimed = ratio >= 0.8;
      const statusText = isPrimed
        ? '[CAPACITOR PRIMED]'
        : ratio > 0.05
          ? '[CHARGING]'
          : '[STANDBY]';
      const laserCol = isPrimed ? '#c084fc' : '#00e5ff';

      this.addText('PULSE LASER', x + 10, y + 20, {
        fontSize: 11,
        fontWeight: 'bold',
        color: laserCol,
      });

      this.addText(`CHARGE: ${pct}%  ${statusText}`, x + 10, y + 36, {
        fontSize: 9,
        color: '#e0e6ed',
      });
      const barCol: [number, number, number] = isPrimed ? [0.75, 0.3, 1.0] : [0.0, 0.9, 1.0];
      this.addProgressBar(x + 10, y + 48, panelW - 20, 5, Math.max(pct, 5), barCol);
    } else {
      // arc_welder
      const heat = state.welderThermal?.heat ?? 0;
      const isOverheated = state.welderThermal?.isOverheated ?? false;
      const heatPct = Math.round(heat * 100);
      const isWelding = Boolean(state.welderState?.active && !isOverheated);
      const statusText = isOverheated
        ? '[THERMAL LOCKOUT]'
        : isWelding
          ? '[DISCHARGING ARC]'
          : '[OPTIMAL]';
      const welderCol = isOverheated ? '#ff2244' : heat > 0.7 ? '#ffaa00' : '#ffb000';

      this.addText('ARC WELDER', x + 10, y + 20, {
        fontSize: 11,
        fontWeight: 'bold',
        color: welderCol,
      });

      this.addText(`HEAT: ${heatPct}%  ${statusText}`, x + 10, y + 36, {
        fontSize: 9,
        color: isOverheated ? '#ff3344' : '#e0e6ed',
      });
      const barCol: [number, number, number] =
        isOverheated || heat > 0.8
          ? [1.0, 0.13, 0.27]
          : heat > 0.4
            ? [1.0, 0.69, 0.0]
            : [0.0, 0.9, 1.0];
      this.addProgressBar(x + 10, y + 48, panelW - 20, 5, Math.max(heatPct, 4), barCol);
    }

    // Station Shift progress indicator (when active)
    const shiftY = isKinetic ? y + 76 : y + 60;
    if (inter) {
      const shiftPct = Math.round(inter.progress * 100);
      this.addText(`SHIFT: ${inter.actionName.toUpperCase()} (${shiftPct}%)`, x + 10, shiftY, {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#00e5ff',
      });
      this.addProgressBar(x + 10, shiftY + 11, panelW - 20, 4, shiftPct, [0.0, 0.9, 1.0]);
      this.addButton(
        'abort_shift',
        x + 10,
        shiftY + 20,
        panelW - 20,
        16,
        'ABORT SHIFT [ESC]',
        { fontSize: 8, color: '#ff2244' },
        state.onAbortInteraction
      );
      this.addText('[L-CLICK / SPACE] Discharge Weapon', x + 10, shiftY + 41, {
        fontSize: 8,
        color: '#506680',
      });
    } else {
      const hint = isKinetic
        ? '[L-CLICK / SPACE] Fire  •  [R] Reload'
        : '[L-CLICK / SPACE] Discharge Tool';
      this.addText(hint, x + 10, isKinetic ? y + 80 : y + 62, {
        fontSize: 8,
        color: '#506680',
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderTopVisor(state: HudDrawState, width: number, height: number): void {
    const telemetry = state.telemetry;
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const panelW = 270;
    const panelH = 34;
    const x = width - panelW - marginX;
    const y = marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 4, 0.02, 0.05, 0.08, 0.75);

    const shipName = telemetry?.shipName ?? 'CSS HESPERIA';
    this.addText(`VSSL: ${shipName}`, x + 10, y + 6, {
      fontSize: 9,
      fontWeight: 'bold',
      color: '#7090b0',
    });

    // Minimal navigation buttons: BCN, CREW, and DISEMBARK
    this.addButton(
      'btn_beacon',
      x + 10,
      y + 16,
      60,
      16,
      `BCN: ${state.beaconCode ?? 'HESP01'}`,
      { fontSize: 8 },
      state.onBeaconClick
    );
    this.addButton(
      'btn_crew',
      x + 74,
      y + 16,
      48,
      16,
      `CREW: ${state.crewCount ?? 1}`,
      { fontSize: 8 },
      state.onManifestClick
    );
    this.addButton('btn_role', x + 126, y + 16, 40, 16, 'ROLE', { fontSize: 8 }, state.onRoleClick);
    this.addButton(
      'btn_leave',
      x + 170,
      y + 16,
      95,
      16,
      'DISEMBARK',
      { fontSize: 8, color: '#ff4466' },
      state.onDisembarkClick
    );

    // Diegetic Alert Warning (Text indicator only, NO debug buttons to force-change it!)
    if (state.alertLevel === 'red') {
      this.addText('CONDITION: RED', x - 110, y + 12, {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#ff2244',
      });
    } else if (state.alertLevel === 'yellow') {
      this.addText('CONDITION: YELLOW', x - 125, y + 12, {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#ffaa00',
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderCenterAlerts(state: HudDrawState, width: number): void {
    const notice = state.inGameNotice || state.triageNotice;
    if (notice) {
      const bannerW = 380;
      const x = Math.floor((width - bannerW) / 2);
      this.addCurvedPanel(x, 18, bannerW, 26, 4, 0.05, 0.08, 0.12, 0.94);
      this.addText(notice, x + 12, 24, { fontSize: 10, fontWeight: 'bold', color: '#00e5ff' });
    }

    // Dual Protocol banner
    if (state.dualProtocol?.stage === 'primed') {
      const p = state.dualProtocol;
      const dpW = 400;
      const x = Math.floor((width - dpW) / 2);
      this.addCurvedPanel(x, 50, dpW, 30, 4, 0.15, 0.02, 0.04, 0.95);
      this.addText(`DUAL PROTOCOL: ${p.title} (${p.remainingSeconds.toFixed(1)}s)`, x + 12, 58, {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#ff2244',
      });
      this.addButton(
        'btn_exec_dual',
        x + dpW - 130,
        54,
        120,
        22,
        'EXECUTE [E]',
        { fontSize: 9, color: '#00ff66' },
        state.onExecuteDualProtocol
      );
    }

    // Collaborative Shift banner
    if (
      state.collabShift &&
      !state.collabShift.isCompleted &&
      state.collabShift.participants.length > 0
    ) {
      const cs = state.collabShift;
      const csW = 420;
      const x = Math.floor((width - csW) / 2);
      this.addCurvedPanel(x, 86, csW, 28, 4, 0.04, 0.08, 0.12, 0.92);
      this.addText(
        `CO-OP SHIFT: ${cs.title} (${Math.round(cs.progressPercent)}%) [${cs.participants.length} OPS]`,
        x + 12,
        93,
        {
          fontSize: 10,
          color: '#00e5ff',
        }
      );
    }
  }

  // fallow-ignore-next-line complexity
  private renderWorldNametags(
    pawns: PawnState[],
    camera: { x: number; y: number },

    width: number,
    height: number,
    losPoly: Point2D[]
  ): void {
    const halfW = width / 2;
    const halfH = height / 2;

    for (const p of pawns) {
      if (losPoly.length >= 3 && !isPointInPolygon({ x: p.x, y: p.y }, losPoly)) continue;
      const sx = halfW + (p.x - camera.x);
      const sy = halfH + (p.y - camera.y) - 26;

      const tagText = `${p.callsign} [${p.role.toUpperCase()}]`;
      const col = p.color || '#00e5ff';
      const approxW = tagText.length * 6.5 + 12;
      const startX = sx - approxW / 2;

      this.addQuad(startX, sy, approxW, 16, 0.02, 0.04, 0.08, 0.88);
      this.addBorder(startX, sy, approxW, 16, 1, 0.0, 0.9, 1.0, 0.6);
      this.addText(tagText, startX + 6, sy + 2, { fontSize: 9, fontWeight: 'bold', color: col });
    }
  }

  // fallow-ignore-next-line complexity
  public render(
    state: HudDrawState,
    width: number,
    height: number,
    timeSec: number,
    losPoly: Point2D[]
  ): void {
    const gl = this.gl;
    this.hitTester.clear();
    this.vectorData = [];
    this.textData = [];

    const curvature = 0.055;

    if (state.mouseScreen) {
      this.hitTester.updateHover(
        state.mouseScreen.x,
        state.mouseScreen.y,
        width,
        height,
        curvature
      );
    }

    // 1. VISOR GLASS SHADER PASS
    gl.useProgram(this.visorProg);
    gl.bindVertexArray(this.visorVAO);
    gl.uniform2f(gl.getUniformLocation(this.visorProg, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(this.visorProg, 'u_time'), timeSec);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // 2. COMPOSE HUD WIDGETS
    this.renderLowerLeftVitals(state, width, height);
    this.renderLowerRightCombat(state, width, height);
    this.renderTopVisor(state, width, height);
    this.renderCenterAlerts(state, width);

    const pawnsToTag = [state.pawn, ...(state.remotePawns || [])];
    this.renderWorldNametags(pawnsToTag, state.camera, width, height, losPoly);

    const screenMat = createScreenMatrix(width, height);

    // 3. VECTOR HUD PASS (with helmet visor barrel curvature)
    if (this.vectorData.length > 0) {
      gl.useProgram(this.vectorProg);
      gl.bindVertexArray(this.vectorVAO);
      gl.uniformMatrix3fv(gl.getUniformLocation(this.vectorProg, 'u_matrix'), false, screenMat);
      gl.uniform1f(gl.getUniformLocation(this.vectorProg, 'u_glow'), 0.2);
      gl.uniform1f(gl.getUniformLocation(this.vectorProg, 'u_curvature'), curvature);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vectorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vectorData), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.vectorData.length / 6);
      gl.bindVertexArray(null);
    }

    // 4. TEXT ATLAS HUD PASS (with helmet visor barrel curvature)
    if (this.textData.length > 0) {
      this.atlas.syncTexture(gl, this.atlasTexture);

      gl.useProgram(this.textProg);
      gl.bindVertexArray(this.textVAO);
      gl.uniformMatrix3fv(gl.getUniformLocation(this.textProg, 'u_matrix'), false, screenMat);
      gl.uniform4f(gl.getUniformLocation(this.textProg, 'u_tint'), 1.0, 1.0, 1.0, 1.0);
      gl.uniform1f(gl.getUniformLocation(this.textProg, 'u_curvature'), curvature);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.uniform1i(gl.getUniformLocation(this.textProg, 'u_atlas'), 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.textData), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.textData.length / 4);
      gl.bindVertexArray(null);
    }
  }
}
