---
"@kybernetes/web": patch
---

Share harbor socket lifecycle: `useHarborSocket` and `useHarborObserver` now use a common `harbor/socketLifecycle` module (reconnect backoff, error-to-close funnel, detach-and-close teardown), removing their 18-line clone while keeping the player hook's takeover guard and global-socket registry. Covered by 5 new unit tests.
