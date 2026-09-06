# Atmospheric scenario recordings

Run `yarn workspace @kybernetes/air-sim test`, then open or reload
`packages/air-sim/atmos-report.html`. Select a scenario and play, step, or scrub
through it. Door colors/status and the event timeline follow the selected frame.

## Timed door changes

Pass an optional schedule as the third argument to `runWithRecording`:

```ts
const recorder = new SimulationRecorder(sim);
recorder.runWithRecording(35, 0.05, [
  { atSeconds: 10, portalId: corridorDoor.id, openRatio: 1, label: 'Open Corridor' },
  { atSeconds: 20, portalId: habitatDoor.id, openRatio: 0.25, label: 'Crack Habitat door' },
  { atSeconds: 25, portalId: habitatDoor.id, openRatio: 0, label: 'Seal Habitat' },
]);
task.meta.atmosphereRecordings = [recorder.getRecording('My scenario', 0.05)];
```

- `atSeconds` is absolute simulated time from the start of the recorder, not wall-clock time.
- `openRatio` supports closed (`0`), partially open (`0..1`), and fully open (`1`).
- Portal IDs must uniquely identify a portal already registered in the simulation.
- Events are sorted chronologically; equal-time events retain their input order.
- A physics step is split at an event time, even when it falls between normal ticks.
  The frame at that instant shows the changed door before subsequent gas transfer.
- Events at zero or the run's end are included. Invalid times/ratios/IDs are rejected
  before any simulation state changes. All supplied events must fall within the run.
- Further calls append simulated duration without resetting time. Supply absolute
  event times within that new run; use a new recorder/simulation to restart.

## Complex examples

`src/__tests__/ship-atmosphere.test.ts` includes:

- **Sequential Vacuum Cascade:** the Airlock vents first; at 10 s its Corridor door
  opens; at 30 s the Habitat door opens. Assertions verify each downstream room is
  below 1 Pa before the next door opens, while the sealed upstream room retains pressure.
- **Bulkhead Isolation & Controlled Repressurization:** vent at 2 s, isolate Habitat
  and Lab at 3.5 s, seal the outlet at 12 s, then partially and fully reopen internal
  doors to redistribute the surviving air. This does not create replacement gas.

“Empty” means near vacuum (below 1 Pa), not exactly zero moles: the solver deliberately
stops negligible pressure-gradient flow. These are timed actions, not pressure-triggered actions.
