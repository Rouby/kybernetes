/**
 * TerminalCanvas: the diegetic menu. Starfield, panel, and buttons all
 * live in one 2D canvas; pointer input flows through HudHitTester with a
 * flat mapping and keyboard input mirrors every action. DOM stays for
 * forms (customize) and modal dialogs (pause/death), which need real inputs.
 */

import { useEffect, useRef, useState } from 'react';
import { HudHitTester } from '../webgl/hud/HudHitTester';
import type { MasterAudio } from './audioControls';
import { driftStars, makeStars, type Star } from './starfield';
import {
  layoutTerminalMenu,
  menuButtonIds,
  navigateMenu,
  publishZones,
  type TermButton,
  type TerminalButtonId,
  type TerminalColor,
  type TerminalLayout,
  type TerminalText,
  type TerminalZone,
} from './terminalLayout';

declare global {
  interface Window {
    __terminalMenuZones?: TerminalZone[];
  }
}

export interface TerminalCanvasProps {
  readonly callsign: string;
  readonly audio: MasterAudio;
  readonly onEmbark: () => void;
  readonly onCustomize: () => void;
}

interface LiveTerminal {
  readonly callsign: string;
  readonly audio: MasterAudio;
  readonly onEmbark: () => void;
  readonly onCustomize: () => void;
}

const SEED = 20260909;
const SPEED = 14;
const FONT = '"Courier New", Courier, monospace';

const INK: Record<TerminalColor, string> = {
  dim: '#008899',
  cyan: '#00e5ff',
  primary: '#e0e8f5',
  muted: '#8a9bb5',
  danger: '#ff2244',
};

const HIDDEN_LIVE_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
};

export function activateTerminalButton(id: TerminalButtonId, live: LiveTerminal): void {
  if (id === 'embark') live.onEmbark();
  else if (id === 'customize') live.onCustomize();
  else if (id === 'audio') live.audio.enable();
  else if (!live.audio.ready) return;
  else if (id === 'voldn') live.audio.setMasterPct(Math.max(0, live.audio.masterPct - 10));
  else if (id === 'volup') live.audio.setMasterPct(Math.min(100, live.audio.masterPct + 10));
  else live.audio.setMuted(!live.audio.muted);
}

export function activateTerminalIndex(
  buttons: readonly TermButton[],
  idx: number,
  live: LiveTerminal
): void {
  const button = buttons[idx];
  if (button !== undefined) activateTerminalButton(button.id, live);
}

function paintText(ctx: CanvasRenderingContext2D, line: TerminalText): void {
  ctx.font = `${line.size}px ${FONT}`;
  ctx.fillStyle = INK[line.color];
  ctx.textBaseline = 'top';
  ctx.fillText(line.text, line.x, line.y);
}

function paintButton(ctx: CanvasRenderingContext2D, button: TermButton, active: boolean): void {
  const { rect } = button;
  ctx.fillStyle = active ? '#16202f' : '#0a0e14';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = active || button.primary ? '#00e5ff' : '#2e415e';
  ctx.lineWidth = active || button.primary ? 2 : 1;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = active || button.primary ? '#00e5ff' : '#e0e8f5';
  ctx.textBaseline = 'middle';
  ctx.fillText(button.label, rect.x + 12, rect.y + rect.h / 2);
}

function paintPanel(ctx: CanvasRenderingContext2D, layout: TerminalLayout): void {
  const { panel } = layout;
  ctx.fillStyle = '#0d1219';
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.strokeStyle = '#2e415e';
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
}

function paintStars(ctx: CanvasRenderingContext2D, stars: readonly Star[]): void {
  for (const star of stars) {
    ctx.globalAlpha = Math.min(1, star.z) * (0.55 + 0.45 * Math.sin(star.tw));
    ctx.fillStyle = '#cfe6ff';
    const size = star.z > 0.8 ? 2 : 1;
    ctx.fillRect(star.x, star.y, size, size);
  }
  ctx.globalAlpha = 1;
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stars: readonly Star[],
  layout: TerminalLayout,
  tester: HudHitTester,
  focusIdx: number
): void {
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, width, height);
  paintStars(ctx, stars);
  paintPanel(ctx, layout);
  paintText(ctx, layout.kicker);
  paintText(ctx, layout.title);
  for (const line of layout.lines) paintText(ctx, line);
  layout.buttons.forEach((button, idx) => {
    paintButton(ctx, button, tester.isHovered(button.id) || idx === focusIdx);
  });
  for (const line of layout.footer) paintText(ctx, line);
}

function hoverCursor(tester: HudHitTester): string {
  const ids: readonly TerminalButtonId[] = [
    'embark',
    'customize',
    'audio',
    'voldn',
    'volup',
    'mute',
  ];
  for (const id of ids) {
    if (tester.isHovered(id)) return 'pointer';
  }
  return 'default';
}

