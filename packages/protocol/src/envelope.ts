/**
 * Protocol v2 envelope. Every packet on the wire carries v/tick/serverTimeMs/type.
 * Old unversioned (v1) packets are rejected with a HELLO_MISMATCH notice.
 * Pure types + guards only; no DOM/Node imports.
 */

export const PROTOCOL_VERSION = 2 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

export interface Envelope {
  readonly v: ProtocolVersion;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly type: string;
}

export interface HelloMismatchNotice extends Envelope {
  readonly type: 'HELLO_MISMATCH';
  readonly expectedVersion: ProtocolVersion;
  readonly receivedVersion: number | undefined;
  readonly message: string;
}

export function makeEnvelope(type: string, tick: number, serverTimeMs: number): Envelope {
  return { v: PROTOCOL_VERSION, tick, serverTimeMs, type };
}

export function makeHelloMismatch(
  tick: number,
  serverTimeMs: number,
  receivedVersion: number | undefined
): HelloMismatchNotice {
  return {
    v: PROTOCOL_VERSION,
    tick,
    serverTimeMs,
    type: 'HELLO_MISMATCH',
    expectedVersion: PROTOCOL_VERSION,
    receivedVersion,
    message: `Protocol mismatch: server speaks v${PROTOCOL_VERSION}. Please refresh the client.`,
  };
}

export function isV2Packet(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.v === PROTOCOL_VERSION && typeof record.type === 'string';
}

export function readPacketVersion(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const version = (value as Record<string, unknown>).v;
  return typeof version === 'number' ? version : undefined;
}
