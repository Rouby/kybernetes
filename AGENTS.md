# AGENTS.md — Kybernetes Engineering Handbook & Work Routine

Welcome to **Kybernetes** (*Κυβερνήτης*). This document defines the architectural standards, development workflow, and automated quality gates that all agents and developers must adhere to when modifying or extending this codebase.

---

## 1. Project Philosophy & Stack Pillars

1. **Zero-DOM Core Simulation**:
   * All game rules, physics, reactor math, survival vitals decay, 2D collisions, and combat mitigation reside in `packages/sim-core`.
   * `packages/sim-core` must remain **100% pure TypeScript** with **0 DOM dependencies** so it runs identically on server and client.
2. **Authoritative Server, Optimistic Client**:
   * `apps/server` is authoritative over ship physics, inventory, survival rates, and combat damage.
   * `apps/web` renders the 2D Canvas viewport and StyleX HUD, performing client-side movement prediction and station docking.
3. **Strict Wire Contracts**:
   * All client actions and server broadcasts must be strictly typed in `packages/protocol`. Never send untyped JSON over WebSockets.
4. **Compile-Time Styling**:
   * Use **Meta StyleX** (`@stylexjs/stylex`) with tokens from `@kybernetes/ui-tokens`.
   * **Never introduce Tailwind CSS or runtime CSS-in-JS libraries.**

---

## 2. The Standard Development Work Routine

When implementing any feature, bug fix, or milestone task, follow this exact routine in order:

```mermaid
graph TD
    A["1. Define Wire Types (@kybernetes/protocol)"] --> B["2. Implement & Unit Test Core Math (@kybernetes/sim-core)"]
    B --> C["3. Wire Authoritative Server Daemon (apps/server)"]
    C --> D["4. Build 2D Canvas & StyleX HUD (apps/web)"]
    D --> E["5. E2E Browser Testing with Playwright"]
    E --> F["6. Run 5-Gate Quality Pipeline"]
    F --> G["7. Generate Changeset (yarn changeset)"]
```

### Step 1: Protocol First (`packages/protocol`)
* Add or update client action intents (`ClientAction`) and server broadcasts (`ServerBroadcast`).
* Ensure discriminant union tags (`type: '...'`) are explicit and all fields are strongly typed.

### Step 2: Simulation Core & Vitest (`packages/sim-core`)
* Implement pure math and state update functions in `src/`.
* Write parallel Vitest unit tests in `src/*.test.ts`. Test boundary cases (e.g., zero oxygen, starving vitals, reactor overheat).

### Step 3: Authoritative Server Handler (`apps/server`)
* Ingest client actions in `VesselServer.handleClientAction()`.
* Ensure state updates are replicated in the 10Hz/20Hz delta broadcasts.
* Maintain clean process lifecycle: ensure `stop()` terminates open client sockets and closes `WebSocketServer`.

### Step 4: Web Rendering & Viewport (`apps/web`)
* Render game elements to the HTML5 2D Canvas (`VesselCanvas`).
* Build or update diegetic HUD components with `@stylexjs/stylex`.
* Import tokens directly from `@kybernetes/ui-tokens/tokens.stylex`.

### Step 5: Playwright Verification (`apps/web/e2e/`)
* Add browser tests in `e2e/*.spec.ts` testing user journeys, keyboard locomotion, console docking, and survival interactions.

### Step 6: 5-Gate Quality Pipeline (Mandatory before committing)
Run the following verification suite:
```bash
# 1. Formatting and linting (Biome)
yarn lint

# 2. Dead code, clones, and structural health (Fallow)
yarn quality

# 3. TypeScript 7 strict compiler check
yarn typecheck

# 4. Vitest unit tests
yarn test

# 5. Turborepo production build
yarn build

# 6. Playwright browser suite
yarn test:e2e
```

### Step 7: Changeset
If you touched any packages (`@kybernetes/*`), generate a changeset entry:
```bash
yarn changeset
```

---

## 3. Critical Caveats & Rules of Thumb

### StyleX Rules
- **No Dynamic Values in `stylex.create()`**: Only static CSS values and design tokens (`hudColors.*`) are allowed.
  * ❌ *Forbidden*: `progressBarFill: (percent) => ({ width: `${percent}%` })`
  * ✅ *Allowed*: Static `progressBarFill: { height: '100%', transition: 'width 0.2s ease' }` and dynamic `style={{ width: `${percent}%` }}` in JSX.
- **Importing Tokens**: Always import tokens from the `.stylex` file directly:
  * ✅ `import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';`
  * ❌ Do not import tokens from a barrel file (`@kybernetes/ui-tokens`) inside components, as Babel cannot track `defineVars`.

### Server Port Teardown
- On Windows, always ensure `server.stop()` is called and active WebSockets are terminated (`client.terminate()`) before closing `wss`.
- Never leave orphan Node processes bound to port 3001. Trapping `SIGINT` and `SIGTERM` in `apps/server/src/index.ts` is required.

### Fallow Quality Constraints
- `fallow` scans for:
  1. **Unused class members and exports**: Do not add dead methods to classes.
  2. **High cyclomatic / cognitive complexity**: Keep methods under 20 lines and break complex control flows into helper functions.
  3. **Duplicate code blocks**: Shared utility logic belongs in `packages/sim-core` or shared packages.

### Biome Conventions
- Use `node:path`, `node:fs`, `node:crypto` prefix for all Node built-in imports.
- Run `yarn lint:fix` to auto-sort imports and format before running checks.
