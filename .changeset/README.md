# Changesets

Welcome! This repository uses [Changesets](https://github.com/changesets/changesets) for managing package versioning, changelog generation, and releases across our Turborepo monorepo packages.

## Adding a Changeset

When making changes to any packages (`@kybernetes/*`):

```bash
yarn changeset
```

Follow the prompts to:
1. Select which packages have changed (e.g. `@kybernetes/sim-core`, `@kybernetes/protocol`, `@kybernetes/ui-tokens`).
2. Choose bump level (`patch`, `minor`, `major`).
3. Enter a summary of the changes.

## Releasing / Versioning

- To bump versions according to accumulated changesets:
  ```bash
  yarn version-packages
  ```
- To build and publish updated packages:
  ```bash
  yarn release
  ```
