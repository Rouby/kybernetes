/** Narrow paint surface widgets draw through; implemented by HudRenderer. */

import type { TextRenderOptions } from './HudAtlas';
import type { HudHitTester } from './HudHitTester';

export interface WidgetHost {
  addQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void;
  addTriangle(
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
  ): void;
  addBorder(
    x: number,
    y: number,
    w: number,
    h: number,
    thick: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void;
  addCurvedPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void;
  addText(text: string, x: number, y: number, opts?: TextRenderOptions): void;
  addButton(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts: TextRenderOptions,
    onClick?: () => void
  ): void;
  addProgressBar(
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    fgColor: [number, number, number],
    bgColor?: [number, number, number]
  ): void;
  addCartridge(
    x: number,
    y: number,
    isLoaded: boolean,
    isReloading: boolean,
    isLowAmmo: boolean
  ): void;
  getHitTester(): HudHitTester;
}
