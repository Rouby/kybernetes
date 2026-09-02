---
"@kybernetes/server": minor
---

### Authoritative Server Loop, Subsystem Ticking & Naval Threat Ingestion

- **10Hz Authoritative Tick Loop (`server.ts`)**:
  - Deterministically ticks vessel state (`reactor`, `lifeSupport`, `hull`, `shields`, `defense`, `activeFires`, and `activeEvents`).
  - Broadcasts delta telemetry frames (`TELEMETRY_DELTA`) at 10Hz to all connected client sockets.
- **Damage Control Client Action Handlers**:
  - Handles `TOGGLE_BATTLE_STATIONS`, `TRIGGER_PDT_INTERCEPT`, `DEPLOY_FIRE_SUPPRESSION`, `EMERGENCY_HULL_REPAIR`, `VENT_REACTOR_COOLANT`, and `TRIGGER_NAVAL_EVENT`.
  - Dispatches immediate state delta broadcasts upon client triage actions.
  - Broadcasts `DAMAGE_TRIAGE_RESULT` and `SHIP_ALERT` packets across the active crew.
