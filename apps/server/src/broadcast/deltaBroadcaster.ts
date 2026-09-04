import type {
  CollabShiftUpdateBroadcast,
  CrewManifestBroadcast,
  DualProtocolBroadcast,
  LobbyStateBroadcast,
  PawnState,
  ServerBroadcast,
  SpatialSnapshotBroadcast,
  VitalsDeltaBroadcast,
} from '@kybernetes/protocol';
import { stateToTelemetryBroadcast } from '@kybernetes/sim-core';
import { WebSocket } from 'ws';
import type { ClientSession, VesselSession } from '../types';

export function broadcastToSession(session: VesselSession, broadcast: ServerBroadcast): void {
  const payload = JSON.stringify(broadcast);
  for (const client of session.clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function broadcastVitals(client: ClientSession): void {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  const broadcast: VitalsDeltaBroadcast = {
    type: 'VITALS_DELTA',
    playerId: client.id,
    vitals: client.vitals,
    credits: client.credits,
    clearanceLevel: client.clearanceLevel,
  };
  client.ws.send(JSON.stringify(broadcast));
}

export function broadcastCrewManifest(session: VesselSession): void {
  const humanCrew = Array.from(session.clients.values()).map((c) => ({
    id: c.id,
    callsign: c.callsign,
    role: c.role,
    deckId: 'deck_a',
    status: c.status,
    dutyName: c.dutyName,
  }));
  const botCrew = Array.from(session.bots.values()).map((b) => ({
    id: b.id,
    callsign: b.persona.callsign,
    role: b.role,
    deckId: 'deck_a',
    status: (b.state === 'working_station' ? 'on_duty' : 'idle') as 'on_duty' | 'idle',
    dutyName: b.state === 'working_station' ? 'Department Maintenance' : undefined,
  }));
  const broadcast: CrewManifestBroadcast = {
    type: 'CREW_MANIFEST',
    crew: [...humanCrew, ...botCrew],
  };
  broadcastToSession(session, broadcast);
}

export function broadcastSpatialSnapshot(session: VesselSession): void {
  const pawns: PawnState[] = [
    ...Array.from(session.clients.values()).map((c) => c.pawn),
    ...Array.from(session.bots.values()).map((b) => b.pawn),
  ];
  const snapshot: SpatialSnapshotBroadcast = {
    type: 'SPATIAL_SNAPSHOT',
    timestamp: Date.now(),
    pawns,
    bulkheads: [],
  };
  broadcastToSession(session, snapshot);
}

export function sendInitialPackets(client: ClientSession, session: VesselSession): void {
  const lobbyBroadcast: LobbyStateBroadcast = {
    type: 'LOBBY_STATE',
    vesselCode: session.code,
    shipName: session.vesselState.shipName,
    connectedCrew: session.clients.size,
  };
  const telemetry = stateToTelemetryBroadcast(session.vesselState);
  client.ws.send(JSON.stringify(lobbyBroadcast));
  client.ws.send(JSON.stringify(telemetry));
  broadcastVitals(client);

  if (session.dualProtocol.stage === 'primed') {
    const protoUpdate: DualProtocolBroadcast = {
      type: 'DUAL_PROTOCOL_UPDATE',
      protocolId: session.dualProtocol.protocolId,
      stage: 'primed',
      initiatorCallsign: session.dualProtocol.initiatorCallsign,
      initiatorStation: session.dualProtocol.initiatorStation,
      targetStation: session.dualProtocol.targetStation,
      remainingSeconds: session.dualProtocol.remainingSeconds,
      title: session.dualProtocol.title,
      message: `${session.dualProtocol.initiatorCallsign} primed ${session.dualProtocol.title}! 10s Window to synchronize from Bridge Helm!`,
      timestamp: Date.now(),
    };
    client.ws.send(JSON.stringify(protoUpdate));
  }

  if (session.collabShift.participants.length > 0) {
    const shiftBroadcast: CollabShiftUpdateBroadcast = {
      type: 'COLLAB_SHIFT_UPDATE',
      shiftId: session.collabShift.shiftId,
      title: session.collabShift.title,
      stationId: session.collabShift.stationId,
      progressPercent: session.collabShift.progressPercent,
      participants: session.collabShift.participants,
      isCompleted: session.collabShift.isCompleted,
      timestamp: Date.now(),
    };
    client.ws.send(JSON.stringify(shiftBroadcast));
  }
}
