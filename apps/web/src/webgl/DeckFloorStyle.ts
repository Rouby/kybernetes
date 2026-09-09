/** Pure mapping from deck room id to the DECK_FLOOR_FS finish. The shader branches (bridge slate, catwalk, tread plate) were unreachable: the old map used legacy keys that match no real room id, so every deck fell through to the near-white bunks fallback. */
export interface DeckFloorStyle {
  readonly type: number;
  readonly color: readonly [number, number, number];
}
const CLEAN_LIVING: readonly [number, number, number] = [0.9, 0.92, 0.95];
const WORN_CABIN: readonly [number, number, number] = [0.42, 0.36, 0.29];
export function bareDeckRoomId(roomId: string): string {
  const dot = roomId.indexOf('.');
  return dot < 0 ? roomId : roomId.slice(dot + 1);
}
export function deckFloorType(roomId: string): number {
  switch (bareDeckRoomId(roomId)) {
    case 'bruecke':
    case 'kommando':
      return 0;
    case 'korridor_mitte':
    case 'korridor_ost':
    case 'korridor_schiff':
    case 'andock_tube':
      return 3;
    case 'sicherheit_nord':
    case 'sicherheit_sued':
      return 4;
    case 'frachthalle':
      return 5;
    case 'reaktorraum':
    case 'reaktor_antrieb':
      return 6;
    case 'hydroponik':
      return 8;
    case 'andock_a':
      return 9;
    default:
      return 1;
  }
}
export function deckFloorColor(roomId: string): DeckFloorStyle['color'] {
  const bare = bareDeckRoomId(roomId);
  if (bare === 'kajute_nord' || bare === 'kajute_sued') return WORN_CABIN;
  return CLEAN_LIVING;
}
export function deckFloorStyle(roomId: string): DeckFloorStyle {
  return { type: deckFloorType(roomId), color: deckFloorColor(roomId) };
}
