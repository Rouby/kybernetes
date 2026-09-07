---
'@kybernetes/sim-core': minor
'@kybernetes/web': patch
---

M2 hull compiler depth: exact door gaps, window panes, sealed-hull checks, visual preview

- Compiler cuts exact door gaps on both sides of every shared-edge portal (no
  hand-placed wall pairs); window portals compile to sealed `window` edges with
  glass panes that pass sight but block movement and airflow; new wall-contact,
  sealed-hull (no exterior holes or unsealed openings), and movement-reachability
  checks fail loudly on bad specs. `window` joins `PortalKind` with connecting
  and airflow semantics pinned down.
- HesperiaV2 rebuilt on true shared-edge adjacency (corridor spine shares edges
  with all nine rooms); StationHub window is a real `window` portal. Both specs
  compile with zero errors and deterministically.
- New `wallBlocksSight` / `wallBlocksMovement` wall semantics (matching the
  frozen LOS and collision conventions) for M3 world wiring.
- Web preview at `?hull=station|hesperia` draws compiled rooms, gap-cut walls,
  panes, and portal markers on a standalone canvas (frozen passes untouched)
  with Playwright visual coverage and archived screenshots.
