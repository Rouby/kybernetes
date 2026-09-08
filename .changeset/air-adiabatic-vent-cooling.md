---
"@kybernetes/air-sim": patch
---

Fix vent overcooling: room outflow now integrates exactly along (1-F)^γ for the tick's total outflow fraction, with each donor credited pro-rata so energy is conserved and portal order still does not matter. Small punctures already tracked the adiabatic curve; large breaches on small rooms no longer overshoot it by several kelvin or pin near the 1K floor. Fast cooldown itself is real physics (half pressure → ≈−32 °C) — rooms still have no wall thermal mass or heaters to rewarm them.
