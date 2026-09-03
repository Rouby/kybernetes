---
'@kybernetes/sim-core': minor
'@kybernetes/web': minor
---

Implement Pure Procedural Web Audio Sound Engine with 2D spatial acoustics, bulkhead occlusion, and telemetry-driven living ship dynamics:
- Pure spatial acoustic calculations in `packages/sim-core/src/spatial/acoustics.ts`: distance attenuation, stereo pan, bulkhead intersection raycasting through opaque hull geometry and doors, and multi-tier acoustic cutoff filters (20kHz -> 1.2kHz -> 380Hz)
- Zero-external-sample procedural sound engine in `apps/web/src/audio/` using pure Web Audio API synthesis:
  - `ReactorDroneSynth`: Continuous dual-triangle reactor drone scaling with output MW (48Hz -> 72Hz), pink noise air loop rolling off with O2 depletion, and 15.6kHz CRT flyback whine on Command Bridge
  - `MetallicPlateSynth`: Deck surface-aware footsteps (steel deck, engineering grate, bridge linoleum) and structural hull creaks/groans under damage (<50% integrity)
  - `PneumaticSynth`: High-pressure pneumatic equalization sweeps, solenoid latch clicks, and decompression venting bursts
  - `BallisticsSynth`: Kinetic carbine Dirac pop/thud, pulse laser frequency chirps, arc welder continuous plasma sizzle, raider plasma shots, and ricochet/impact thuds
  - `TerminalUiSynth`: Tactile mechanical switch clacks, station interaction prompt chirps, telemetry packet squelches, and heavy debrief evaluation stamp thuds
  - `VitalsMonitorSynth`: Procedural heartbeat accelerated by fatigue and low health, suffocation inhale/exhale sweeps when O2 <= 25%, and post-explosion tinnitus ringing
  - `AlarmSynth`: Dual-tone red alert sirens, caution chimes, and Geiger counter clicks
- 5-Bus Gain Routing (`master`, `ambience`, `foley`, `ui`, `crisis`) with dynamic master crisis low-pass filter ducking and `localStorage` persistence
- StyleX `AudioSettingsModal` with volume sliders, test audio triggers, mute toggle, and reactive state synchronization
- Viewport integration: WebGL top bar button `AUDIO [O]`, hotkeys `[O]` (mixer modal) and `[U]` (quick mute), footstep distance cadence tracking (every 56px), and Playwright e2e test suite (`audio.spec.ts`)
