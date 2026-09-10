/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import type { HarborIdentityState } from '../harbor/identity';
import { applySwatchPick } from './customizePick';

function draft(): HarborIdentityState {
  return { userId: 'u1', callsign: 'Rook', color: '#ffd166', trim: 'ember', thruster: 'cyan' };
}

describe('applySwatchPick', () => {
  it('sanitizes tint picks', () => {
    const onChange = vi.fn();
    applySwatchPick('tint:#00e5ff', draft(), onChange);
    expect(onChange).toHaveBeenCalledWith({ ...draft(), color: '#00e5ff' });
    applySwatchPick('tint:neon', draft(), onChange);
    expect(onChange).toHaveBeenLastCalledWith({ ...draft(), color: '#ffd166' });
  });

  it('guards trim and thruster picks', () => {
    const onChange = vi.fn();
    applySwatchPick('trim:ion', draft(), onChange);
    expect(onChange).toHaveBeenCalledWith({ ...draft(), trim: 'ion' });
    applySwatchPick('trim:bogus', draft(), onChange);
    applySwatchPick('thruster:amber', draft(), onChange);
    expect(onChange).toHaveBeenLastCalledWith({ ...draft(), thruster: 'amber' });
    applySwatchPick('thruster:bogus', draft(), onChange);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores unknown ids', () => {
    const onChange = vi.fn();
    applySwatchPick('embark', draft(), onChange);
    applySwatchPick('field:callsign', draft(), onChange);
    expect(onChange).not.toHaveBeenCalled();
  });
});