export function TerminalCanvas({ callsign, audio, onEmbark, onCustomize }: TerminalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const testerRef = useRef<HudHitTester | null>(null);
  if (testerRef.current === null) testerRef.current = new HudHitTester();
  const starsRef = useRef<Star[]>([]);
  const buttonsRef = useRef<readonly TermButton[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRef = useRef(focusIdx);
  focusRef.current = focusIdx;
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const live = useRef<LiveTerminal>({ callsign, audio, onEmbark, onCustomize });
  live.current = { callsign, audio, onEmbark, onCustomize };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const tester = testerRef.current;
    if (tester === null) return;
    let raf = 0;
    let last = performance.now();
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = makeStars(
        SEED,
        starCount(rect.width, rect.height),
        rect.width,
        rect.height
      );
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    const frame = (now: number): void => {
      const rect = canvas.getBoundingClientRect();
      const current = live.current;
      liveSnapshot.current = current;
      starsRef.current = driftStars(starsRef.current, (now - last) / 1000, rect.width, SPEED);
      last = now;
      const layout = layoutTerminalMenu({
        width: rect.width,
        height: rect.height,
        callsign: current.callsign,
        audioReady: current.audio.ready,
        muted: current.audio.muted,
        masterPct: current.audio.masterPct,
      });
      buttonsRef.current = layout.buttons;
      tester.clear();
      for (const button of layout.buttons) registerZone(tester, button);
      publishZones(window, layout.buttons);
      paintFrame(ctx, rect.width, rect.height, starsRef.current, layout, tester, focusRef.current);
      raf = requestAnimationFrame(frame);
    };
    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const current = live.current;
      const count = menuButtonIds(current.audio.ready).length;
      const key = event.key;
      if (isNavKey(key)) {
        setFocusIdx((idx) => navigateMenu(idx, key, count));
        event.preventDefault();
        return;
      }
      if (key === 'Enter' || key === ' ') {
        if (!event.repeat) activateTerminalIndex(buttonsRef.current, focusRef.current, current);
        event.preventDefault();
        return;
      }
      activateActionKey(key, current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const onMouseMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const tester = testerRef.current;
    if (canvas === null || tester === null) return;
    const rect = canvas.getBoundingClientRect();
    tester.updateHover(
      event.clientX - rect.left,
      event.clientY - rect.top,
      undefined,
      undefined,
      0
    );
    canvas.style.cursor = hoverCursor(tester);
  };
  const onClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const tester = testerRef.current;
    if (canvas === null || tester === null) return;
    const rect = canvas.getBoundingClientRect();
    tester.handleClick(
      event.clientX - rect.left,
      event.clientY - rect.top,
      undefined,
      undefined,
      0
    );
  };
  const liveLayout = layoutTerminalMenu({
    width: size.w,
    height: size.h,
    callsign,
    audioReady: audio.ready,
    muted: audio.muted,
    masterPct: audio.masterPct,
  });
  const focused =
    liveLayout.buttons[Math.min(focusIdx, Math.max(0, liveLayout.buttons.length - 1))];
  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="terminal-canvas"
        aria-label={`Main menu. Signed in as ${callsign}. Press E to embark, C to customize.`}
        onMouseMove={onMouseMove}
        onMouseLeave={() => testerRef.current?.updateHover(-1, -1, undefined, undefined, 0)}
        onClick={onClick}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <span aria-live="polite" style={HIDDEN_LIVE_STYLE}>
        {focused === undefined ? '' : `Focused: ${focused.label}`}
      </span>
    </>
  );
}

function starCount(width: number, height: number): number {
  return Math.round((width * height) / 9000);
}

function registerZone(tester: HudHitTester, button: TermButton): void {
  tester.register({
    id: button.id,
    type: 'rect',
    x: button.rect.x,
    y: button.rect.y,
    width: button.rect.w,
    height: button.rect.h,
    cursor: 'pointer',
    onClick: () => activateTerminalButton(button.id, liveSnapshot.current),
  });
}

const liveSnapshot: { current: LiveTerminal } = {
  current: {
    callsign: 'Rook',
    audio: {
      ready: false,
      muted: false,
      masterPct: 70,
      enable: () => undefined,
      setMasterPct: () => undefined,
      setMuted: () => undefined,
    },
    onEmbark: () => undefined,
    onCustomize: () => undefined,
  },
};

function isNavKey(key: string): boolean {
  return (
    key === 'ArrowDown' ||
    key === 'ArrowUp' ||
    key === 'w' ||
    key === 'W' ||
    key === 's' ||
    key === 'S' ||
    key === 'Home' ||
    key === 'End'
  );
}

function toggleMuteKey(current: LiveTerminal): void {
  if (!current.audio.ready) current.audio.enable();
  else current.audio.setMuted(!current.audio.muted);
}

function activateActionKey(key: string, current: LiveTerminal): boolean {
  if (key === 'e' || key === 'E') current.onEmbark();
  else if (key === 'c' || key === 'C') current.onCustomize();
  else if (key === 'm' || key === 'M') toggleMuteKey(current);
  else return false;
  return true;
}
