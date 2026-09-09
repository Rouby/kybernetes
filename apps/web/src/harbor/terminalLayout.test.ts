import { describe, expect, it } from 'vitest';
import {
  buttonLabel,
  layoutTerminalMenu,
  menuButtonIds,
  navigateMenu,
  publishZones,
  type TerminalMenuState,
} from './terminalLayout';

function state(over: Partial<TerminalMenuState> = {}): TerminalMenuState {
  return {
    width: 1280,
    height: 720,
    callsign: 'Rook',
    audioReady: true,
    muted: false,
    masterPct: 70,
    ...over,
  };
}

describe('terminal layout', () => {
  it('centers the panel and contains every button', () => {
    const layout = layoutTerminalMenu(state());
    expect(layout.panel.x).toBe(Math.round((1280 - layout.panel.w) / 2));
    expect(layout.panel.y).toBe(Math.round((720 - layout.panel.h) / 2));
    expect(layout.buttons.length).toBeGreaterThan(0);
    for (const button of layout.buttons) {
      expect(button.rect.x).toBeGreaterThanOrEqual(layout.panel.x);
      expect(button.rect.y).toBeGreaterThanOrEqual(layout.panel.y);
      expect(button.rect.x + button.rect.w).toBeLessThanOrEqual(layout.panel.x + layout.panel.w);
      expect(button.rect.y + button.rect.h).toBeLessThanOrEqual(layout.panel.y + layout.panel.h);
    }
    const rects = layout.buttons.map((button) => button.rect);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a === undefined || b === undefined) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('swaps the audio row for an enable button when audio is not ready', () => {
    expect(menuButtonIds(false)).toEqual(['embark', 'customize', 'audio']);
    expect(menuButtonIds(true)).toEqual(['embark', 'customize', 'voldn', 'volup', 'mute']);
    const cold = layoutTerminalMenu(state({ audioReady: false }));
    expect(cold.buttons.map((button) => button.id)).toEqual(['embark', 'customize', 'audio']);
    expect(buttonLabel('mute', { muted: true, masterPct: 70 })).toBe('MUTED');
    expect(buttonLabel('mute', { muted: false, masterPct: 70 })).toBe('VOL 70%');
  });

  it('navigates with wrap, home, and end', () => {
    expect(navigateMenu(0, 'ArrowDown', 5)).toBe(1);
    expect(navigateMenu(4, 'ArrowDown', 5)).toBe(0);
    expect(navigateMenu(0, 'ArrowUp', 5)).toBe(4);
    expect(navigateMenu(2, 's', 5)).toBe(3);
    expect(navigateMenu(2, 'w', 5)).toBe(1);
    expect(navigateMenu(3, 'Home', 5)).toBe(0);
    expect(navigateMenu(3, 'End', 5)).toBe(4);
    expect(navigateMenu(3, 'Enter', 5)).toBe(3);
    expect(navigateMenu(0, 'ArrowDown', 0)).toBe(0);
  });

  it('publishes hit zones for the canvas and e2e', () => {
    const layout = layoutTerminalMenu(state());
    const sink: { __terminalMenuZones?: unknown } = {};
    publishZones(sink, layout.buttons);
    const zones = sink.__terminalMenuZones as { id: string; w: number; h: number }[];
    expect(zones.map((zone) => zone.id)).toEqual(layout.buttons.map((button) => button.id));
    for (const zone of zones) {
      expect(zone.w).toBeGreaterThan(0);
      expect(zone.h).toBeGreaterThan(0);
    }
  });
});
