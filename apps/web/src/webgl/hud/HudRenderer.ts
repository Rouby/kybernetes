import type {
  BoardingTacticsTelemetry,
  DualProtocolBroadcast,
  PawnState,
  PlayerVitals,
  ShiftChecklistState,
  ShiftEvaluationGrade,
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
  shiftChecklist?: ShiftChecklistState;
  projectedGrade?: ShiftEvaluationGrade;
  shiftTimerFormatted?: string;

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
  onAudioClick?: () => void;
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
    const w = 7.5;
    const h = 18;

    if (!isLoaded) {
      this.addBorder(x, y + 4.5, w, h - 4.5, 1, 0.2, 0.3, 0.4, 0.22);
      return;
    }

    let bodyR = 0.82;
    let bodyG = 0.65;
    let bodyB = 0.22;
    let tipR = 1.0;
    let tipG = 0.42;
    let tipB = 0.18;

    if (isReloading) {
      bodyR = 0.2;
      bodyG = 0.85;
      bodyB = 1.0;
      tipR = 0.6;
      tipG = 0.95;
      tipB = 1.0;
    } else if (isLowAmmo) {
      bodyR = 0.95;
      bodyG = 0.25;
      bodyB = 0.2;
      tipR = 1.0;
      tipG = 0.55;
      tipB = 0.2;
    }

    this.addQuad(x - 0.75, y + h - 3, w + 1.5, 3, bodyR * 0.7, bodyG * 0.7, bodyB * 0.7, 0.95);
    this.addQuad(x, y + 5.25, w, h - 8.25, bodyR, bodyG, bodyB, 0.95);
    this.addTriangle(x, y + 5.25, x + w, y + 5.25, x + w * 0.5, y, tipR, tipG, tipB, 1.0);
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
    const segs = entry.width > 70 ? Math.min(8, Math.ceil(entry.width / 48)) : 1;
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

    const fontSize = opts.fontSize ?? 16;
    const charW = fontSize * 0.6;
    const padX = Math.max(4, Math.floor((w - label.length * charW) / 2));
    const padY = Math.max(1, Math.floor((h - fontSize) / 2) - 1);
    this.addText(label, x + padX, y + padY, {
      ...opts,
      fontSize,
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
    const panelW = 390;
    const panelH = 180;
    const x = marginX;
    const y = height - panelH - marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 9, 0.03, 0.06, 0.1, 0.82);

    this.addText('SUIT TELEMETRY // CREW VITALS', x + 15, y + 12, {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    this.addText(`${state.pawn.callsign} [${state.pawn.role.toUpperCase()}]`, x + 15, y + 38, {
      fontSize: 20,
      color: state.pawn.color || '#ffb000',
    });

    // 1. Vitality / Health
    const hpCol: [number, number, number] =
      vitals.health < 25 ? [1.0, 0.13, 0.27] : [0.0, 0.9, 1.0];
    this.addText(`HEALTH: ${Math.round(vitals.health)}%`, x + 15, y + 62, {
      fontSize: 18,
      color: '#e0e6ed',
    });
    this.addProgressBar(x + 15, y + 80, panelW - 30, 8, vitals.health, hpCol);

    // 2. Stamina
    this.addText(
      `STAMINA: ${Math.round(vitals.stamina)} / ${Math.round(vitals.maxStamina)}`,
      x + 15,
      y + 92,
      { fontSize: 18, color: '#e0e6ed' }
    );
    this.addProgressBar(
      x + 15,
      y + 110,
      panelW - 30,
      8,
      (vitals.stamina / vitals.maxStamina) * 100,
      [0.0, 1.0, 0.4]
    );

    // 3. Nutrition & Hydration & Fatigue row
    const hungerCol: [number, number, number] =
      vitals.hunger < 20 ? [1.0, 0.13, 0.27] : [1.0, 0.69, 0.0];
    this.addText(`NUT: ${Math.round(vitals.hunger)}%`, x + 15, y + 124, {
      fontSize: 16,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 15, y + 142, 110, 6, vitals.hunger, hungerCol);

    const thirstCol: [number, number, number] =
      vitals.thirst < 20 ? [1.0, 0.13, 0.27] : [0.0, 0.9, 1.0];
    this.addText(`HYD: ${Math.round(vitals.thirst)}%`, x + 140, y + 124, {
      fontSize: 16,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 140, y + 142, 110, 6, vitals.thirst, thirstCol);

    const fatigueCol: [number, number, number] =
      vitals.fatigue > 80 ? [1.0, 0.13, 0.27] : [1.0, 0.69, 0.0];
    this.addText(`FTG: ${Math.round(vitals.fatigue)}%`, x + 265, y + 124, {
      fontSize: 16,
      color: '#c0d0e0',
    });
    this.addProgressBar(x + 265, y + 142, 110, 6, vitals.fatigue, fatigueCol);
    this.addText('[W][A][S][D] Locomotion  •  [E] Station Action', x + 15, y + 156, {
      fontSize: 16,
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
    const panelW = 375;
    const panelH = isKinetic ? (inter ? 220 : 160) : inter ? 190 : 130;
    const x = width - panelW - marginX;
    const y = height - panelH - marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 9, 0.03, 0.06, 0.1, 0.82);

    // Tool Header with hotkey hint
    this.addText('EQUIPPED TOOL // [1-3] SELECT', x + 15, y + 12, {
      fontSize: 18,
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

      this.addText('KINETIC CARBINE', x + 15, y + 36, {
        fontSize: 20,
        fontWeight: 'bold',
        color: ammoCol,
      });

      const resStr = ammo.reserve !== undefined ? `  RES: ${ammo.reserve}` : '';
      this.addText(`MAG: ${ammo.current}/${ammo.max}${resStr}  ${statusText}`, x + 15, y + 58, {
        fontSize: 16,
        color: '#c8d6e5',
      });

      // Render 30 individual cartridges in double-stack magazine rack (2 rows of 15)
      const isLow = ammo.current < 8 && !ammo.isReloading;
      const startX = x + 18;
      const colStep = 11.25;
      for (let i = 0; i < 30; i++) {
        const row = i < 15 ? 0 : 1;
        const col = i % 15;
        const bx = startX + col * colStep;
        const by = y + 78 + row * 21;

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

      this.addText('PULSE LASER', x + 15, y + 36, {
        fontSize: 22,
        fontWeight: 'bold',
        color: laserCol,
      });

      this.addText(`CHARGE: ${pct}%  ${statusText}`, x + 15, y + 60, {
        fontSize: 18,
        color: '#e0e6ed',
      });
      const barCol: [number, number, number] = isPrimed ? [0.75, 0.3, 1.0] : [0.0, 0.9, 1.0];
      this.addProgressBar(x + 15, y + 80, panelW - 30, 8, Math.max(pct, 5), barCol);
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

      this.addText('ARC WELDER', x + 15, y + 36, {
        fontSize: 22,
        fontWeight: 'bold',
        color: welderCol,
      });

      this.addText(`HEAT: ${heatPct}%  ${statusText}`, x + 15, y + 60, {
        fontSize: 18,
        color: isOverheated ? '#ff3344' : '#e0e6ed',
      });
      const barCol: [number, number, number] =
        isOverheated || heat > 0.8
          ? [1.0, 0.13, 0.27]
          : heat > 0.4
            ? [1.0, 0.69, 0.0]
            : [0.0, 0.9, 1.0];
      this.addProgressBar(x + 15, y + 80, panelW - 30, 8, Math.max(heatPct, 4), barCol);
    }

    // Station Shift progress indicator (when active)
    const shiftY = isKinetic ? y + 124 : y + 96;
    if (inter) {
      const shiftPct = Math.round(inter.progress * 100);
      this.addText(`SHIFT: ${inter.actionName.toUpperCase()} (${shiftPct}%)`, x + 15, shiftY, {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00e5ff',
      });
      this.addProgressBar(x + 15, shiftY + 18, panelW - 30, 6, shiftPct, [0.0, 0.9, 1.0]);
      this.addButton(
        'abort_shift',
        x + 15,
        shiftY + 30,
        panelW - 30,
        24,
        'ABORT SHIFT [ESC]',
        { fontSize: 16, color: '#ff2244' },
        state.onAbortInteraction
      );
      this.addText('[L-CLICK / SPACE] Discharge Weapon', x + 15, shiftY + 62, {
        fontSize: 16,
        color: '#506680',
      });
    } else {
      const hint = isKinetic
        ? '[L-CLICK / SPACE] Fire  •  [R] Reload'
        : '[L-CLICK / SPACE] Discharge Tool';
      this.addText(hint, x + 15, isKinetic ? y + 128 : y + 98, {
        fontSize: 16,
        color: '#506680',
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderTopVisor(state: HudDrawState, width: number, height: number): void {
    const telemetry = state.telemetry;
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const panelW = 475;
    const panelH = 54;
    const x = width - panelW - marginX;
    const y = marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 6, 0.02, 0.05, 0.08, 0.75);

    const shipName = telemetry?.shipName ?? 'CSS HESPERIA';
    this.addText(`VSSL: ${shipName}`, x + 14, y + 4, {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#7090b0',
    });

    // Minimal navigation buttons: BCN, CREW, ROLE, AUDIO, and DISEMBARK
    this.addButton(
      'btn_beacon',
      x + 10,
      y + 21,
      85,
      27,
      `BCN: ${state.beaconCode ?? 'HESP01'}`,
      { fontSize: 14 },
      state.onBeaconClick
    );
    this.addButton(
      'btn_crew',
      x + 100,
      y + 21,
      75,
      27,
      `CREW: ${state.crewCount ?? 1}`,
      { fontSize: 14 },
      state.onManifestClick
    );
    this.addButton(
      'btn_role',
      x + 180,
      y + 21,
      55,
      27,
      'ROLE',
      { fontSize: 14 },
      state.onRoleClick
    );
    this.addButton(
      'btn_audio',
      x + 240,
      y + 21,
      85,
      27,
      'AUDIO [O]',
      { fontSize: 13, color: '#00e5ff' },
      state.onAudioClick
    );
    this.addButton(
      'btn_leave',
      x + 330,
      y + 21,
      135,
      27,
      'DISEMBARK',
      { fontSize: 14, color: '#ff4466' },
      state.onDisembarkClick
    );

    // Diegetic Alert Warning (Text indicator only, NO debug buttons to force-change it!)
    if (state.alertLevel === 'red') {
      this.addText('CONDITION: RED', x - 170, y + 16, {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff2244',
      });
    } else if (state.alertLevel === 'yellow') {
      this.addText('CONDITION: YELLOW', x - 195, y + 16, {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffaa00',
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderTopLeftShiftChecklist(state: HudDrawState, width: number, height: number): void {
    const shift = state.shiftChecklist;
    if (!shift) return;

    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const panelW = 405;
    const panelH = 140;
    const x = marginX;
    const y = marginY;

    this.addCurvedPanel(x, y, panelW, panelH, 6, 0.02, 0.05, 0.08, 0.82);

    this.addText(`DEPARTMENTAL SHIFT #${shift.shiftNumber}`, x + 15, y + 10, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#00e5ff',
    });

    const grade = state.projectedGrade || 'A';
    const timer = state.shiftTimerFormatted || '00:00';
    const gradeColor =
      grade === 'S' ? '#00ff88' : grade === 'A' ? '#00e5ff' : grade === 'B' ? '#ffb000' : '#ff3344';

    this.addText(`RATING: [${grade}]  TIME: ${timer}`, x + 15, y + 36, {
      fontSize: 16,
      color: gradeColor,
    });

    for (let i = 0; i < shift.tasks.length; i++) {
      const task = shift.tasks[i];
      const ty = y + 60 + i * 26;
      const isDone = task.completed;
      const isActive = i === shift.currentTaskIndex && !shift.isCompleted;

      let prefix = '[ ] ';
      let col = '#55708a';
      if (isDone) {
        prefix = '[X] ';
        col = '#00ff88';
      } else if (isActive) {
        prefix = '[>] ';
        col = '#00e5ff';
      }

      this.addText(`${prefix}${task.name}`, x + 15, ty, {
        fontSize: 16,
        fontWeight: isActive ? 'bold' : 'normal',
        color: col,
      });
    }
  }

  // fallow-ignore-next-line complexity
  private renderCenterAlerts(state: HudDrawState, width: number): void {
    const notice = state.inGameNotice || state.triageNotice;
    if (notice) {
      const bannerW = 570;
      const x = Math.floor((width - bannerW) / 2);
      this.addCurvedPanel(x, 18, bannerW, 40, 6, 0.05, 0.08, 0.12, 0.94);
      this.addText(notice, x + 16, 26, { fontSize: 20, fontWeight: 'bold', color: '#00e5ff' });
    }

    // Dual Protocol banner
    if (state.dualProtocol?.stage === 'primed') {
      const p = state.dualProtocol;
      const dpW = 600;
      const x = Math.floor((width - dpW) / 2);
      this.addCurvedPanel(x, 66, dpW, 45, 6, 0.15, 0.02, 0.04, 0.95);
      this.addText(`DUAL PROTOCOL: ${p.title} (${p.remainingSeconds.toFixed(1)}s)`, x + 16, 76, {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ff2244',
      });
      this.addButton(
        'btn_exec_dual',
        x + dpW - 195,
        72,
        180,
        33,
        'EXECUTE [E]',
        { fontSize: 18, color: '#00ff66' },
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
      const csW = 630;
      const x = Math.floor((width - csW) / 2);
      this.addCurvedPanel(x, 118, csW, 42, 6, 0.04, 0.08, 0.12, 0.92);
      this.addText(
        `CO-OP SHIFT: ${cs.title} (${Math.round(cs.progressPercent)}%) [${cs.participants.length} OPS]`,
        x + 16,
        127,
        {
          fontSize: 20,
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
      const sy = halfH + (p.y - camera.y) - 36;

      const tagText = `${p.callsign} [${p.role.toUpperCase()}]`;
      const col = p.color || '#00e5ff';
      const approxW = tagText.length * 11 + 20;
      const startX = sx - approxW / 2;

      this.addQuad(startX, sy, approxW, 24, 0.02, 0.04, 0.08, 0.88);
      this.addBorder(startX, sy, approxW, 24, 1, 0.0, 0.9, 1.0, 0.6);
      this.addText(tagText, startX + 8, sy + 3, { fontSize: 18, fontWeight: 'bold', color: col });

      // Render floating speech bubble if active
      if (p.speechBubble && p.speechBubble.expiresAt > Date.now()) {
        const bubbleText = `"${p.speechBubble.text}"`;
        const bWidth = Math.min(420, bubbleText.length * 9.5 + 24);
        const bHeight = 28;
        const bX = sx - bWidth / 2;
        const bY = sy - 34;

        let br = 0.0;
        let bg = 0.9;
        let bb = 1.0;
        if (p.color?.startsWith('#') && p.color.length >= 7) {
          br = parseInt(p.color.slice(1, 3), 16) / 255;
          bg = parseInt(p.color.slice(3, 5), 16) / 255;
          bb = parseInt(p.color.slice(5, 7), 16) / 255;
        }

        this.addQuad(bX, bY, bWidth, bHeight, 0.02, 0.05, 0.09, 0.94);
        this.addBorder(bX, bY, bWidth, bHeight, 1, br, bg, bb, 0.85);
        this.addText(bubbleText, bX + 10, bY + 4, {
          fontSize: 16,
          color: '#ffffff',
        });
      }
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

    this.hitTester.clear();
    this.vectorData = [];
    this.textData = [];

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
    this.renderTopLeftShiftChecklist(state, width, height);
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
