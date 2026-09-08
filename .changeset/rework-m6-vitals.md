---
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
---

M6 survival and combat slice: vitals tick, suit discipline, server raycast fire

- World vitals tick fed by authoritative atmos probes: pO2 hypoxia, vacuum and
  thermal drains with suit oxygen and battery gating, hunger/thirst/fatigue,
  bleedout with incapacitation and stabilized revive. Suit, consume, and sleep
  intents plus per-input facing and suit state complete the pawn contract.
- Minimal FIRE: server-side raycast against walls, shut doors, and pawns.
  Doors lose integrity and become connecting holes; breached walls add hole
  portals the air authority reconciles into live airflow. Hit resolution fills
  hp only, leaving the limb/organ seam untouched for the elaborate model.
- Legacy flat vitals tick deprecated and frozen. Preview gains suit and fire
  keys with live vitals stats and Playwright coverage for seal-matters and
  shoot-to-vent journeys.
