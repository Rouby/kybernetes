---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Drag-to-pack Phase 1: mixed-crate contents model

- Crates now carry `items: [{goodId, qty}]` instead of a single good:
  spawn validates shape plus a footprint-area bound (`overfilled`), unpack
  fans out per good, and re-pack takes an items list against secured
  counts. Seeded bay crates include a mixed crate.
- Market kernel prices mixed contents per good (`MARKET_BUY` takes an
  items list; sells pay per content and restock per content).
- Wire: `MARKET_BUY` / `CARGO_REPACK` carry items arrays (shape-only
  validators; the kernel enforces area, prices, stock, and funds) and
  `CrateSnapshot` carries contents. Panels keep sealing single-good
  crates via auto-pack until the Phase 2 physics screen builds multi
  arrays from drag placement.
- Fixed `tickCargo` discarding the synced hold when nobody died that
  tick (carried crates never moved server-side; drops landed at the
  pickup spot), covered by a walking-pawn regression test.
