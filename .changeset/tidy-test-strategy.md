---
"@kybernetes/protocol": patch
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Harden test strategy and fix the production server entry (no game behavior change): portable Playwright screenshot paths under test-results, socket-predicate waits via e2e helpers, retries + failure-only artifacts, production-artifact webServers, smoke/full CI split, wire round-trip coverage for protocol, WS loopback tests for the server daemon, and unit tests for web HUD formatters. Also fixes `yarn --cwd apps/server start`, which crashed under plain Node (extensionless ESM imports, missing package type): the server package is now `"type": "module"` with `.js` relative import extensions, and `build` emits a self-contained `dist/boot.mjs` bundle that `start` runs.
