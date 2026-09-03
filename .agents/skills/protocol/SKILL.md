---
name: protocol
description: >-
  Use when modifying or extending @kybernetes/protocol. Covers WebSocket packet schemas,
  client action intents, server broadcasts, and spatial snapshot types.
---

# Protocol Package (`@kybernetes/protocol`)

The protocol package is the single source of truth for the JSON WebSocket contract
between `apps/server` and `apps/web`. Treat every exported shape as a versioned
interface: a small type change can break both runtimes.

## Core Rules

1. **Portable contract**: keep this package TypeScript-only, dependency-free, and
  free of DOM, Node, and framework imports.
2. **Explicit unions**: add actions to `ClientAction` and broadcasts to
  `ServerBroadcast` with a unique string `type` discriminant. Prefer narrow
  literal unions over optional fields and use `readonly` data where practical.
3. **JSON-safe payloads**: use primitives, arrays, and plain objects only. Do not
  expose `Date`, `Map`, `Set`, class instances, functions, `undefined`, or cycles.
4. **Stable naming**: keep client intents in `actions.ts`, server messages in
  `broadcasts.ts`, spatial state in `spatial.ts`, survival state in `survival.ts`,
  and subsystem/boarding contracts in their dedicated modules.
5. **Public exports**: re-export every public module and type from `src/index.ts`.

## Change Workflow

1. Define the smallest typed payload and its discriminant.
2. Update server routing/validation and web dispatch in the same change.
3. Check that the payload can round-trip through `JSON.stringify`/`JSON.parse`.
4. Run `yarn --cwd packages/protocol typecheck` and `yarn --cwd packages/protocol lint`.
5. Run the workspace checks when the contract affects consumers.

## Review Checklist

- Unknown message types are rejected or ignored safely by consumers.
- Required fields are validated at the trust boundary; client input is never
  treated as authoritative state.
- Additive changes preserve existing consumers; breaking changes are deliberate
  and documented.
- No duplicate wire definitions are introduced in an app or another package.
