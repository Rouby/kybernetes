import { describe, expect, it } from 'vitest';
import { actionKeyFor } from './sessionActions';

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
