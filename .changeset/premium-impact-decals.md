---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/web": minor
---

Replace flat bullet-hole crosses with premium oriented impact rendering:
- protocol: `SnapshotImpact` gains `angle`/`weapon`/`energy`/`surface`/`breachId`; new `ScorchDecal` table (id, frame, pos, angle, radius, weapon, bornTick) on full snapshots and changed-only deltas.
- sim-core: Combat records contact normal, weapon, normalized energy, and surface; wall/door hits append weapon-scaled LRU decals; channels quantize and diff the decal table.
- web: New `ImpactDecalPass` (oriented crater ellipse, rim light, scorch falloff, fresh glow flicker, vacuum frost, per-weapon palettes); `ParticleSystem.addDirectionalImpact` cone sparks + hot core; `DeckPass` renders premium decals and dock tube; debug view draws oriented ticks plus decal rings.
