---
"@kybernetes/server": patch
---

Fix daemon hangs and orphaned ports: `start()` now rejects with `EADDRINUSE` instead of hanging forever when the port is held, `stop()` is idempotent, terminates every socket (including half-open handshakes), and always settles via a bounded close so Ctrl-C and test teardown can never wedge. Boot prints a busy-port hint and shutdown forces exit after a timeout.
