---
"@kybernetes/protocol": minor
---

### Wire Contracts for Vessel Telemetry & Naval Damage Events

- Added `SubsystemStatus` discriminant tags (`nominal | degraded | critical`).
- Added telemetry schemas: `ReactorTelemetry`, `LifeSupportTelemetry`, `HullTelemetry`, `ShieldTelemetry`, and `DefenseTelemetry`.
- Added naval combat wire schemas: `NavalDamageEvent`, `NavalDamageEventType`, and `NavalDamageEventStatus`.
- Added damage control client action intents: `TriggerPdtInterceptAction`, `DeployFireSuppressionAction`, `EmergencyHullRepairAction`, `VentReactorCoolantAction`, and `TriggerNavalDamageEventAction`.
- Added server broadcasts: `NavalDamageEventBroadcast` and `DamageTriageBroadcast`, and extended `TelemetryDeltaBroadcast` with all active subsystem state.
