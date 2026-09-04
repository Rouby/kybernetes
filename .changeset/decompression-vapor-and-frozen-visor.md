---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Realistic pressure-coupled decompression vapor, cascading airflow venting, and organic frozen visor snowflake shader:
- Fixed cascading decompression bug: decompression airflow now tracks interconnected rooms through open bulkheads, so when an evacuated room's doors open to adjacent pressurized compartments, fine mist jets across the doorway and continues venting out exterior breaches/hatches.
- Tuned airflow particles into a silky fine aerosol mist (radius 1.0–2.4px, smooth sine fade, shimmering micro-glints) replacing chunky polygonal discs.
- Coupled decompression airflow emission directly to real-time room pressure (P / 101.3 kPa), tapering to complete termination when the compartment evacuates to vacuum (<= 0.5 kPa).
- Replaced the artificial rigid asterisk grid in `FROST_EDGE_FS` with an organic perimeter frost shader featuring 6-fold dendritic stellar snowflakes, crystalline fern tendrils, and a clear central line-of-sight.
- Integrated smooth dynamic frost accumulation and thawing driven by player-centric ambient cold, decompression exposure, and suit core body temperature.
