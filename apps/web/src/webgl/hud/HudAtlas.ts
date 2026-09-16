export interface TextRenderOptions {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
}

export interface GlyphUvs {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** First printable ASCII code point baked into the atlas. */
export const GLYPH_FIRST = 32;
/** Printable ASCII run (32-126) baked ahead of gameplay. */
export const GLYPH_ASCII_COUNT = 95;
/** Non-ASCII HUD glyphs (bullets, degrees, ellipsis, box marks). */
export const GLYPH_EXTRAS = '\u2022\u00b0\u2026\u2014\u2013\u00d7\u00b7\u25ba\u25b2\u2588\u2713';
/** Pixel size the glyphs are rasterized at; quads scale from this basis. */
export const GLYPH_BAKE_PX = 32;
const ATLAS_COLS = 16;
const ATLAS_SIZE = 512;
const CELL_W = ATLAS_SIZE / ATLAS_COLS;
const CELL_H = 40;

export function glyphCount(): number {
  return GLYPH_ASCII_COUNT + GLYPH_EXTRAS.length;
}

/** Atlas cell for a global glyph index (0-based over ASCII run + extras). */
export function glyphCell(index: number): { col: number; row: number } {
  return { col: index % ATLAS_COLS, row: Math.floor(index / ATLAS_COLS) };
}

/**
 * Pre-baked monochrome glyph atlas: the full printable ASCII run plus HUD
 * extras rasterized once at construction. Text renders as instanced-style
 * quads with per-glyph UVs, so gameplay never calls texImage2D again.
 */
export class HudAtlas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private uploaded = false;
  /** Monospace advance at bake size; quads scale it by fontSize / 32. */
  readonly advancePx: number;
  /** Blank side bearing inside a cell; quads back it out so glyphs kern. */
  readonly padXPx: number;
  readonly cellW = CELL_W;
  readonly cellH = CELL_H;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      throw new Error('Could not create 2D context for HUD Atlas');
    }
    this.ctx = ctx;
    this.ctx.textBaseline = 'top';
    this.bakeGlyphs();
    this.ctx.font = `${GLYPH_BAKE_PX}px monospace`;
    this.advancePx = this.ctx.measureText('M').width;
    this.padXPx = Math.max(0, (CELL_W - this.advancePx) / 2);
  }

  private bakeGlyphs(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    ctx.font = `${GLYPH_BAKE_PX}px monospace`;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < glyphCount(); i += 1) {
      const { col, row } = glyphCell(i);
      const ch =
        i < GLYPH_ASCII_COUNT
          ? String.fromCharCode(GLYPH_FIRST + i)
          : GLYPH_EXTRAS[i - GLYPH_ASCII_COUNT];
      const w = ctx.measureText(ch).width;
      ctx.fillText(ch ?? '?', col * CELL_W + (CELL_W - w) / 2, row * CELL_H + 4);
    }
  }

  /** Global glyph index for a code point; unknown glyphs fall back to '?'. */
  glyphIndexFor(codePoint: number): number {
    if (codePoint >= GLYPH_FIRST && codePoint < GLYPH_FIRST + GLYPH_ASCII_COUNT) {
      return codePoint - GLYPH_FIRST;
    }
    const extra = GLYPH_EXTRAS.indexOf(String.fromCodePoint(codePoint));
    if (extra >= 0) return GLYPH_ASCII_COUNT + extra;
    return 63 - GLYPH_FIRST;
  }

  glyphUvs(index: number): GlyphUvs {
    const { col, row } = glyphCell(index);
    return {
      u0: (col * CELL_W) / ATLAS_SIZE,
      v0: (row * CELL_H) / ATLAS_SIZE,
      u1: ((col + 1) * CELL_W) / ATLAS_SIZE,
      v1: ((row + 1) * CELL_H) / ATLAS_SIZE,
    };
  }

  /** Monospace measure without touching the GPU. */
  measureMonospace(text: string, fontSize: number): number {
    return [...text].length * this.advancePx * (fontSize / GLYPH_BAKE_PX);
  }

  /** Single full-atlas upload; gameplay frames never transfer again. */
  uploadAtlas(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
    if (this.uploaded) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploaded = true;
  }

  /** Late-init safety: uploads once if construction-time upload was skipped. */
  syncTexture(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
    if (!this.uploaded) this.uploadAtlas(gl, texture);
  }
}
