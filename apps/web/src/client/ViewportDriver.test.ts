/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { ViewportDriver } from './ViewportDriver';

function viewProps(): import('../harbor/viewportFrame').HarborViewportProps {
  return {
    aimLockedRef: { current: false },
    onFireDown: vi.fn(),
    onFireUp: vi.fn(),
  } as unknown as import('../harbor/viewportFrame').HarborViewportProps;
}

describe('ViewportDriver lifecycle', () => {
  it('exposes attach, detach, and update for mounts', () => {
    const driver = new ViewportDriver();
    expect(typeof driver.attach).toBe('function');
    expect(typeof driver.detach).toBe('function');
    expect(typeof driver.update).toBe('function');
    driver.detach();
  });

  it('accepts view props without a canvas', () => {
    const driver = new ViewportDriver();
    driver.update(viewProps());
    driver.detach();
  });
});
