/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { SplashMount } from './SplashMount';

describe('SplashMount lifecycle', () => {
  it('exposes attach, update, and dispose for mounts', () => {
    const mount = new SplashMount({
      buildLayout: () => {
        throw new Error('no canvas in node');
      },
      onAction: () => undefined,
    });
    expect(typeof mount.attach).toBe('function');
    expect(typeof mount.update).toBe('function');
    expect(typeof mount.dispose).toBe('function');
    mount.update({
      buildLayout: () => {
        throw new Error('no canvas in node');
      },
      onAction: vi.fn(),
    });
    mount.dispose();
  });
});
