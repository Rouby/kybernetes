/**
 * Engine-side spatial voice management: one pooled AcousticSpatializer
 * voice per foley event with an upper-bound hold. Voices are permanently
 * wired, so combat never allocates graph nodes and never leaks them.
 */
import type { DoorState } from '@kybernetes/protocol';
import type { AcousticSpatializer } from './AcousticSpatializer';

export class SpatialFoleyPool {
  constructor(
    private readonly spatializer: AcousticSpatializer,
    private readonly destination: AudioNode
  ) {}

  /**
   * Check out a panned voice at (x, y) for a listener at (lx, ly).
   * Returns null when the voice is culled below the gain floor.
   */
  acquire(
    listenerX: number,
    listenerY: number,
    x: number,
    y: number,
    doors: DoorState[] | undefined,
    gainFloor: number,
    holdSeconds: number
  ): AudioNode | null {
    const params = this.spatializer.calculate(listenerX, listenerY, x, y, doors);
    if (params.gain < gainFloor) return null;
    const channel = this.spatializer.acquireChannel(this.destination, holdSeconds);
    this.spatializer.applySpatialParams(channel, params, 0.01);
    return channel.input;
  }
}
