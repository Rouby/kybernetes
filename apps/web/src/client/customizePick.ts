/**
 * customizePick: framework-free swatch dispatch (Phase 3 Round 13).
 * Moved out of GlCustomize so the vanilla shell shares it verbatim.
 */

import { isPawnTrim, isThrusterTint } from '@kybernetes/protocol';
import { type HarborIdentityState, sanitizeColor } from '../harbor/identity';

export type DraftChange = (draft: HarborIdentityState) => void;

export function applySwatchPick(
  id: string,
  draft: HarborIdentityState,
  onChange: DraftChange
): void {
  if (id.startsWith('tint:')) onChange({ ...draft, color: sanitizeColor(id.slice(5)) });
  else if (id.startsWith('trim:')) applyTrimPick(id.slice(5), draft, onChange);
  else if (id.startsWith('thruster:')) applyThrusterPick(id.slice(9), draft, onChange);
}

function applyTrimPick(trim: string, draft: HarborIdentityState, onChange: DraftChange): void {
  if (isPawnTrim(trim)) onChange({ ...draft, trim });
}

function applyThrusterPick(
  thruster: string,
  draft: HarborIdentityState,
  onChange: DraftChange
): void {
  if (isThrusterTint(thruster)) onChange({ ...draft, thruster });
}
