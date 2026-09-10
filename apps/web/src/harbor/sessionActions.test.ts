import { describe, expect, it } from 'vitest';
import { actionKeyFor, consoleKindOf } from './sessionActions';

describe('session action keys', () => {
  it('maps gameplay keys behind the pause gate', () => {
    expect(actionKeyFor('e', false)).toBe('use');
    expect(actionKeyFor('h', false)).toBe('talk');
    expect(actionKeyFor('t', false)).toBe('seal');
    expect(actionKeyFor('f', false)).toBe('fire');
    expect(actionKeyFor('r', false)).toBe('reload');
    expect(actionKeyFor('E', false)).toBeNull();
    expect(actionKeyFor('wasd', false)).toBeNull();
  });

  it('only offers hire when an offer is open', () => {
    expect(actionKeyFor('j', true)).toBe('hire');
    expect(actionKeyFor('j', false)).toBeNull();
  });
});

describe('consoleKindOf', () => {
  it('opens panels for consoles and ignores other targets', () => {
    const contact = {
      id: 'ship.reactor_console',
      kind: 'reactor_console' as const,
      roomId: 'ship.reaktor_antrieb',
      x: 110,
      y: 480,
      integrity: 100,
      online: true,
      dist: 10,
    };
    expect(consoleKindOf({ kind: 'fixture', contact })).toBe('reactor_console');
    expect(
      consoleKindOf({ kind: 'fixture', contact: { ...contact, kind: 'engine_console' } })
    ).toBe('engine_console');
    expect(consoleKindOf({ kind: 'fixture', contact: { ...contact, kind: 'stove' } })).toBeNull();
    expect(consoleKindOf({ kind: 'fixture', contact: { ...contact, kind: 'nav_console' } })).toBe(
      'nav_console'
    );
    expect(consoleKindOf({ kind: 'fixture', contact: { ...contact, kind: 'market_stall' } })).toBe(
      'market'
    );
    expect(consoleKindOf({ kind: 'door', id: 'd', open: false, dist: 5 })).toBeNull();
    expect(consoleKindOf(null)).toBeNull();
  });
});
