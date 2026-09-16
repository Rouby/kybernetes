/**
 * Session actions: keyboard intents behind the pause/death gate. Pure and
 * pinned by Vitest; the vanilla ActionRouter owns the window listeners.
 */

import type { FixtureKind } from '@kybernetes/protocol';
import type { InteractTarget } from './interactTarget';

export type GameplayAction =
  | 'use'
  | 'talk'
  | 'hire'
  | 'seal'
  | 'fire'
  | 'reload'
  | 'cargo'
  | 'drop'
  | 'unpack';

export type ConsoleKind =
  | 'reactor_console'
  | 'engine_console'
  | 'nav_console'
  | 'cargo'
  | 'market'
  | 'sell'
  | 'pack';

/** Fixture kinds that open a console panel instead of firing a one-shot intent. */
export function consoleKindOf(target: InteractTarget | null): ConsoleKind | null {
  if (target === null || target.kind !== 'fixture') return null;
  return consoleKindOfFixture(target.contact.kind);
}

function consoleKindOfFixture(kind: FixtureKind): ConsoleKind | null {
  if (kind === 'reactor_console' || kind === 'engine_console' || kind === 'nav_console')
    return kind;
  if (kind === 'market_stall') return 'market';
  return null;
}

export function actionKeyFor(key: string, hasOffer: boolean): GameplayAction | null {
  if (key === 'e') return 'use';
  if (key === 'h') return 'talk';
  if (key === 'j') return hasOffer ? 'hire' : null;
  if (key === 't') return 'seal';
  if (key === 'f') return 'fire';
  if (key === 'r') return 'reload';
  if (key === 'c') return 'cargo';
  if (key === 'g') return 'drop';
  if (key === 'u') return 'unpack';
  return null;
}
