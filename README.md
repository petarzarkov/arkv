<div align="center">

# arkv

A modern TypeScript monorepo powered by [Bun](https://bun.sh).

[![CI](https://github.com/petarzarkov/arkv/actions/workflows/ci.yml/badge.svg)](https://github.com/petarzarkov/arkv/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-black.svg)](https://bun.sh)

</div>

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@arkv/colors`](./packages/colors) | [![npm](https://img.shields.io/npm/v/%40arkv%2Fcolors)](https://www.npmjs.com/package/%40arkv%2Fcolors) | Lightweight, zero-dependency ANSI color and style utilities for terminals |
| [`@arkv/logger`](./packages/logger) | [![npm](https://img.shields.io/npm/v/%40arkv%2Flogger)](https://www.npmjs.com/package/%40arkv%2Flogger) | Framework-agnostic structured logger with async context, sanitization, and colored output |
| [`@arkv/nestjs-context-logger`](./packages/nestjs-context-logger) | [![npm](https://img.shields.io/npm/v/%40arkv%2Fnestjs-context-logger)](https://www.npmjs.com/package/%40arkv%2Fnestjs-context-logger) | NestJS module for structured async-context logging powered by @arkv/logger |
| [`@arkv/rng`](./packages/rng) | [![npm](https://img.shields.io/npm/v/%40arkv%2Frng)](https://www.npmjs.com/package/%40arkv%2Frng) | Fastest, zero-dependency, pseudo-RNG in node and browser environments, with support for cryptographic randomness and seedable PRNG. |
| [`@arkv/shared`](./packages/shared) | [![npm](https://img.shields.io/npm/v/%40arkv%2Fshared)](https://www.npmjs.com/package/%40arkv%2Fshared) | Shared utilities for @arkv packages |
| [`@arkv/temporal`](./packages/temporal) | [![npm](https://img.shields.io/npm/v/%40arkv%2Ftemporal)](https://www.npmjs.com/package/%40arkv%2Ftemporal) | Drop-in Day.js-compatible API powered by the native Temporal API. Same chainable interface, zero timezone bugs. |

## Project Structure

```
arkv/
├── packages/                  # Published packages
│   ├── colors                 # Lightweight, zero-dependency ANSI color and style utilities for terminals
│   ├── logger                 # Framework-agnostic structured logger with async context, sanitization, and colored output
│   ├── nestjs-context-logger  # NestJS module for structured async-context logging powered by @arkv/logger
│   ├── rng                    # Fastest, zero-dependency, pseudo-RNG in node and browser environments, with support for cryptographic randomness and seedable PRNG.
│   ├── shared                 # Shared utilities for @arkv packages
│   └── temporal               # Drop-in Day.js-compatible API powered by the native Temporal API
├── scripts/                   # Monorepo-level scripts
├── .github/workflows/         # CI/CD pipeline
└── .husky/                    # Git hooks
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
