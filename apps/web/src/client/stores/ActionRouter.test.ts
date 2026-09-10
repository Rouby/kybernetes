/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { attachActionRouter } from './ActionRouter';

describe('ActionRouter', () => {
  it('exposes a window router factory', () => {
    expect(typeof attachActionRouter).toBe('function');
  });
});
