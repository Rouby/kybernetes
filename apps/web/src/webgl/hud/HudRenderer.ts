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
import { getDisplayValue } from '../ui/TextFieldModel';
import {
  GL_UI_BLOCKER_ID,
  hexToRgb,
  splashStarCount,
  splashStarField,
  uiTextHex,
} from '../ui/UiPass';
import type { UiScreenLayout } from '../ui/UiScreens';
import type { UiButtonDetail, UiField, UiRect, UiSwatch } from '../ui/UiToolkit';
import { pickHoveredCrew, resolveCrewDossier } from './crewDossier';
import { GLYPH_BAKE_PX, HudAtlas, type TextRenderOptions } from './HudAtlas';
import { HudHitTester } from './HudHitTester';
import type { LivingSummary } from './livingFormatters';
import type { WidgetHost } from './WidgetHost';
import { AlertsWidget } from './widgets/AlertsWidget';
import { ChecklistWidget } from './widgets/ChecklistWidget';
import { CombatWidget } from './widgets/CombatWidget';
import { HeaderWidget } from './widgets/HeaderWidget';
import { VitalsWidget } from './widgets/VitalsWidget';

export interface HudDrawState {
  pawn: PawnState;
  remotePawns?: PawnState[];
  vitals?: PlayerVitals;
  telemetry?: TelemetryDeltaBroadcast;
  boarding?: BoardingTacticsTelemetry;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  nearestStation?: StationFixture | null;
  promptActionName?: string;
  livingSummary?: LivingSummary;
  mealBuffS?: number;
  activeInteraction?: ActiveInteraction | null;
  beaconCode?: string;
  crewCount?: number;
  clearanceLevel?: number;
  clearanceXp?: number;
  credits?: number;
  equippedWeapon?: WeaponType;
  zoom?: number;
  kineticAmmo?: {
    current: number;
    max: number;
    reserve?: number;
    isReloading: boolean;
    reloadProgress?: number;
  };
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
  onToggleHelmet?: () => void;
  onRefillSuit?: () => void;
  currentRoomId?: string;
  /** Pack bench open: ambient widgets yield so the bench reads clean. */
  packOpen?: boolean;
  /** Star chart open: ambient widgets yield so the map reads clean. */
  chartOpen?: boolean;
  /** Modal GL screen painted last. Null/undefined skips it. */
  uiOverlay?: {
    readonly layout: UiScreenLayout;
    readonly onAction?: (id: string) => void;
  } | null;
}

/** Steady-state vertex capacity per HUD pass; grown on demand, never per frame. */
const HUD_SCRATCH_FLOATS = 1 << 20;

function nextScratchSize(needed: number): number {
  let size = HUD_SCRATCH_FLOATS;
  while (size < needed) size *= 2;
  return size;
}

