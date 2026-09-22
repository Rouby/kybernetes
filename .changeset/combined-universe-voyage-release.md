---
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/protocol": minor
"@kybernetes/web": minor
---

Solar system and universe catalog: eight planets (Meridian Gate, Solace Yards, Cinder Dock, Vesper Port stations plus Tern, Halcyon, Lumen, Nadir) and four moons (Wisp, Moth, Rill, Tarn) on hierarchical planet-centered orbits, owned by a single universe catalog with branded ids and throwing lookups. Guidance routes torch arcs around third-body wells with slingshot gates and delayed departures, and the chart flip search scores wells with waypoint fallbacks and moon orbits. Each dockable station gets a distinct walkable hull, market table, and map identity.

Eased docking voyages instead of teleports: spool-free immediate torch light with a docking-approach window, hulls easing between dock mouths and far holding at cruise speed and steering for the hop mate on late legs, plot fuel gated on the flown leg window, destination docks unsealing vacuum-safe (shut, walkable leaves) on mate with the shared ship mouth resolved to the current-port dock, dock leaves locked for the whole voyage, per-dock status broadcasts with client walkable-dock adoption, hires held until the pawn boards and the tube clears, and a one-shot Adrift-flameout notice for stranded legs. Flight cinematics follow: directionally-correct RCS and bow/stern plumes that flip at the mid-leg brake, cruise camera locked to the ship with torch-profile starfield scroll, and stations loading by leg state with vessel motion in its own module.

Render every station frame: deck rooms, walls, lights, breach locations, doors, and console models compile per hub variant at world coords with frame-aware classification, offsets, fog, and atmosphere; far stations draw complete interiors with hull backing plates, dock umbilicals follow the active mouth, crossings hold one auth frame with explored-outside-home fog, and static consoles, living fixtures, and floor crates obey frame-visibility culling. The debug observer boots the solo world so all hubs render.

Hull content pipeline and persistence: versioned HullJson validation with a dock-spine invariant enforced in the compiler plus one shared hub compile path for sim and render; versioned world persistence (v3 codec with universe pin, typed-error rejection, v2 migration, file-backed ShipStore, additive SimHost hooks and SAVE_INFO broadcast, wire v2 unchanged).

Bridge and trade UI: nav pre-flight readiness checklist with LOAD FUEL actions, trip-cost and low-stores warnings plus target-port demand on course preview, market-stall trade rumors with handover sell of the carried crate, TRADE TRANSACTION SETTLED receipts with register cue, starter skiff capital at 50cr, and a contextual key-hint strip with Stow-into-hold terminology.