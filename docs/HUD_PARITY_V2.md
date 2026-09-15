# HUD parity matrix (PRD pillar 7 over protocol v2)

Every visor element and the channel that feeds it. Builders live in
`@kybernetes/sim-core` (`world/channels.ts`) so the server and any client
consume identical payloads; `channels.test.ts` asserts every field is populated
from live world state with no mock data.

## Covered 1:1 by channels

| Visor element | Channel | Source fields |
| --- | --- | --- |
| Header vessel/beacon | `MANIFEST` | `beacon`, `shipName` from the vessel frame |
| Crew card | `MANIFEST` | `crew[]` (id, callsign, role, frameId) |
| Clearance + credits | `VITALS` (per player) | `clearance`, `credits` from crew records |
| Vitals + suit | `VITALS` | hunger/thirst/fatigue/health/hypoxia/suitSealed from vitals records |
| Subsystem gauges | `TELEMETRY.subsystems` | hull (breach-derived), atmos (mean pressure %), watch (task progress %), crew (aboard count) |
| Atmos + ECS REPRESSURIZING | `TELEMETRY.atmos` | per-room pressure/temp/O2/CO2 plus the repressurizing flag |
| Checklist + projected grade + timer | `WATCH` | checklist items, live-projected or final grade, remainingS |
| Weapon ammo | `VITALS` | ammo/reserve/mags per pawn; empty mag refuses fire until reload |
| Progress ring | `WATCH` | derived client-side from checklist done/total |
| Notices | `NOTICE` | severity/title/message |
| Bot voice lines | `SNAPSHOT` pawns | `say` present while the line is live |
| Crew presence + movement | `SNAPSHOT` | pawns (pos/vel/frame/room/color), portals, frames |

## Composed client-side (no new wire)

| Visor element | Composition |
| --- | --- |
| E prompt | nearest interactable from `SNAPSHOT` pawn position plus portal/fixture proximity |
| Sensor legend | static legend; colors match portal states and atmos bands |
| Hover dossier | `MANIFEST` identity plus `SNAPSHOT` pawn plus crew role |
| Room summary | pawn roomHint joined to `TELEMETRY.atmos` for that room |

## Explicitly out of this rework

| Visor element | Status |
| --- | --- |
| Weapon bloom/shake | Composed client-side: sustained fire widens sim-side aim bloom and trauma-scaled camera shake; neither blocks the trigger. |
| Dual/collab cards | Deleted concept: two-player watch tasks subsume them if revived. |
| Reactor-as-gauge numbers | No reactor sim in the new kernel; hull/atmos/watch/crew gauges stand in until reactor returns as a watch-task subsystem. |

## Transport note

Cutover C4 serves these channels on the default route: the harbor daemon is
the live socket and HarborViewport feeds the frozen WebGL visor from them
(pawns/doors/atmos/vitals/watch/manifest plus audio ambience). The preview
harness (`?hull=&play=`) is deleted; the harbor journey specs prove every
channel end to end.