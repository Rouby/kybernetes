/**
 * DebugView: framework-free pawn-less observer canvas (Phase 3 Round 8).
 * Driven by ObserverStore (read-only OBSERVE transport); repaints the 2D air
 * debug scene on every store notify. Owns its canvas, status panel
 * (same data-testids as the retired React view), overlay/follow keys, and
 * click-to-follow. No React, no StyleX; plain DOM for debug chrome only.
 */

import type { World } from '@kybernetes/sim-core';
import type { ObserverState, ObserverStore } from '../client/stores/ObserverStore';
import {
  buildDebugModels,
  type DebugModels,
  debugAirLine,
  debugCameraForClick,
  debugDockLine,
  debugLinksLine,
  debugServerLine,
  debugTickLine,
  nextOverlay,
  paintDebugScene,
} from './debugCanvas';
import type { DebugOverlayMode } from './debugWorld';

export interface DebugViewDeps {
  readonly staticWorld: World;
  readonly store: ObserverStore;
}

const MONO = '"Courier New", Courier, monospace';

export class DebugView {
  private overlay: DebugOverlayMode = 'pressure';
  private followId: string | null = null;
  private models: DebugModels = { rooms: [], portals: [], pawns: [], docks: [] };
  private lastState: ObserverState | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly rows: Record<'tick' | 'server' | 'dock' | 'air' | 'links', HTMLDivElement>;
  private unsubscribe: (() => void) | null = null;
  private observer: ResizeObserver | null = null;
  private attached = false;

  constructor(
    root: HTMLElement,
    private readonly deps: DebugViewDeps
  ) {
    root.style.position = 'relative';
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'debug-world-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    root.appendChild(this.canvas);
    this.rows = buildPanel(root);
    this.ctx = this.canvas.getContext('2d');
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.unsubscribe = this.deps.store.subscribe((state) => this.onState(state));
    window.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('click', this.onClick);
    this.fit();
    this.observer = new ResizeObserver(() => this.fit());
    const parent = this.canvas.parentElement;
    if (parent !== null) this.observer.observe(parent);
    this.onState(this.deps.store.getState());
  }

  public dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('click', this.onClick);
    this.observer?.disconnect();
    this.observer = null;
  }

  private onState(state: ObserverState): void {
    this.lastState = state;
    this.models = buildDebugModels(this.deps.staticWorld, state.snapshot, state.telemetry);
    this.paint();
    this.updatePanel(state);
  }

  private paint(): void {
    if (this.ctx === null) return;
    paintDebugScene(this.ctx, this.canvas, {
      ...this.models,
      snapshot: this.lastState?.snapshot ?? null,
      overlay: this.overlay,
      followId: this.followId,
    });
  }

  private updatePanel(state: ObserverState): void {
    this.rows.tick.textContent = debugTickLine(state.snapshot);
    this.rows.server.textContent = debugServerLine(state.stats);
    this.rows.dock.textContent = debugDockLine(state.dock);
    this.rows.air.textContent = debugAirLine(
      this.models.rooms,
      this.models.portals,
      this.overlay,
      this.followId
    );
    this.rows.links.textContent = debugLinksLine(state.stats?.pawns ?? []);
  }

  private refresh(): void {
    this.paint();
    if (this.lastState !== null) this.updatePanel(this.lastState);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'o') this.overlay = nextOverlay(this.overlay);
    else if (key === 'f') this.followId = null;
    else return;
    this.refresh();
  };

  private readonly onClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * (this.canvas.width / Math.max(rect.width, 1));
    const sy = (event.clientY - rect.top) * (this.canvas.height / Math.max(rect.height, 1));
    this.followId = debugCameraForClick(this.canvas, this.models, this.followId, sx, sy);
    this.refresh();
  };

  private fit(): void {
    const parent = this.canvas.parentElement;
    if (parent === null) return;
    const w = Math.max(320, Math.floor(parent.clientWidth));
    const h = Math.max(320, Math.floor(parent.clientHeight));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.paint();
    }
  }
}

function buildPanel(
  root: HTMLElement
): Record<'tick' | 'server' | 'dock' | 'air' | 'links', HTMLDivElement> {
  const panel = document.createElement('div');
  panel.dataset.testid = 'debug-world-panel';
  panel.style.position = 'absolute';
  panel.style.top = '12px';
  panel.style.left = '12px';
  panel.style.backgroundColor = 'rgba(13, 18, 25, 0.92)';
  panel.style.border = '1px solid #2e415e';
  panel.style.padding = '10px';
  panel.style.fontFamily = MONO;
  panel.style.fontSize = '12px';
  panel.style.color = '#e0e8f5';
  panel.style.maxWidth = '380px';
  const title = document.createElement('div');
  title.style.color = '#00e5ff';
  title.style.fontSize = '13px';
  title.style.marginBottom = '4px';
  title.textContent = 'WORLD + AIR DEBUG · OBSERVER';
  panel.appendChild(title);
  const rows = {
    tick: panelRow(panel, 'debug-world-tick'),
    server: panelRow(panel, 'debug-world-server'),
    dock: panelRow(panel, 'debug-world-dock'),
    air: panelRow(panel, 'debug-world-air'),
    links: panelRow(panel, 'debug-world-links'),
  };
  panel.appendChild(legendRow());
  const hint = document.createElement('div');
  hint.style.color = '#8a9bb5';
  hint.style.marginTop = '6px';
  hint.textContent = 'O overlay · F overview · click pawn to follow · read-only OBSERVE';
  panel.appendChild(hint);
  root.appendChild(panel);
  return rows;
}

function panelRow(panel: HTMLElement, testid: string): HTMLDivElement {
  const row = document.createElement('div');
  row.dataset.testid = testid;
  row.style.color = '#8a9bb5';
  row.style.marginBottom = '2px';
  panel.appendChild(row);
  return row;
}

function legendRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.style.marginTop = '6px';
  const items: Array<readonly [string, string]> = [
    ['#3fb950', 'nominal'],
    ['#d29922', 'low'],
    ['#f85149', 'vent'],
    ['#00e5ff', 'wind'],
  ];
  for (const [color, label] of items) row.appendChild(legendDot(color, label));
  return row;
}

function legendDot(color: string, label: string): HTMLSpanElement {
  const item = document.createElement('span');
  item.style.color = '#8a9bb5';
  item.style.marginRight = '8px';
  const dot = document.createElement('span');
  dot.style.color = color;
  dot.textContent = '● ';
  item.appendChild(dot);
  item.appendChild(document.createTextNode(label));
  return item;
}
