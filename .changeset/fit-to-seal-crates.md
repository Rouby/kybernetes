---
'@kybernetes/sim-core': patch
'@kybernetes/protocol': patch
---

Packing / sealing crates is no longer artificially limited: a crate seals iff its footprint area fits (`crateAreaOf <= CRATE_AREA`). Removed the 10-units-per-good and 6-lines-per-crate caps in cargo, market, and protocol trade validators; overfilled loads still reject with `overfilled`.
