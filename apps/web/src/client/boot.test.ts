/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { startBoot } from './boot';

describe('startBoot', () => {
  it('exposes the vanilla entry point', () => {
    expect(typeof startBoot).toBe('function');
  });
});
