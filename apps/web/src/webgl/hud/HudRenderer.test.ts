import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiVisorMargins } from '../ui/UiToolkit';
import { HudRenderer } from './HudRenderer';
import { createMockGl, stubDocumentForHud } from './HudTestUtils';
import { layoutCenterAlerts } from './widgets/AlertsWidget';
import { topVisorChips } from './widgets/HeaderWidget';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stackedBannerYs(layout: {
  notice?: { y: number };
  dual?: { y: number };
  collab?: { y: number };
}): [number, number, number] {
  const { notice, dual, collab } = layout;
  if (notice === undefined || dual === undefined || collab === undefined) {
    throw new Error('expected all three banners');
  }
  return [notice.y, dual.y, collab.y];
}

function driveGameplayFrames(renderer: HudRenderer, frames: number): void {
  const pawn = {
    id: 'p1',
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    facing: 0,
    frameId: 's',
    roomHint: 's.r',
    color: '#fff',
  };
  for (let frame = 0; frame < frames; frame += 1) {
    renderer.render(gameplayState(pawn, frame), 1920, 1080, frame / 60, []);
  }
}

function gameplayState(pawn: unknown, frame: number): never {
  return {
    pawn,
    camera: { x: 0, y: 0 },
    mouseWorld: { x: 0, y: 0 },
    timeMs: frame * 16,
    inGameNotice: `SHIFT TIMER T+${frame}s`,
  } as never;
}

describe('center alert visor margins', () => {
  const cases: Array<[number, number]> = [
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ];
  it.each(cases)('clears the header with a 14px gap at %dx%d', (width, height) => {
    const { marginY, topClearance } = uiVisorMargins(width, height);
    expect(topClearance).toBe(marginY + 68);
    const layout = layoutCenterAlerts(width, height, { notice: true, dual: true, collab: true });
    const ys = stackedBannerYs(layout);
    expect(ys[0]).toBe(topClearance);
    expect(ys[1]).toBe(ys[0] + 40 + 12);
    expect(ys[2]).toBe(ys[1] + 45 + 12);
    expect(ys[0] - (marginY + 54)).toBeGreaterThanOrEqual(14);
  });

  it('stacks only visible banners', () => {
    const layout = layoutCenterAlerts(1920, 1080, { notice: false, dual: true, collab: false });
    expect(layout.notice).toBeUndefined();
    expect(layout.dual?.y).toBe(uiVisorMargins(1920, 1080).topClearance);
    expect(layout.collab).toBeUndefined();
  });
});

describe('top visor economy chips', () => {
  const baseState = (over: Record<string, number | undefined>) => ({
    pawn: {
      id: 'p1',
      x: 0,
      y: 0,
      callsign: 'Rook',
      role: 'engineer',
      color: '#fff',
      frameId: 's',
      roomHint: 's.r',
    },
    camera: { x: 0, y: 0 },
    mouseWorld: { x: 0, y: 0 },
    timeMs: 0,
    ...over,
  });

  it('labels clearance and credits from vitals state', () => {
    const chips = topVisorChips(baseState({ clearanceLevel: 3, credits: 250 }) as never);
    expect(chips.clearance.label).toBe('CLR: LVL 3');
    expect(chips.credits.label).toBe('CR: 250');
  });

  it('defaults missing vitals to level 1 and zero credits', () => {
    const chips = topVisorChips(baseState({}) as never);
    expect(chips.clearance.label).toBe('CLR: LVL 1');
    expect(chips.credits.label).toBe('CR: 0');
  });

  it('keeps chips inside the 595px header with a 5px rhythm', () => {
    const chips = topVisorChips(baseState({ clearanceLevel: 10, credits: 1000000 }) as never);
    for (const chip of [chips.clearance, chips.credits]) {
      expect(chip.x + chip.w).toBeLessThanOrEqual(595);
      expect(chip.y).toBe(21);
    }
    expect(chips.credits.x - (chips.clearance.x + chips.clearance.w)).toBe(5);
    expect(595 - (chips.credits.x + chips.credits.w)).toBe(10);
  });
});

describe('HudRenderer lifecycle', () => {
  it('deletes every owned GL object on dispose', () => {
    stubDocumentForHud();
    const { gl, calls } = createMockGl();
    const renderer = new HudRenderer(gl);
    renderer.dispose();
    expect(calls.deletedPrograms).toHaveLength(3);
    expect(calls.deletedVaos).toHaveLength(3);
    expect(calls.deletedBuffers).toHaveLength(3);
    expect(calls.deletedTextures).toHaveLength(1);
    expect(new Set(calls.deletedPrograms).size).toBe(3);
    expect(new Set(calls.deletedVaos).size).toBe(3);
    expect(new Set(calls.deletedBuffers).size).toBe(3);
  });

  it('uploads the atlas once and never reallocates during gameplay', () => {
    stubDocumentForHud();
    const { gl, calls } = createMockGl();
    const renderer = new HudRenderer(gl);
    expect(calls.texImage2DCalls).toBe(1);
    const bufferDataAtStart = calls.bufferDataCalls;
    driveGameplayFrames(renderer, 60);
    expect(calls.texImage2DCalls).toBe(1);
    expect(calls.bufferDataCalls).toBe(bufferDataAtStart);
    expect(calls.bufferSubDataCalls).toBeGreaterThan(0);
    expect(calls.drawArraysCalls).toBeGreaterThan(0);
  });
});
