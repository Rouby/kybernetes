/**
 * SplashMount: framework-free menu-phase canvas mount (Phase 3 Round 13).
 * Faithful port of the GlSplash effect: canvas fit, hover/click, arrow-key
 * focus, per-frame layouts, and __uiZones publishing. GlSplash delegates
 * to it until React removal; the vanilla shell owns it directly.
 */

import { HudRenderer } from '../webgl/hud/HudRenderer';
import type { UiScreenLayout } from '../webgl/ui/UiScreens';
import { publishUiZones } from '../webgl/ui/UiToolkit';
import { handleSplashKey } from './splashKeys';

export interface SplashMountCallbacks {
  readonly buildLayout: (width: number, height: number) => UiScreenLayout;
  readonly onAction: (id: string) => void;
  readonly onSize?: (width: number, height: number) => void;
}

export class SplashMount {
  private callbacks: SplashMountCallbacks;
  private renderer: HudRenderer | null = null;
  private readonly mouse = { x: 0, y: 0 };
  private readonly buttonsHolder = { current: [] as readonly { id: string }[] };
  private readonly focusHolder = { current: 0 };
  private readonly keyModeHolder = { current: false };
  private readonly actionHolder = { current: (_id: string) => {} };
  private lastW = 0;
  private lastH = 0;
  private canvas: HTMLCanvasElement | null = null;
  private observer: ResizeObserver | null = null;
  private raf = 0;
  private attached = false;

  constructor(callbacks: SplashMountCallbacks) {
    this.callbacks = callbacks;
    this.actionHolder.current = callbacks.onAction;
  }

  public update(callbacks: SplashMountCallbacks): void {
    this.callbacks = callbacks;
    this.actionHolder.current = callbacks.onAction;
  }

  public attach(canvas: HTMLCanvasElement): boolean {
    if (this.attached) return this.renderer !== null;
    const parent = canvas.parentElement;
    if (parent === null) return false;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (gl === null) {
      console.error('SplashMount: WebGL2 unavailable, splash dark.');
      return false;
    }
    this.canvas = canvas;
    this.renderer = new HudRenderer(gl);
    this.fit();
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(parent);
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mousedown', this.onDown);
    window.addEventListener('keydown', this.onKey);
    this.attached = true;
    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  public dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.observer = null;
    this.canvas?.removeEventListener('mousemove', this.onMove);
    this.canvas?.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('keydown', this.onKey);
    this.canvas = null;
    this.renderer = null;
  }

  private fit(): void {
    const canvas = this.canvas;
    if (canvas === null) return;
    const parent = canvas.parentElement;
    if (parent === null) return;
    const w = Math.max(320, Math.floor(parent.clientWidth));
    const h = Math.max(320, Math.floor(parent.clientHeight));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      this.callbacks.onSize?.(w, h);
    }
  }

  private readonly onMove = (event: MouseEvent): void => {
    const canvas = this.canvas;
    const renderer = this.renderer;
    if (canvas === null || renderer === null) return;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1));
    this.mouse.y = (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1));
    this.keyModeHolder.current = false;
    const tester = renderer.getHitTester();
    tester.updateHover(this.mouse.x, this.mouse.y, canvas.width, canvas.height);
    const over = this.buttonsHolder.current.some((button) => tester.isHovered(button.id));
    canvas.style.cursor = over ? 'pointer' : 'default';
  };

  private readonly onDown = (event: MouseEvent): void => {
    const canvas = this.canvas;
    const renderer = this.renderer;
    if (canvas === null || renderer === null) return;
    const handled = renderer
      .getHitTester()
      .handleClick(this.mouse.x, this.mouse.y, canvas.width, canvas.height);
    if (handled) event.preventDefault();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    handleSplashKey(
      event,
      this.buttonsHolder,
      this.focusHolder,
      this.keyModeHolder,
      this.actionHolder
    );
  };

  private readonly frame = (): void => {
    if (!this.attached) return;
    const canvas = this.canvas;
    const renderer = this.renderer;
    if (canvas === null || renderer === null) return;
    const layout = this.callbacks.buildLayout(canvas.width, canvas.height);
    this.buttonsHolder.current = layout.buttons;
    publishUiZones(window, [
      ...layout.buttons,
      ...(layout.swatches ?? []),
      ...(layout.fields ?? []).map((field) => ({ id: 'field:' + field.id, rect: field.rect })),
    ]);
    const focused = layout.buttons[Math.min(this.focusHolder.current, layout.buttons.length - 1)];
    renderer.renderSplash(
      layout,
      (id: string) => this.callbacks.onAction(id),
      canvas.width,
      canvas.height,
      performance.now() / 1000,
      {
        mouse: { x: this.mouse.x, y: this.mouse.y },
        focusId: this.keyModeHolder.current ? focused?.id : undefined,
      }
    );
    this.raf = requestAnimationFrame(this.frame);
  };
}
