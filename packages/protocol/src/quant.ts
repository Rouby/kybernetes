/**
 * Wire quantization: round floats before JSON so snapshots stay small and
 * byte-stable while values are visually identical. Pure helpers only.
 */

export function q2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function q1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function q0(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** True when two floats differ by more than eps (change suppression). */
export function changedBy(a: number, b: number, eps: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a !== b;
  return Math.abs(a - b) > eps;
}

/** FNV-1a digest over short strings (portal/frame revs, manifest/watch revs). */
export function digestStrings(parts: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
