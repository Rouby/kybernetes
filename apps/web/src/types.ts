export interface ActiveInteraction {
  stationId: string;
  stationName: string;
  actionName: string;
  verb: string;
  type?: 'duty' | 'rest' | 'paste' | 'water' | 'coolant';
  dutyId?: string;
  durationSeconds: number;
  elapsedSeconds?: number;
  progress: number;
  worldX?: number;
  worldY?: number;
  color?: string;
}
