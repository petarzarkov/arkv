# npm-package-bun-template

A modern NPM package template powered by [Bun](https://bun.sh), TypeScript, and Biome.

## Features

- **Bun** - Fast runtime, package manager, and test runner
- **TypeScript** - Strict mode, ESNext target, decorator support
- **Biome** - Linting, formatting, and import organization
- **Husky + lint-staged** - Pre-commit linting and conventional commit message validation
- **GitHub Actions CI** - Build, lint, typecheck, and test on every push/PR; auto version bump and npm publish on main
- **Semantic versioning** - Auto version bumps based on conventional commits
- **Environment docs generation** - Auto-generate env variable documentation from `.env.sample` files
- **Dual package output** - CJS + ESM + type declarations

## Getting Started

```bash
# Install dependencies
bun install

# Run in development mode (watch)
bun run dev

# Build
bun run build

# Run tests
bun test

# Lint & format
bun run lint
bun run format

# Type check
bun run typecheck
```

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Watch mode development |
| `bun run build` | Parallel build of CJS, ESM, and type declarations |
| `bun test` | Run tests (bail on first failure) |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:cov` | Run tests with coverage |
| `bun run lint` | Lint and auto-fix with Biome |
| `bun run format` | Format code with Biome |
| `bun run typecheck` | Type check without emitting |
| `bun run version` | Bump version from conventional commits |
| `bun run version:dry-run` | Preview version bump |
| `bun run mod:cost` | Analyze dependency costs |

## Project Structure

```
src/               # Source code
scripts/           # Utility scripts (versioning, env docs generation)
dist/              # Compiled output (CJS, ESM, type declarations)
.github/workflows/ # CI workflow
.husky/            # Git hooks (pre-commit, commit-msg)
```

## Commit Convention

Commits are validated against the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope)?: description
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `style`, `refactor`, `perf`, `build`, `ci`, `revert`, `security`, `sync`

## Versioning

Run `bun run version` to auto-bump based on the last commit message:

- **Breaking change** (`!` suffix or `BREAKING CHANGE` in body) → major
- **`feat:`** → minor
- **Everything else** → patch

Use `bun run version:dry-run` to preview without making changes.

## CI/CD

The GitHub Actions [workflow](.github/workflows/ci.yml) runs on every push and PR:

1. Install dependencies (with Bun cache)
2. Build, lint, and typecheck in parallel
3. Run tests with coverage

On pushes to `main`, it additionally:

4. Auto-bumps the version based on the commit message
5. Publishes the package to npm

## License

[MIT](LICENSE)
