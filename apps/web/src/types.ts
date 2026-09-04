export interface ActiveInteraction {
  stationId: string;
  stationName: string;
  actionName: string;
  verb: string;
  type?: 'duty' | 'rest' | 'paste' | 'water' | 'coolant' | 'suit_o2';
  dutyId?: string;
  durationSeconds: number;
  elapsedSeconds?: number;
  progress: number;
  worldX?: number;
  worldY?: number;
  color?: string;
}
