import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hudFonts, hudTheme } from './theme';

describe('ui-tokens theme', () => {
  it('keeps plain values in sync with StyleX vars', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'tokens.stylex.ts'), 'utf8');
    for (const key of Object.keys(hudTheme)) {
      expect(source).toContain(key + ':');
    }
    for (const key of Object.keys(hudFonts)) {
      expect(source).toContain(key + ':');
    }
    expect(hudTheme.bgVoid).toBe('#06080c');
    expect(hudTheme.cyanTelemetry).toBe('#00e5ff');
    expect(hudFonts.fontMono).toContain('Courier New');
  });
});
