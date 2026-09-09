---
"@kybernetes/web": patch
---

HUD combat panel modularization: `HudRenderer.renderLowerRightCombat` (cognitive 62) splits into focused `renderKineticBlock` / `renderLaserBlock` / `renderWelderBlock` / `renderCombatFooter` / `renderShiftProgress` methods backed by a pure, unit-tested `hud/combatFormatters` module (panel geometry, ammo/laser/welder formatting, cartridge-rack states). Resolves the Fallow complexity target with no visual changes. Covered by 12 new unit tests.
