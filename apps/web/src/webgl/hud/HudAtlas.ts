export interface CachedTextEntry {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TextRenderOptions {
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  paddingX?: number;
  paddingY?: number;
}

export class HudAtlas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 2048;
  private height = 2048;
  private currentX = 2;
  private currentY = 2;
  private rowHeight = 0;
  private dirty = true;
  private cache = new Map<string, CachedTextEntry>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      throw new Error('Could not create 2D context for HUD Atlas');
    }
    this.ctx = ctx;
    this.ctx.textBaseline = 'top';
  }

  public reset(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.currentX = 2;
    this.currentY = 2;
    this.rowHeight = 0;
    this.cache.clear();
    this.dirty = true;
  }

  private advanceShelf(itemWidth: number, itemHeight: number): void {
    if (this.currentX + itemWidth + 2 > this.width) {
      this.currentX = 2;
      this.currentY += this.rowHeight + 4;
      this.rowHeight = 0;
    }
    if (this.currentY + itemHeight + 2 > this.height) {
      this.reset();
    }
  }

  // fallow-ignore-next-line complexity
  private buildKey(text: string, opts: TextRenderOptions): string {
    const size = opts.fontSize ?? 22;
    const weight = opts.fontWeight ?? 'normal';
    const family = opts.fontFamily ?? 'monospace';
    const color = opts.color ?? '#00e5ff';
    const bg = opts.bgColor ?? '';
    const border = opts.borderColor ?? '';
    return `${text}__${size}_${weight}_${family}_${color}_${bg}_${border}`;
  }

  // fallow-ignore-next-line complexity
  private drawTextElement(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    font: string,
    opts: TextRenderOptions
  ): void {
    const ctx = this.ctx;
    ctx.save();
    if (opts.bgColor) {
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(x, y, w, h);
    }
    if (opts.borderColor) {
      ctx.strokeStyle = opts.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.font = font;
    ctx.fillStyle = opts.color ?? '#00e5ff';
    const padX = opts.paddingX ?? (opts.bgColor ? 4 : 0);
    const padY = opts.paddingY ?? (opts.bgColor ? 2 : 0);
    ctx.fillText(text, x + padX, y + padY);
    ctx.restore();
  }

  // fallow-ignore-next-line complexity
  public getOrDrawText(text: string, opts: TextRenderOptions = {}): CachedTextEntry {
    const key = this.buildKey(text, opts);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const font = `${opts.fontWeight ?? 'normal'} ${opts.fontSize ?? 22}px ${opts.fontFamily ?? 'monospace'}`;
    this.ctx.font = font;
    const metrics = this.ctx.measureText(text);

    const padX = opts.paddingX ?? (opts.bgColor ? 4 : 0);
    const padY = opts.paddingY ?? (opts.bgColor ? 2 : 0);
    const textW = Math.ceil(metrics.width);
    const textH = Math.ceil(opts.fontSize ?? 22) + 4;
    const totalW = textW + padX * 2;
    const totalH = textH + padY * 2;

    this.advanceShelf(totalW, totalH);

    const posX = this.currentX;
    const posY = this.currentY;
    this.drawTextElement(text, posX, posY, totalW, totalH, font, opts);

    this.currentX += totalW + 4;
    if (totalH > this.rowHeight) this.rowHeight = totalH;
    this.dirty = true;

    const entry: CachedTextEntry = {
      key,
      x: posX,
      y: posY,
      width: totalW,
      height: totalH,
      u0: posX / this.width,
      v0: posY / this.height,
      u1: (posX + totalW) / this.width,
      v1: (posY + totalH) / this.height,
    };
    this.cache.set(key, entry);
    return entry;
  }

  public syncTexture(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
    if (!this.dirty) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.dirty = false;
  }
}
