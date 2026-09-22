/**
 * Universe branded ids (Strike 1).
 * Plain strings no longer flow through universe lookups: hub, body, frame,
 * dock, and hull ids are distinct types so the 'hub_a' vs 'station' alias
 * confusion becomes a compile error instead of a runtime overlap.
 * Pure types only; no DOM/Node imports.
 */

export type BodyId = string & { readonly __bodyId: unique symbol };
export type HubId = string & { readonly __hubId: unique symbol };
export type FrameId = string & { readonly __frameId: unique symbol };
export type DockId = string & { readonly __dockId: unique symbol };
export type HullId = string & { readonly __hullId: unique symbol };

export function asBodyId(id: string): BodyId {
  return id as BodyId;
}

export function asHubId(id: string): HubId {
  return id as HubId;
}

export function asFrameId(id: string): FrameId {
  return id as FrameId;
}

export function asDockId(id: string): DockId {
  return id as DockId;
}

export function asHullId(id: string): HullId {
  return id as HullId;
}
