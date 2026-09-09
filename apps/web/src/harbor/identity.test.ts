import { describe, expect, it } from 'vitest';
import { loadIdentity, sanitizeCallsign, sanitizeColor, saveIdentity } from './identity';

function fakeStore(initial: Record<string, string> = {}) {
  const table = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => table.get(key) ?? null,
    setItem: (key: string, value: string) => {
      table.set(key, value);
    },
    table,
  };
}

describe('harbor identity store', () => {
  it('loads defaults for a fresh player', () => {
    const store = fakeStore();
    const identity = loadIdentity(store);
    expect(identity.callsign).toBe('Rook');
    expect(identity.color).toBe('#ffd166');
    expect(identity.trim).toBe('ember');
    expect(identity.thruster).toBe('cyan');
    expect(identity.userId.startsWith('u-')).toBe(true);
    expect(store.table.get('harbor.userId')).toBe(identity.userId);
  });

  it('round-trips customization and sanitizes bad input', () => {
    const store = fakeStore();
    saveIdentity(store, {
      userId: 'u-test',
      callsign: '  Nova-9  ',
      color: '#123abc',
      trim: 'ion',
      thruster: 'amber',
    });
    expect(loadIdentity(store).callsign).toBe('Nova-9');
    expect(loadIdentity(store).trim).toBe('ion');
    expect(sanitizeCallsign('   ')).toBe('Rook');
    expect(sanitizeCallsign('x'.repeat(40)).length).toBe(24);
    expect(sanitizeColor('neon')).toBe('#ffd166');
    expect(sanitizeColor('#ABCDEF')).toBe('#ABCDEF');
  });

  it('falls back to defaults for unknown presets', () => {
    const store = fakeStore({ 'harbor.trim': 'neon', 'harbor.thruster': 'red' });
    const identity = loadIdentity(store);
    expect(identity.trim).toBe('ember');
    expect(identity.thruster).toBe('cyan');
  });
});
