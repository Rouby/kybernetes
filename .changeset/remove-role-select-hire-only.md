---
"@kybernetes/protocol": patch
"@kybernetes/web": minor
---

Remove the role pickers so captain hire is the only billet path:
- Delete `RoleSelectModal` and its KeyP/KeyR shortcut; the visor button is now BILLET and requests hire from the captain.
- Dossier onboarding is callsign + suit color only (starting origin defaults, persisted crew keeps theirs); copy points new operators at captain-assigned billets.
- Fix `@kybernetes/protocol` missing `"type": "module"`, which hid runtime value exports (`JOB_OFFER_CATALOG`) from the tsx dev server.
- Milestone2 journey asserts the old picker is gone; dossier specs embark without role clicks.
