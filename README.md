<div align="center">

# arkv

A modern TypeScript monorepo powered by [Bun](https://bun.sh).

[![CI](https://github.com/petarzarkov/arkv/actions/workflows/ci.yml/badge.svg)](https://github.com/petarzarkov/arkv/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-black.svg)](https://bun.sh)

</div>

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@arkv/colors`](./packages/colors) | [![npm](https://img.shields.io/npm/v/@arkv/colors)](https://www.npmjs.com/package/@arkv/colors) | Lightweight, zero-dependency ANSI color and style utilities |
| `@arkv/shared` | *internal* | Shared utilities across packages (not published) |

## Project Structure

```
arkv/
  packages/
    shared/          # Internal shared utilities (private)
    colors/          # ANSI color & style utilities (@arkv/colors)
  scripts/           # Monorepo-level scripts (versioning, env docs)
  .github/workflows/ # CI/CD pipeline
  .husky/            # Git hooks (pre-commit, commit-msg)
```

## Getting Started

```bash
# Install all dependencies
bun install

# Build all packages
bun run build

# Run all tests
bun run test

# Run tests with coverage
bun run test:cov

# Lint & format
bun run lint
bun run format

# Typecheck
bun run typecheck
```

## Scripts

| Script | Description |
|---|---|
| `bun run build` | Build all packages (ESM + CJS + Types) |
| `bun run test` | Run all tests |
| `bun run test:cov` | Run all tests with coverage |
| `bun run lint` | Lint and auto-fix with Biome |
| `bun run format` | Format code with Biome |
| `bun run typecheck` | Typecheck all packages |
| `bun run version` | Bump versions based on conventional commits |
| `bun run version:dry-run` | Preview version bump |

## Adding a New Package

1. Create a directory under `packages/`
2. Add a `package.json` with `"name": "@arkv/<name>"`
3. Add a `tsconfig.json` extending the root config
4. For publishable packages, add build tsconfigs (ESM + CJS + Types)
5. For internal-only packages, set `"private": true`

## Commit Convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope)?: description
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `style`, `refactor`, `perf`, `build`, `ci`, `revert`, `security`, `sync`

## Versioning & Publishing

On push to `main`, CI automatically:

1. Builds, lints, typechecks, and tests all packages
2. Bumps versions of publishable packages based on commit type
3. Publishes **only packages whose source code changed**

| Commit type | Version bump |
|---|---|
| `feat:` | minor |
| `fix:`, `chore:`, etc. | patch |
| Breaking change (`!:`) | major |

## License

[MIT](LICENSE)
