---
'@kybernetes/web': minor
---

Drag-to-pack Phase 2: physics packing bench

- New `PackStore` owns a headless matter-js world (gravity drop-in,
  spring drag, 15-degree rotate, sleep-based seal gating) with a fixed
  60Hz step, staged budgets derived from latest server state, and
  rejected-seal respawn mirroring the predicted-fire reconcile pattern.
- New pack overlay beside the market and cargo consoles: left palette
  stages unpaid units, right physics canvas takes pointer drags, bottom
  strip seals (per sealed contents), tidies, clears, and closes. Seal
  sends the existing mixed `MARKET_BUY` / `CARGO_REPACK` intents.
- Overlay discipline: opening pack switches the console (pack paints above market/cargo), closing either path shuts both, and pointer capture pauses on pause/death. The pack pass owns its framebuffer/viewport.
- Pack bench presence: ambient HUD widgets yield while open (visor, alerts, and overlay stay), canvas clicks never fire, and the crate renders as subtle wooden slats under the bright goods.
- Bench readability: quiet plank back panel inside the crate, amber outlines on settled bodies left outside, a joined timber look (caps, front face, joints) for the crate itself, and a crate-centered zoom camera shared by layout, physics mapping, and pointer.
- Crate lid ritual: a draggable lid seats across the crate mouth before the seal enables; TIDY seats it, seals ship it with the load and stage a fresh one.
- Joined timber crate sized to its usable interior, full-height plank back panel, red outlines on settled strays (lid exempt), bench zoom filling the canvas, and two brightness passes.
- Left-side staging drop-zone beside the crate and a running seal total on the SEAL button.
- Bench and trade foley: grab chirps, drop/landing thunks, rotate ratchets, lid seats, seal stamps, sale registers, and rejection squelches.
- Screen-space pack scene (ortho pass under the HUD): crate walls,
  per-good body tints, held/outside ghosting, and a seal-ready rim.
  Pointer captured while open with aim frozen; keys stay live.
