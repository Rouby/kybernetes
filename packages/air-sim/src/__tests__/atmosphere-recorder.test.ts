import { describe, expect, it, vi } from 'vitest';
import { SimulationRecorder } from '../../test-recorder/atmosphere-recorder';
import { AtmosphereSimulation, GasType, Portal, PortalType, Room } from '..';

function fixture(side: 'north' | 'south' | 'east' | 'west' = 'east') {
  const sim = new AtmosphereSimulation();
  const room = new Room(
    { id: 'room', x: 2, y: 3, width: 4, length: 3, height: 2.5 },
    {
      moles: { [GasType.Oxygen]: 21, [GasType.Nitrogen]: 79, [GasType.CarbonDioxide]: 0 },
      temperatureK: 300,
    }
  );
  const door = new Portal({
    id: 'vent',
    type: PortalType.Door,
    roomA: room,
    roomB: null,
    maxArea: 1,
    openRatio: 0,
    side,
    position: 0.5,
  });
  sim.addRoom(room);
  sim.addPortal(door);
  return { sim, room, door, recorder: new SimulationRecorder(sim) };
}

describe('timed portal recordings', () => {
  it('splits steps at off-grid event times and preserves closed-room gas until opening', () => {
    const { sim, room, recorder } = fixture();
    const steps = vi.spyOn(sim, 'step');
    recorder.runWithRecording(0.2, 0.05, [
      { atSeconds: 0.075, portalId: 'vent', openRatio: 1, label: 'Vent room' },
      { atSeconds: 0.125, portalId: 'vent', openRatio: 0, label: 'Seal vent' },
    ]);
    const recording = recorder.getRecording('timed', 0.05);
    const opening = recording.frames.find((frame) => frame.time === 0.075);
    const closing = recording.frames.find((frame) => frame.time === 0.125);
    expect(opening?.rooms.room.totalMoles).toBe(100);
    expect(opening?.portals.vent.openRatio).toBe(1);
    expect(closing?.portals.vent.openRatio).toBe(0);
    expect(closing?.portals.vent.effectiveArea).toBe(0);
    expect(room.totalMoles).toBeLessThan(100);
    expect(room.totalMoles).toBe(closing?.rooms.room.totalMoles);
    expect(steps.mock.calls.every(([dt]) => dt > 0 && dt <= 0.05 + 1e-12)).toBe(true);
    expect(recording.totalTime).toBe(0.2);
    expect(recording.frames.at(-1)?.time).toBe(0.2);
    expect(recording.events.map((event) => event.atSeconds)).toEqual([0.075, 0.125]);
  });

  it('sorts events without mutating the input and applies same-time actions in input order', () => {
    const { door, recorder } = fixture();
    const events = [
      { atSeconds: 0.1, portalId: 'vent', openRatio: 0 },
      { atSeconds: 0, portalId: 'vent', openRatio: 1 },
      { atSeconds: 0, portalId: 'vent', openRatio: 0.25 },
    ];
    recorder.runWithRecording(0.1, 0.1, events);
    const recording = recorder.getRecording('boundary', 0.1);
    expect(events[0].atSeconds).toBe(0.1);
    expect(recording.events.map((event) => event.openRatio)).toEqual([1, 0.25, 0]);
    expect(recording.frames[0].portals.vent.openRatio).toBe(0.25);
    expect(recording.frames[0].portals.vent.effectiveArea).toBe(0.25);
    expect(door.openRatio).toBe(0);
    expect(recording.frames.at(-1)?.portals.vent.openRatio).toBe(0);
  });

  it('handles partial final steps and continuation without duplicate or reset timestamps', () => {
    const { recorder } = fixture();
    recorder.runWithRecording(0.125, 0.1);
    const first = recorder.getRecording('first', 0.1);
    recorder.runWithRecording(0.125, 0.1, [{ atSeconds: 0.125, portalId: 'vent', openRatio: 1 }]);
    const second = recorder.getRecording('second', 0.1);
    expect(first.frames.map((frame) => frame.time)).toEqual([0, 0.1, 0.125]);
    expect(first.frames.at(-1)?.portals.vent.openRatio).toBe(0);
    expect(second.frames.map((frame) => frame.time)).toEqual([0, 0.1, 0.125, 0.225, 0.25]);
    expect(second.frames[2].portals.vent.openRatio).toBe(1);
    expect(second.events).toHaveLength(1);
    expect(second.totalTime).toBe(0.25);
  });

  it('captures an initial frame for a zero-duration run', () => {
    const { recorder } = fixture();
    recorder.runWithRecording(0, 0.05);
    expect(recorder.getRecording('zero', 0.05).frames.map((frame) => frame.time)).toEqual([0]);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid dt %s', (dt) => {
    expect(() => fixture().recorder.runWithRecording(1, dt)).toThrow(RangeError);
  });
  it.each([-1, NaN, Infinity])('rejects invalid duration %s', (duration) => {
    expect(() => fixture().recorder.runWithRecording(duration, 0.05)).toThrow(RangeError);
  });
  it.each([
    { atSeconds: -1, portalId: 'vent', openRatio: 1 },
    { atSeconds: 2, portalId: 'vent', openRatio: 1 },
    { atSeconds: NaN, portalId: 'vent', openRatio: 1 },
    { atSeconds: 0.1, portalId: 'vent', openRatio: -1 },
    { atSeconds: 0.1, portalId: 'vent', openRatio: 2 },
    { atSeconds: 0.1, portalId: 'vent', openRatio: NaN },
    { atSeconds: 0.1, portalId: 'missing', openRatio: 1 },
  ])('validates the whole schedule before mutating state: %j', (invalid) => {
    const { recorder, room, door } = fixture();
    expect(() =>
      recorder.runWithRecording(1, 0.05, [
        { atSeconds: 0, portalId: 'vent', openRatio: 1 },
        invalid,
      ])
    ).toThrow();
    expect(room.totalMoles).toBe(100);
    expect(door.openRatio).toBe(0);
    expect(recorder.getRecording('invalid', 0.05).frames).toHaveLength(0);
  });

  it.each([
    ['north', 'horizontal', 3.5, 3],
    ['south', 'horizontal', 3.5, 6],
    ['east', 'vertical', 6, 4],
    ['west', 'vertical', 2, 4],
  ] as const)('keeps a closed %s door visible on the correct wall', (side, orientation, x, y) => {
    const { recorder } = fixture(side);
    recorder.runWithRecording(0, 0.05);
    const recording = recorder.getRecording('layout', 0.05);
    expect(recording.layout.portals[0]).toMatchObject({ orientation, x, y, length: 1 });
    expect(recording.frames[0].portals.vent.effectiveArea).toBe(0);
  });
});
