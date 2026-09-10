/**
 * ViewportDriver: framework-free WebGL viewport loop (Phase 3 Round 11).
 * Owns the ViewportSession, canvas listeners, and rAF loop with the exact
 * semantics the HarborViewport effect always had; the component is now a
 * thin mount over it until React removal. No React of its own.
 */

import {
  createViewportSession,
  fitCanvasToParent,
  type HarborViewportProps,
  renderViewport,
  type ViewportSession,
} from '../harbor/viewportFrame';
import { packBenchTransform, uiContains } from '../webgl/ui/UiToolkit';
import { WebGL2Renderer } from '../webgl/WebGL2Renderer';

export interface PackPointerControl {
  readonly isOpen: () => boolean;
  readonly isDown: () => boolean;
  readonly press: (x: number, y: number) => boolean;
  readonly move: (x: number, y: number) => void;
  readonly release: () => void;
}

export class ViewportDriver {
  private readonly session: ViewportSession = createViewportSession();
  private view: HarborViewportProps | null = null;
  private packCtl: PackPointerControl | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private observer: ResizeObserver | null = null;
  private raf = 0;
  private attached = false;

  public update(view: HarborViewportProps): void {
    this.view = view;
  }

  public setPackControl(ctl: PackPointerControl): void {
    this.packCtl = ctl;
  }

  public canvasSize(): { w: number; h: number } | null {
    if (this.canvas === null) return null;
    return { w: this.canvas.width, h: this.canvas.height };
  }

  private packLocal(): { x: number; y: number } | null {
    const canvas = this.canvas;
    const ctl = this.packCtl;
    if (canvas === null || ctl === null || !ctl.isOpen()) return null;
    const bench = packBenchTransform(canvas.width, canvas.height);
    const pad = {
      x: bench.rect.x - 20,
      y: bench.rect.y - 20,
      w: bench.rect.w + 40,
      h: bench.rect.h + 40,
    };
    if (!uiContains(pad, this.session.mouse.x, this.session.mouse.y)) return null;
    return {
      x: (this.session.mouse.x - bench.ox) / bench.scale,
      y: (this.session.mouse.y - bench.oy) / bench.scale,
    };
  }

  public attach(canvas: HTMLCanvasElement): boolean {
    if (this.attached) return this.session.renderer !== null;
    const parent = canvas.parentElement;
    if (parent === null) return false;
    this.canvas = canvas;
    this.observeParent(canvas, parent);
    if (!this.ensureRenderer(canvas)) return false;
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    this.attached = true;
    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.observer = null;
    this.canvas?.removeEventListener('mousemove', this.onMove);
    this.canvas?.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    this.canvas = null;
  }

  private observeParent(canvas: HTMLCanvasElement, parent: HTMLElement): void {
    const fitCanvas = (): void => fitCanvasToParent(canvas, parent);
    fitCanvas();
    this.observer = new ResizeObserver(fitCanvas);
    this.observer.observe(parent);
  }

  private ensureRenderer(canvas: HTMLCanvasElement): boolean {
    if (this.session.renderer !== null) return true;
    try {
      this.session.renderer = new WebGL2Renderer(canvas);
    } catch (err) {
      console.error('ViewportDriver: WebGL2 unavailable, viewport dark.', err);
      return false;
    }
    return true;
  }

  private readonly onMove = (event: MouseEvent): void => {
    const canvas = this.canvas;
    if (canvas === null) return;
    const rect = canvas.getBoundingClientRect();
    this.session.mouse.x = (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1));
    this.session.mouse.y = (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1));
    this.session.mouse.moved = true;
    this.session.mouse.lastMs = performance.now();
    if (this.view !== null) this.view.aimLockedRef.current = true;
    if (this.packCtl?.isDown() === true) {
      const at = this.packLocal();
      if (at !== null) this.packCtl.move(at.x, at.y);
    }
  };

  private readonly onDown = (): void => {
    const canvas = this.canvas;
    const view = this.view;
    if (canvas === null || view === null) return;
    const packAt = this.packLocal();
    if (packAt !== null) {
      this.packCtl?.press(packAt.x, packAt.y);
      return;
    }
    if (this.fireZoneClicked(canvas)) return;
    view.onFireDown();
  };

  private fireZoneClicked(canvas: HTMLCanvasElement): boolean {
    const renderer = this.session.renderer;
    if (renderer === null) return false;
    const mouse = this.session.mouse;
    return renderer.getHitTester().handleClick(mouse.x, mouse.y, canvas.width, canvas.height);
  }

  private readonly onUp = (): void => {
    this.packCtl?.release();
    this.view?.onFireUp();
  };

  private readonly frame = (): void => {
    if (!this.attached) return;
    this.paintFrame();
    this.raf = requestAnimationFrame(this.frame);
  };

  private paintFrame(): void {
    const canvas = this.canvas;
    const view = this.view;
    if (canvas === null || view === null) return;
    if (canvas.width * canvas.height === 0) return;
    renderViewport(this.session, view, canvas);
  }
}
