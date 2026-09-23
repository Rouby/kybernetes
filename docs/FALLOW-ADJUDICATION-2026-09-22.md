# Fallow suppression adjudication — 2026-09-22

Review: docs/REVIEW-2026-09-22-architecture-quality-wiring-ux.md P0.
Rule: AGENTS.md forbids new ignores / config tuning without a human.
This log freezes the 47 code suppressions, records a verdict per site,
and tracks extraction refactors that remove them.

## Verdicts

| File | Line | Kind | Verdict | Rationale / follow-up |
|---|---|---|---|---|
| apps/web/src/webgl/WebGL2Renderer.ts | 317 | complexity | REMOVE (this round) | getRaycastIntersectionT is 8 lines; extract denom/param helpers, drop suppression. |
| apps/web/src/webgl/WebGL2Renderer.ts | 540 | complexity | REMOVE (this round) | renderStations: table-driven station dispatch (renderStationByType). |
| apps/web/src/webgl/WebGL2Renderer.ts | 645 | complexity | KEEP (adjudicated) | renderIntruders LoS cull is 3 branches; revisit with intruder-view helper. |
| apps/web/src/webgl/WebGL2Renderer.ts | 682 | complexity | REMOVE (this round) | renderProjectiles: pure projectileStyleFor + quad geometry helpers. |
| apps/web/src/webgl/WebGL2Renderer.ts | 798 | complexity | KEEP (adjudicated) | renderWelderArc raycast+jitter loop; extract welder-arc geometry next. |
| apps/web/src/webgl/WebGL2Renderer.ts | 868 | complexity | KEEP (adjudicated) | renderChargingReticle arc loop; extract reticle-arc helper next. |
| apps/web/src/webgl/WebGL2Renderer.ts | 424 | unused-class-member | KEEP (adjudicated) | setFowIdentity is session-indirected (HarborViewport per-frame); public session API. |
| apps/web/src/webgl/WebGL2Renderer.ts | 463 | unused-class-member | KEEP (adjudicated) | resetFogOfWar is debug/session API; called from session teardown paths. |
| apps/web/src/webgl/WebGL2Renderer.ts | 473 | unused-class-member | KEEP (adjudicated) | getLastLoSPolygon is debug/test API for LoS polygon inspection. |
| apps/web/src/webgl/WebGL2Renderer.ts | 1538 | unused-class-member | KEEP (adjudicated) | Frame-graph helper used via render-path indirection; keep with test pin. |
| apps/web/src/webgl/passes/DeckPass.ts | 684 | complexity | REMOVE (this round) | renderDeckFloors: bindDeckFloorUniforms + drawDeckRoom helpers. |
| apps/web/src/webgl/passes/DeckPass.ts | 1050 | complexity | KEEP (adjudicated) | Bulkhead layer pass; split floor/furniture/decals next. |
| apps/web/src/webgl/passes/DeckPass.ts | 1176 | complexity | KEEP (adjudicated) | Exhaust/plume pass; extract nozzle/plume math next. |
| apps/web/src/webgl/passes/LightingPass.ts | 243/312/459 | complexity x3 | KEEP (adjudicated) | 6-slot light accumulation + occlusion; profile uniform lookups first. |
| apps/web/src/webgl/systems/FramebufferManager.ts | 40/78/165 | complexity x3 | KEEP (adjudicated) | FBO lifecycle; split attach/resize/discard helpers next. |
| apps/web/src/webgl/passes/FogOfWarPass.ts | 105/141 | complexity x2 | KEEP (adjudicated) | GPU mask passes; share contract test with sim fogOfWar first. |
| apps/web/src/webgl/PawnModels.ts | 136/234 | complexity x2 | KEEP (adjudicated) | Pawn variant dispatch; table-drive next. |
| apps/web/src/webgl/LivingFixtures.ts | 232 | complexity | KEEP (adjudicated) | Exhaustive kind dispatch, one call per branch (commented). |
| apps/web/src/webgl/hud/HudHitTester.ts | 26 | complexity | KEEP (adjudicated) | Newton curvature solve; pure + tested. |
| apps/web/src/webgl/hud/HudHitTester.ts | 92 | unused-class-member | KEEP (adjudicated) | Hit-test helper used via HudRenderer indirection. |
| apps/web/src/webgl/systems/ParticleSystem.ts | 120 | complexity | KEEP (adjudicated) | Particle spawn dispatch; extract emitters next. |
| apps/web/src/webgl/StationHub.ts | 36 | unused-export | KEEP (adjudicated) | Retired v1 feed kept for kinematics follower milestone; add expiry. |
| apps/web/src/audio/AudioBusManager.ts | 95/100/108/116/135 | unused-class-member x5 | KEEP (adjudicated) | Public settings API (getVolumes/setVolume/toggleMute/setMuted/subscribe) driven via AudioPrefs/Soundboard indirection. |
| apps/web/src/audio/synths/BallisticsSynth.ts | 49/224 | complexity x2 | KEEP (adjudicated) | Synth voice dispatch; extract voice builders next. |
| apps/web/src/audio/synths/ReactorDroneSynth.ts | 99 | complexity | KEEP (adjudicated) | Drone modulation graph. |
| apps/web/src/audio/synths/ReactorDroneSynth.ts | 120 | unused-class-member | KEEP (adjudicated) | Lifecycle hook via engine indirection. |
| apps/web/src/audio/synths/MetallicPlateSynth.ts | 14 | complexity | KEEP (adjudicated) | Plate reverb graph. |
| apps/web/src/audio/synths/VitalsMonitorSynth.ts | 119 | unused-class-member | KEEP (adjudicated) | Monitor hook via engine indirection. |
| packages/sim-core/src/spatial/fogOfWar.ts | 23 | complexity | REMOVE (this round) | isPointInPolygon: edgeCrosses helper. |
| packages/sim-core/src/spatial/fogOfWar.ts | 81/106 | complexity x2 | KEEP (adjudicated) | Grid update loops; share cross-layer fog contract test first. |
| packages/sim-core/src/spatial/visibility.ts | 199/256 | complexity x2 | KEEP (adjudicated) | Ray-angle collectors; extract wall-endpoint helper next. |
| packages/sim-core/src/spatial/visibility.ts | 351 | complexity | KEEP (adjudicated) | computeVisibilityPolygon dispatch; table-drive next. |
| packages/sim-core/src/spatial/collision.ts | 69 | complexity | KEEP (adjudicated) | resolvePawnMovement axis/slide logic; covered by spatial tests. |
| packages/air-sim/test-recorder/atmosphere-reporter.ts | 1 | (biome, not fallow) | OUT OF SCOPE | Dev-only HTML reporter, out of unit gate. |

## Freeze rule

No new fallow-ignore-next-line without a row above + human sign-off.
Prefer helper extraction (<20 lines/fn) over suppression.

## Removed this round (verify yarn quality)

- WebGL2Renderer getRaycastIntersectionT, renderStations, renderProjectiles
- DeckPass renderDeckFloors
- fogOfWar isPointInPolygon