function bubbleBorder(color: string | undefined): [number, number, number] {
  if (color?.startsWith('#') && color.length >= 7) {
    return [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
  }
  return [0.0, 0.9, 1.0];
}

function cartridgePalette(
  isReloading: boolean,
  isLowAmmo: boolean
): { body: [number, number, number]; tip: [number, number, number] } {
  if (isReloading) return { body: [0.2, 0.85, 1.0], tip: [0.6, 0.95, 1.0] };
  if (isLowAmmo) return { body: [0.95, 0.25, 0.2], tip: [1.0, 0.55, 0.2] };
  return { body: [0.82, 0.65, 0.22], tip: [1.0, 0.42, 0.18] };
}

export interface SplashInput {
  readonly mouse?: { x: number; y: number };
  readonly focusId?: string;
}

export class HudRenderer implements WidgetHost {
  private gl: WebGL2RenderingContext;
  private readonly headerWidget = new HeaderWidget();
  private readonly vitalsWidget = new VitalsWidget();
  private readonly combatWidget = new CombatWidget();
  private readonly checklistWidget = new ChecklistWidget();
  private readonly alertsWidget = new AlertsWidget();
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
  private vectorScratch = new Float32Array(HUD_SCRATCH_FLOATS);

  private textBuffer: WebGLBuffer;
  private textVAO: WebGLVertexArrayObject;
  private textData: number[] = [];
  private textScratch = new Float32Array(HUD_SCRATCH_FLOATS);

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

    // 3. Text HUD geometry (x, y, u, v, r, g, b, a) with pre-allocated storage
    this.textBuffer = gl.createBuffer()!;
    this.textVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.textVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, HUD_SCRATCH_FLOATS * 4, gl.STREAM_DRAW);
    const textPos = gl.getAttribLocation(this.textProg, 'a_position');
    const textUv = gl.getAttribLocation(this.textProg, 'a_uv');
    const textCol = gl.getAttribLocation(this.textProg, 'a_color');
    gl.enableVertexAttribArray(textPos);
    gl.vertexAttribPointer(textPos, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(textUv);
    gl.vertexAttribPointer(textUv, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(textCol);
    gl.vertexAttribPointer(textCol, 4, gl.FLOAT, false, 32, 16);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vectorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, HUD_SCRATCH_FLOATS * 4, gl.STREAM_DRAW);

    gl.bindVertexArray(null);
    this.atlas.uploadAtlas(gl, this.atlasTexture);
  }

  /** Grow-once scratch views; steady-state frames copy without allocating. */
  private vectorView(): Float32Array {
    if (this.vectorScratch.length < this.vectorData.length) {
      this.vectorScratch = new Float32Array(nextScratchSize(this.vectorData.length));
    }
    return this.vectorScratch;
  }

  private textView(): Float32Array {
    if (this.textScratch.length < this.textData.length) {
      this.textScratch = new Float32Array(nextScratchSize(this.textData.length));
    }
    return this.textScratch;
  }

  public getHitTester(): HudHitTester {
    return this.hitTester;
  }

  /** Release every GL object owned by the HUD: 3 programs, 3 VAOs, 3 buffers, atlas texture. */
  public dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.visorProg);
    gl.deleteProgram(this.vectorProg);
    gl.deleteProgram(this.textProg);
    gl.deleteVertexArray(this.visorVAO);
    gl.deleteVertexArray(this.vectorVAO);
    gl.deleteVertexArray(this.textVAO);
    gl.deleteBuffer(this.fsQuadBuffer);
    gl.deleteBuffer(this.vectorBuffer);
    gl.deleteBuffer(this.textBuffer);
    gl.deleteTexture(this.atlasTexture);
  }

  public addQuad(
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

  public addTriangle(
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
  public addBorder(
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

  public addCurvedPanel(
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

  public addCartridge(
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
    const { body, tip } = cartridgePalette(isReloading, isLowAmmo);
    this.addQuad(
      x - 0.75,
      y + h - 3,
      w + 1.5,
      3,
      body[0] * 0.7,
      body[1] * 0.7,
      body[2] * 0.7,
      0.95
    );
    this.addQuad(x, y + 5.25, w, h - 8.25, body[0], body[1], body[2], 0.95);
    this.addTriangle(x, y + 5.25, x + w, y + 5.25, x + w * 0.5, y, tip[0], tip[1], tip[2], 1.0);
  }

  public addProgressBar(
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

  private pushGlyphQuad(
    gx: number,
    y: number,
    gw: number,
    gh: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r: number,
    g: number,
    b: number
  ): void {
    const y2 = y + gh;
    const x2 = gx + gw;
    const td = this.textData;
    td.push(gx, y, u0, v0, r, g, b, 1, x2, y, u1, v0, r, g, b, 1, gx, y2, u0, v1, r, g, b, 1);
    td.push(gx, y2, u0, v1, r, g, b, 1, x2, y, u1, v0, r, g, b, 1, x2, y2, u1, v1, r, g, b, 1);
  }

  /** Glyph-quad text: per-character quads from the pre-baked atlas (no raster, no upload). */
  public addText(text: string, x: number, y: number, opts: TextRenderOptions = {}): void {
    const fontSize = opts.fontSize ?? 22;
    const scale = fontSize / GLYPH_BAKE_PX;
    const [r, g, b] = hexToRgb(opts.color ?? '#00e5ff');
    const gw = this.atlas.cellW * scale;
    const gh = this.atlas.cellH * scale;
    const inset = this.atlas.padXPx * scale;
    const step = this.atlas.advancePx * scale;
    const passes = opts.fontWeight === 'bold' ? 2 : 1;
    for (let pass = 0; pass < passes; pass += 1) {
      let penX = x + (pass === 1 ? Math.max(1, scale) : 0);
      for (const ch of text) {
        const uv = this.atlas.glyphUvs(this.atlas.glyphIndexFor(ch.codePointAt(0) ?? 63));
        this.pushGlyphQuad(penX - inset, y, gw, gh, uv.u0, uv.v0, uv.u1, uv.v1, r, g, b);
        penX += step;
      }
    }
  }

  public addButton(
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
    this.paintButtonChrome(x, y, w, h, isHovered);
    this.paintButtonLabel(x, y, w, h, label, opts, isHovered);
    if (onClick) this.registerButton(id, x, y, w, h, onClick);
  }

  private paintButtonChrome(x: number, y: number, w: number, h: number, hovered: boolean): void {
    const bg: [number, number, number] = hovered ? [0.0, 0.2, 0.3] : [0.03, 0.06, 0.1];
    this.addQuad(x, y, w, h, bg[0], bg[1], bg[2], hovered ? 0.9 : 0.75);
    this.addBorder(x, y, w, h, 1, 0.0, hovered ? 1.0 : 0.8, 1.0, hovered ? 0.9 : 0.4);
  }

  private paintButtonLabel(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts: TextRenderOptions,
    hovered: boolean
  ): void {
    const fontSize = opts.fontSize ?? 16;
    const charW = fontSize * 0.6;
    const padX = Math.max(4, Math.floor((w - label.length * charW) / 2));
    const padY = Math.max(1, Math.floor((h - fontSize) / 2) - 1);
    this.addText(label, x + padX, y + padY, {
      ...opts,
      fontSize,
      color: hovered ? '#ffffff' : (opts.color ?? '#00e5ff'),
    });
  }

  private registerButton(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    onClick: () => void
  ): void {
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

  private renderWorldSpeechBubbles(
    pawns: PawnState[],
    camera: { x: number; y: number },
    width: number,
    height: number,
    losPoly: Point2D[],
    zoom = 1.0
  ): void {
    for (const p of pawns) {
      if (losPoly.length >= 3 && !isPointInPolygon({ x: p.x, y: p.y }, losPoly)) continue;
      if (!p.speechBubble || p.speechBubble.expiresAt <= Date.now()) continue;
      this.renderSpeechBubble(p, camera, width, height, zoom);
    }
  }

  private renderSpeechBubble(
    p: PawnState,
    camera: { x: number; y: number },
    width: number,
    height: number,
    zoom: number
  ): void {
    const sx = Math.round(width / 2 + (p.x - camera.x) * zoom);
    const sy = Math.round(height / 2 + (p.y - camera.y) * zoom - 30 * zoom);
    const bubbleText = `"${p.speechBubble?.text ?? ''}"`;
    const bWidth = Math.min(420, bubbleText.length * 9.5 + 24);
    const [br, bg, bb] = bubbleBorder(p.color);
    this.addQuad(sx - bWidth / 2, sy - 30, bWidth, 28, 0.02, 0.05, 0.09, 0.94);
    this.addBorder(sx - bWidth / 2, sy - 30, bWidth, 28, 1, br, bg, bb, 0.85);
    this.addText(bubbleText, sx - bWidth / 2 + 10, sy - 26, { fontSize: 16, color: '#ffffff' });
  }

  private findHoveredCrewMember(
    state: HudDrawState,
    width: number,
    height: number,
    losPoly: Point2D[]
  ): PawnState | null {
    const picked = pickHoveredCrew(
      state.remotePawns ?? [],
      state.pawn,
      state.camera,
      width / 2,
      height / 2,
      state.mouseWorld,
      state.mouseScreen,
      state.zoom ?? 1.0,
      losPoly
    );
    return picked ?? null;
  }

  private renderHoverReticle(
    p: PawnState,
    camera: { x: number; y: number },
    width: number,
    height: number,
    zoom = 1.0
  ): void {
    const halfW = width / 2;
    const halfH = height / 2;
    const sx = Math.round(halfW + (p.x - camera.x) * zoom);
    const sy = Math.round(halfH + (p.y - camera.y) * zoom);
    const r = Math.round(20 * zoom);
    const arm = Math.max(4, Math.round(6 * zoom));

    this.addQuad(sx - r, sy - r, arm, 1.5, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx - r, sy - r, 1.5, arm, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx + r - arm, sy - r, arm, 1.5, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx + r - 1.5, sy - r, 1.5, arm, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx - r, sy + r - 1.5, arm, 1.5, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx - r, sy + r - arm, 1.5, arm, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx + r - arm, sy + r - 1.5, arm, 1.5, 0.0, 0.9, 1.0, 0.85);
    this.addQuad(sx + r - 1.5, sy + r - arm, 1.5, arm, 0.0, 0.9, 1.0, 0.85);
  }

  private renderCrewDossierWidget(p: PawnState, width: number, height: number): void {
    const dossier = resolveCrewDossier(p);
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const panelW = 420;
    const panelH = 175;
    const x = width - panelW - marginX;
    const y = marginY + 68;
    this.addCurvedPanel(x, y, panelW, panelH, 6, 0.02, 0.05, 0.09, 0.9);
    this.renderDossierIdentity(dossier, x, y);
    this.renderDossierRecord(dossier, x, y, panelW);
  }

  private renderDossierIdentity(
    dossier: ReturnType<typeof resolveCrewDossier>,
    x: number,
    y: number
  ): void {
    this.addText('CREW DOSSIER // VISOR SCAN', x + 15, y + 10, {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#00e5ff',
    });
    this.addText(dossier.callsign, x + 15, y + 32, {
      fontSize: 18,
      fontWeight: 'bold',
      color: dossier.color,
    });
    this.addText(dossier.rank, x + 15, y + 54, { fontSize: 13, color: '#a0c0e0' });
    this.addText(dossier.department, x + 15, y + 72, { fontSize: 12, color: '#7090b0' });
  }

  private renderDossierRecord(
    dossier: ReturnType<typeof resolveCrewDossier>,
    x: number,
    y: number,
    panelW: number
  ): void {
    this.addText(`DUTY: ${dossier.status}`, x + 15, y + 92, {
      fontSize: 12,
      fontWeight: 'bold',
      color: '#00ff88',
    });
    this.addQuad(x + 15, y + 112, panelW - 30, 1, 0.0, 0.9, 1.0, 0.25);
    this.addText('SERVICE RECORD // NOTES:', x + 15, y + 118, { fontSize: 11, color: '#55708a' });
    this.addText(dossier.bioLine1, x + 15, y + 134, { fontSize: 12, color: '#e0e8f0' });
    this.addText(dossier.bioLine2, x + 15, y + 150, { fontSize: 12, color: '#8fa5b8' });
  }

  private renderUiOverlay(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined,
    width: number,
    height: number,
    nowMs: number
  ): void {
    if (layout.bare === true) this.overlayBlocker(width, height);
    else this.overlayBackdrop(width, height);
    this.overlayCard(layout, onAction, nowMs);
  }

  private overlayCard(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined,
    nowMs: number
  ): void {
    this.overlayPanel(layout);
    this.overlayTexts(layout);
    this.overlaySwatches(layout, onAction);
    this.overlayFields(layout, onAction, nowMs);
    this.overlayButtons(layout, onAction);
  }

  private overlaySwatches(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined
  ): void {
    for (const swatch of layout.swatches ?? []) this.paintSwatch(swatch, onAction);
  }

  private paintSwatch(swatch: UiSwatch, onAction: ((id: string) => void) | undefined): void {
    const { x, y, w, h } = swatch.rect;
    const [r, g, b] = hexToRgb(swatch.color);
    this.addQuad(x, y, w, h, r, g, b, 1);
    if (swatch.selected) this.addBorder(x, y, w, h, 2, 0, 0.9, 1, 0.95);
    else this.addBorder(x, y, w, h, 1, 0.18, 0.26, 0.37, 0.8);
    if (swatch.label !== undefined) {
      this.addText(swatch.label, x + 6, y + Math.max(0, Math.floor((h - 15) / 2)), {
        fontSize: 11,
        color: swatch.selected ? '#00e5ff' : '#8a9bb5',
      });
    }
    this.hitTester.register({
      id: swatch.id,
      type: 'rect',
      x,
      y,
      width: w,
      height: h,
      cursor: 'pointer',
      onClick: onAction === undefined ? () => undefined : () => onAction(swatch.id),
    });
  }

  private overlayFields(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined,
    nowMs: number
  ): void {
    for (const field of layout.fields ?? []) this.paintField(field, onAction, nowMs);
  }

  private paintField(
    field: UiField,
    onAction: ((id: string) => void) | undefined,
    nowMs: number
  ): void {
    const { x, y, w, h } = field.rect;
    const focused = field.focused;
    this.addQuad(x, y, w, h, 0.027, 0.035, 0.051, 1);
    if (focused) this.addBorder(x, y, w, h, 2, 0, 0.9, 1, 0.95);
    else this.addBorder(x, y, w, h, 1, 0.18, 0.26, 0.37, 0.8);
    const display = getDisplayValue(
      { value: field.value, caret: field.caret, focused, maxLength: 24 },
      focused,
      nowMs
    );
    this.addText(display, x + 8, y + Math.max(0, Math.floor((h - 18) / 2)), {
      fontSize: 14,
      color: '#e0e8f5',
    });
    this.hitTester.register({
      id: `field:${field.id}`,
      type: 'rect',
      x,
      y,
      width: w,
      height: h,
      cursor: 'pointer',
      onClick: onAction === undefined ? () => undefined : () => onAction(`field:${field.id}`),
    });
  }

  /** Standalone menu-phase screen: visor, stars, and one modal layout. */
  public renderSplash(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined,
    width: number,
    height: number,
    timeSec: number,
    input?: SplashInput
  ): void {
    const curvature = 0.055;
    if (input?.focusId !== undefined) this.hitTester.setHovered(input.focusId);
    else if (input?.mouse !== undefined) {
      this.hitTester.updateHover(input.mouse.x, input.mouse.y, width, height, curvature);
    }
    this.hitTester.clear();
    this.vectorData.length = 0;
    this.textData.length = 0;
    this.renderVisorGlass(width, height, timeSec);
    this.overlayBackdrop(width, height, 0.3);
    this.splashStars(width, height, timeSec);
    this.overlayCard(layout, onAction, timeSec * 1000);
    const screenMat = createScreenMatrix(width, height);
    this.gl.viewport(0, 0, width, height);
    this.flushVectorPass(screenMat, curvature);
    this.flushTextPass(screenMat, curvature);
  }

  private renderVisorGlass(width: number, height: number, timeSec: number): void {
    const gl = this.gl;
    gl.useProgram(this.visorProg);
    gl.bindVertexArray(this.visorVAO);
    gl.uniform2f(gl.getUniformLocation(this.visorProg, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(this.visorProg, 'u_time'), timeSec);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  private flushVectorPass(screenMat: Float32Array, curvature: number): void {
    if (this.vectorData.length === 0) return;
    const gl = this.gl;
    gl.useProgram(this.vectorProg);
    gl.bindVertexArray(this.vectorVAO);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.vectorProg, 'u_matrix'), false, screenMat);
    gl.uniform1f(gl.getUniformLocation(this.vectorProg, 'u_glow'), 0.2);
    gl.uniform1f(gl.getUniformLocation(this.vectorProg, 'u_curvature'), curvature);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vectorBuffer);
    const view = this.vectorView();
    view.set(this.vectorData);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, view.subarray(0, this.vectorData.length));
    gl.drawArrays(gl.TRIANGLES, 0, this.vectorData.length / 6);
    gl.bindVertexArray(null);
  }

  private flushTextPass(screenMat: Float32Array, curvature: number): void {
    if (this.textData.length === 0) return;
    const gl = this.gl;
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
    const view = this.textView();
    view.set(this.textData);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, view.subarray(0, this.textData.length));
    gl.drawArrays(gl.TRIANGLES, 0, this.textData.length / 8);
    gl.bindVertexArray(null);
  }

  private overlayBlocker(width: number, height: number): void {
    this.hitTester.register({
      id: GL_UI_BLOCKER_ID,
      type: 'rect',
      x: 0,
      y: 0,
      width,
      height,
      cursor: 'default',
      onClick: () => undefined,
    });
  }

  private overlayBackdrop(width: number, height: number, alpha = 0.72): void {
    this.overlayBlocker(width, height);
    this.addQuad(0, 0, width, height, 0.016, 0.024, 0.039, alpha);
  }

  private splashStars(width: number, height: number, timeSec: number): void {
    const stars = splashStarField(splashStarCount(width, height), width, height, timeSec);
    for (const star of stars) {
      const c = star.brightness;
      this.addQuad(star.x, star.y, star.size, star.size, 0.81 * c, 0.9 * c, c, 0.9);
    }
  }

  private overlayPanel(layout: UiScreenLayout): void {
    this.paintCard(layout.panel);
    if (layout.sidePanel !== undefined) this.paintCard(layout.sidePanel);
  }

  private paintCard(rect: UiRect): void {
    this.addCurvedPanel(rect.x, rect.y, rect.w, rect.h, 9, 0.05, 0.07, 0.1, 0.95);
  }

  private overlayTexts(layout: UiScreenLayout): void {
    for (const text of layout.texts) {
      this.addText(text.text, text.x, text.y, {
        fontSize: text.size,
        color: uiTextHex(text.color),
      });
    }
  }

  private overlayButtons(
    layout: UiScreenLayout,
    onAction: ((id: string) => void) | undefined
  ): void {
    for (const button of layout.buttons) {
      const target = button;
      this.addButton(
        target.id,
        target.rect.x,
        target.rect.y,
        target.rect.w,
        target.rect.h,
        target.label,
        { fontSize: 14, color: target.primary ? '#00e5ff' : '#e0e8f5' },
        onAction === undefined ? undefined : () => onAction(target.id)
      );
      this.addButtonDetail(target);
    }
  }

  /** Right-aligned sublabel (prices, payouts) in its own color. */
  private addButtonDetail(button: {
    readonly rect: { x: number; y: number; w: number; h: number };
    readonly detail?: UiButtonDetail;
  }): void {
    const detail = button.detail;
    if (detail === undefined) return;
    const fontSize = 12;
    const textWidth = this.atlas.measureMonospace(detail.text, fontSize);
    const padX = 10;
    const padY = Math.max(1, Math.floor((button.rect.h - fontSize) / 2) - 1);
    this.addText(
      detail.text,
      button.rect.x + button.rect.w - padX - textWidth,
      button.rect.y + padY,
      {
        fontSize,
        color: uiTextHex(detail.color),
      }
    );
  }

  public render(
    state: HudDrawState,
    width: number,
    height: number,
    timeSec: number,
    losPoly: Point2D[]
  ): void {
    const curvature = 0.055;
    this.trackHover(state, width, height, curvature);
    this.hitTester.clear();
    this.vectorData.length = 0;
    this.textData.length = 0;

    // 1. VISOR GLASS SHADER PASS
    this.renderVisorGlass(width, height, timeSec);

    // 2. COMPOSE HUD WIDGETS (ambient yields while pack bench / chart is open)
    this.renderWidgets(state, width, height);
    this.renderTags(state, width, height, losPoly);
    const overlay = state.uiOverlay;
    if (overlay !== undefined && overlay !== null) {
      this.renderUiOverlay(overlay.layout, overlay.onAction, width, height, state.timeMs);
    }

    const screenMat = createScreenMatrix(width, height);

    // 3. VECTOR HUD PASS (with helmet visor barrel curvature)
    this.flushVectorPass(screenMat, curvature);

    // 4. TEXT ATLAS HUD PASS (with helmet visor barrel curvature)
    this.flushTextPass(screenMat, curvature);
  }

  private trackHover(state: HudDrawState, width: number, height: number, curvature: number): void {
    if (!state.mouseScreen) return;
    this.hitTester.updateHover(state.mouseScreen.x, state.mouseScreen.y, width, height, curvature);
  }

  private renderWidgets(state: HudDrawState, width: number, height: number): void {
    if (state.packOpen !== true && state.chartOpen !== true) {
      this.vitalsWidget.render(this, state, width, height);
      this.vitalsWidget.renderLivingStrip(this, state, width, height);
      this.combatWidget.render(this, state, width, height);
      this.checklistWidget.render(this, state, width, height);
    }
    this.headerWidget.render(this, state, width, height);
    this.alertsWidget.render(this, state, width, height);
  }

  private renderTags(state: HudDrawState, width: number, height: number, losPoly: Point2D[]): void {
    if (state.packOpen === true || state.chartOpen === true) return;
    const zoom = state.zoom ?? 1.0;
    const pawnsToTag = [state.pawn, ...(state.remotePawns || [])];
    this.renderWorldSpeechBubbles(pawnsToTag, state.camera, width, height, losPoly, zoom);
    const hovered = this.findHoveredCrewMember(state, width, height, losPoly);
    if (hovered) {
      this.renderHoverReticle(hovered, state.camera, width, height, zoom);
      this.renderCrewDossierWidget(hovered, width, height);
    }
  }
}
