/**
 * Death-screen copy: pure translation from authoritative death state to
 * terminal strings. Kept out of components so Vitest covers the wording
 * and the canvas terminal pass can reuse the same lines.
 */

import type { DeathCause, VitalsBroadcast } from '@kybernetes/protocol';

export function isDeathVitals(vitals: VitalsBroadcast | null | undefined): boolean {
  return vitals?.vitals.dead === true;
}

function deathCauseLabel(cause: DeathCause | undefined): string {
  switch (cause) {
    case 'vacuum':
      return 'VACUUM EXPOSURE';
    case 'hypoxia':
      return 'HYPOXIA';
    case 'thermal':
      return 'THERMAL FAILURE';
    case 'starvation':
      return 'STARVATION';
    case 'dehydration':
      return 'DEHYDRATION';
    case 'bleedout':
      return 'BLEEDOUT';
    case 'combat':
      return 'COMBAT TRAUMA';
    default:
      return 'SIGNAL LOST';
  }
}

export function deathTitle(cause: DeathCause | undefined): string {
  return 'SIGNAL LOST // ' + deathCauseLabel(cause);
}

export function deathHint(cause: DeathCause | undefined): string {
  if (cause === 'vacuum' || cause === 'hypoxia') return 'Seal suit before void exposure.';
  if (cause === 'bleedout' || cause === 'combat') return 'Find cover. Watch bleedout timers.';
  if (cause === 'starvation' || cause === 'dehydration') return 'Eat and drink at the mess.';
  if (cause === 'thermal') return 'Regulate heat. Suit battery matters.';
  return 'Restart the run or return to menu.';
}
