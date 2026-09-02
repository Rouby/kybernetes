---
"@kybernetes/protocol": minor
---

### Wire Contracts & Spatial Schemas

- Added `WallSegment` schema (`x1, y1, x2, y2, isOpaque, thickness`) defining physical bulkheads and occlusion geometry.
- Added `DeckDefinition` schema for complete deck layouts, machine fixtures, and departmental spawn coordinates.
- Added `DutyDefinition` schema declaring ship duties, station bindings, base shift durations, and clearance reward matrices.
- Added `DutyCompletedBroadcast` for wire dispatch of completed shift duties, credit earnings, and clearance XP progression.
- Extended `StationFixture` with optional contextual in-world interaction prompt strings (`prompt?: string`).
