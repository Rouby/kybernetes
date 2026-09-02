---
"@kybernetes/web": minor
---

### Tactical Telemetry HUD, Damage Control Triage & Viewport Hazards

![Kybernetes Milestone 3 Tactical Telemetry & Subsystems](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone3_viewport.png)

- **Diegetic Tactical Telemetry Rail (`TelemetryRail.tsx`)**:
  - Modular StyleX panels: `AlertHeader`, `ReactorSection`, `AtmosphereSection`, `HullShieldsSection`, and `ThreatTickerSection`.
  - Real-time thermal progress gauges (MW output vs Kelvin temperature), life support scrubber efficiency bars, and kinetic shield / hull integrity bars.
  - Interactive damage triage actions: Emergency Reactor Coolant Venting (-150K), Point-Defense Kinetic Interception, and Emergency Hull Plating Welding.
- **Canvas Hazard Overlays (`VesselCanvas.tsx`)**:
  - `drawRoomHazards`: Compartment fire rendering with animated radial flame glow and breach atmospheric decompression with cyan venting fog.
  - `drawAlertOverlay`: Pulsing emergency klaxon vignette for Red Alert battle stations.
- **Authoritative Client WebSocket Protocol (`useVesselSocket.ts`)**:
  - Persistent WebSocket connection to `ws://localhost:3001` with action queuing during handshake and real-time damage triage notification banners.
- **Playwright Verification (`e2e/milestone3.spec.ts`)**:
  - Comprehensive browser tests verifying Battle Stations alert switching, real-time subsystem readouts, naval torpedo interception, and coolant venting.
