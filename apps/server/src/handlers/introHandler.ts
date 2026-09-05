import type {
  AcceptJobOfferAction,
  CaptainJobOfferBroadcast,
  HireableJob,
  JobAssignedBroadcast,
  ShipAlertBroadcast,
  ShipDockingUpdateBroadcast,
} from '@kybernetes/protocol';
import { acceptJobOffer, getShipKinematics, openCaptainOffer } from '@kybernetes/sim-core';
import { WebSocket } from 'ws';
import { broadcastToSession } from '../broadcast/deltaBroadcaster.js';
import type { ClientSession, VesselSession } from '../types.js';

function sendToClient(client: ClientSession, payload: unknown): void {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  client.ws.send(JSON.stringify(payload));
}

function dockingSnapshot(session: VesselSession): ShipDockingUpdateBroadcast {
  return {
    type: 'SHIP_DOCKING_UPDATE',
    phase: session.intro.phase,
    shipName: session.intro.shipName,
    destination: session.intro.destination,
    etaSeconds: session.intro.etaSeconds,
    legIndex: session.intro.legIndex,
    timestamp: Date.now(),
    kinematics: getShipKinematics(session.intro),
  };
}

export function broadcastDocking(session: VesselSession): void {
  broadcastToSession(session, dockingSnapshot(session));
}

export function sendIntroToClient(client: ClientSession, session: VesselSession): void {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  client.ws.send(JSON.stringify(dockingSnapshot(session)));
}

export function syncGauntletDoors(session: VesselSession): void {
  const docked = session.intro.phase === 'docked';
  session.vesselState.boarding.doors = session.vesselState.boarding.doors.map((d) => {
    if (d.id !== 'gauntlet_ship_door' && d.id !== 'gauntlet_station_door') return d;
    if (d.isOpen === docked && d.isSealed === !docked) return d;
    return { ...d, isOpen: docked, isSealed: !docked };
  });
}

export function handleTalkToCaptain(session: VesselSession, client: ClientSession): void {
  if (session.intro.phase !== 'docked') return;
  session.hireOfferCounter += 1;
  const offerId = 'offer_' + String(session.hireOfferCounter);
  const seed = session.hireOfferCounter + session.intro.legIndex * 7;
  const opened = openCaptainOffer(session.intro, offerId, seed);
  session.intro = opened.nextState;
  const direct: CaptainJobOfferBroadcast = { ...opened.offer, timestamp: Date.now() };
  sendToClient(client, direct);
}

export function handleAcceptJobOffer(
  session: VesselSession,
  client: ClientSession,
  action: AcceptJobOfferAction
): void {
  const job: HireableJob = action.job;
  const res = acceptJobOffer(session.intro, action.offerId, job);
  if (!res.accepted) return;
  session.intro = res.nextState;
  const assigned: JobAssignedBroadcast = {
    type: 'JOB_ASSIGNED',
    playerId: client.id,
    job,
    title: job,
    timestamp: Date.now(),
  };
  broadcastToSession(session, assigned);
  broadcastDocking(session);
  const alert: ShipAlertBroadcast = {
    type: 'SHIP_ALERT',
    id: 'depart_' + String(Date.now()),
    severity: 'info',
    title: 'SHIP DEPARTING',
    message: client.callsign + ' signed on as ' + job + '. Undocking in 5s.',
    timestamp: Date.now(),
  };
  broadcastToSession(session, alert);
}
