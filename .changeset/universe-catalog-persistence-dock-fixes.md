---
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/protocol": patch
"@kybernetes/web": patch
---

Universe, persistence, and docking fixes. Single universe catalog owns bodies, hubs, lanes, and chart nodes with branded ids and throwing lookups (SYSTEM_BODIES, HUB_PORTS, STATION_ORIGINS, CHART_LANES, and CHART_NODES derive from it; guidance returns null on unknown legs). Unified Frame view (listFrameIds, getFrame, getFrameOrigin) with stations on the snapshot wire, canonical buildWorld(opts) from the catalog, and single-owner motion (legacy schedule skips nav-owned hulls). Versioned HullJson validation with a dock-spine invariant plus one shared hub compile path for sim assembly and render. Versioned persistence (WORLD_SAVE_VERSION 3 with UNIVERSE_REV pin, typed-error codec, v2 to v3 migration, file-backed ShipStore, additive SimHost hooks and SAVE_INFO broadcast; wire v2 unchanged). Docked tube leaves unseal vacuum-safe instead of venting to space, the shared ship mouth resolves to the current-port dock, the debug observer boots the solo world, and station furniture obeys frame-visibility culling.