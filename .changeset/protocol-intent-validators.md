---
"@kybernetes/protocol": patch
---

Split `validate.ts` (238 LOC, accelerating churn): per-intent guards move to `intentValidators.ts` with the result contract, leaving the dispatch router and rate-limit table in `validate.ts`. Wire behavior unchanged; all existing validation tests pass unmodified.
