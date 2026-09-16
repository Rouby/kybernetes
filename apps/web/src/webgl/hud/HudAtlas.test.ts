import { describe, expect, it, vi } from 'vitest';
import {
  GLYPH_ASCII_COUNT,
  GLYPH_BAKE_PX,
  GLYPH_EXTRAS,
  GLYPH_FIRST,
  glyphCell,
  glyphCount,
  HudAtlas,
} from './HudAtlas';
import { stubDocumentForHud } from './HudTestUtils';

describe('glyph atlas layout', () => {
  it('covers printable ASCII plus HUD extras', () => {
    expect(GLYPH_FIRST).toBe(32);
    expect(GLYPH_ASCII_COUNT).toBe(95);
    expect(glyphCount()).toBe(95 + GLYPH_EXTRAS.length);
    expect(glyphCell(0)).toEqual({ col: 0, row: 0 });
    expect(glyphCell(16)).toEqual({ col: 0, row: 1 });
  });

  it('maps code points with a question-mark fallback', () => {
    stubDocumentForHud();
    const atlas = new HudAtlas();
    expect(atlas.glyphIndexFor(65)).toBe(33);
    expect(atlas.glyphIndexFor(32)).toBe(0);
    expect(atlas.glyphIndexFor(126)).toBe(94);
    expect(atlas.glyphIndexFor('•'.codePointAt(0) ?? 0)).toBe(GLYPH_ASCII_COUNT);
    expect(atlas.glyphIndexFor(0x1f600)).toBe(63 - GLYPH_FIRST);
    const uv = atlas.glyphUvs(33);
    expect(uv.u1).toBeGreaterThan(uv.u0);
    expect(uv.v1).toBeGreaterThan(uv.v0);
    expect(uv.u1).toBeLessThanOrEqual(1);
    expect(uv.v1).toBeLessThanOrEqual(1);
    vi.unstubAllGlobals();
  });

  it('measures monospace advances without the GPU', () => {
    stubDocumentForHud();
    const atlas = new HudAtlas();
    expect(atlas.measureMonospace('AB', GLYPH_BAKE_PX)).toBe(atlas.advancePx * 2);
    expect(atlas.measureMonospace('AB', GLYPH_BAKE_PX / 2)).toBe(atlas.advancePx);
    vi.unstubAllGlobals();
  });
});
