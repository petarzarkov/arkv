# arkv — Claude Code Instructions

## Runtime & Package Manager

- **Bun** is the only runtime and package manager. Never use `npm`, `npx`, `yarn`, or `pnpm`.
- Run packages/tools with `bunx` (e.g. `bunx oxlint`).
- Run scripts with `bun run <script>`.
- Execute TypeScript files directly with `bun <file.ts>`.
- Install dependencies with `bun install` (use `--frozen-lockfile` in CI).
- Refer to [./bun-apis.md](./bun-apis.md)for Bun APIs usage

## Monorepo Structure

```
packages/<name>/        # Each published package
  src/                  # Source TypeScript
  dist/                 # Build output (gitignored)
  package.json
  tsconfig.json         # Extends ../../tsconfig.json
  tsconfig.build.esm.json
  tsconfig.build.cjs.json
  tsconfig.build.types.json
scripts/                # Repo-level scripts (bun-native TS)
.github/workflows/      # CI (ci.yml)
```

Package scope: `@arkv/<name>`. Each package produces three outputs: ESM (`dist/esm/`), CJS (`dist/cjs/`), and Types (`dist/types/`).

## Linting & Formatting

- **Linter**: `oxlint` (config: `.oxlintrc.json` at repo root)
- **Formatter**: `oxfmt` (no config file — uses defaults)
- Run lint: `bun run lint` → `oxlint --fix .`
- Run format: `bun run format` → `oxfmt --write .`
- Pre-commit hook runs lint-staged: lints then formats staged `.ts` files.
- There is no ESLint or Biome — do not add them.

### Key lint rules (from `.oxlintrc.json`)

- `typescript/no-explicit-any`: **error** — never use `any`
- `no-unused-vars` / `typescript` variants: **error**
- `prefer-const`: **error**
- Correctness rules: **warn** by default, specific rules promoted to **error**

## TypeScript

- Version: `6.x` (see `devDependencies`)
- Root config: `tsconfig.json` — `strict: true`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`
- `moduleResolution: "bundler"`, `module: "ESNext"`, `target: "ESNext"`
- `emitDecoratorMetadata` and `experimentalDecorators` are enabled (NestJS support)
- No `any` — use proper types or generics
- Prefer `type` imports where possible (especially in `nestjs-context-logger`)

## Building

Each package build is triggered via:

```bash
bun run build         # all packages: bun run --filter '*' build
```

Within a package:

```bash
bun run build:esm     # tsc -p tsconfig.build.esm.json
bun run build:cjs     # tsc -p tsconfig.build.cjs.json
bun run build:types   # tsc -p tsconfig.build.types.json
# All three run in parallel via bun run --parallel
```

`prebuild` removes `dist/`, `postbuild` writes `{"type":"commonjs"}` into `dist/cjs/package.json` and `{"type":"module"}` into `dist/esm/package.json`.

## Testing

- Runner: `bun test`
- `bun run test` — run tests with bail on first failure
- `bun run test:cov` — run with coverage

## Typecheck

```bash
bun run typecheck     # all packages: bun run --filter '*' typecheck
```

Within a package: `tsc --noEmit`

## Versioning & Publishing

- Automated via `bun run version` (runs `scripts/version.ts`)
- Uses conventional commits: `feat:` → minor bump, `fix:` → patch, `BREAKING CHANGE` → major
- CI publishes to npm on push to `main` (if version changed)
- Dry-run: `bun run version:dry-run`
- Force publish all: include `[force-publish]` in commit message

## Packages Overview

| Package                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `@arkv/colors`                | Zero-dep ANSI color utilities                       |
| `@arkv/shared`                | Array, async, number, object, string, url utilities |
| `@arkv/logger`                | Structured logger (depends on colors + shared)      |
| `@arkv/rng`                   | RNG with Rust/WASM (`bun run build:wasm` step)      |
| `@arkv/temporal`              | Day.js-compatible API over `Temporal` (polyfilled)  |
| `@arkv/nestjs-context-logger` | NestJS DI wrapper around `@arkv/logger`             |

### @arkv/rng notes

- First-time setup requires Rust toolchain + wasm-pack: run `packages/rng/setup.sh`
- Build order: `build:wasm` (Rust→WASM) runs first, then TS compilation (`build:ts`)
- `bun run build` at package level handles this sequence automatically

### @arkv/temporal notes

- Polyfill at top of `src/index.ts`: `import 'temporal-polyfill/global'`
- Internal state: `Temporal.ZonedDateTime | null` (null = invalid)
- `.month()` is 0-indexed (dayjs compat); `Temporal.month` is 1-indexed
- `.day()` returns 0=Sun; `Temporal.dayOfWeek` is 1=Mon..7=Sun
- `diff(a, b)` returns `a - b`; internally calls `diffHelper(from=b, to=a)` which computes `from.until(to)`
- `Temporal.ZonedDateTimeLike.day` is required — use a local `WithPartial` type + include `day: this.$zdt.day` when calling `.with({})`

### @arkv/nestjs-context-logger notes

- `// oxlint-disable-next-line <rule>` syntax for inline disable (no Biome)
- `useImportType` lint rule is off for this package (configured in `.oxlintrc.json`)

## Repo Scripts

- `bun run gen:readme` — regenerates root README from package metadata (`scripts/update-readme.ts`)
- `bun run gen:env:docs` — regenerates env variable docs (`scripts/gen-env-docs.ts`)
- `bun run version:dry-run` — previews version bumps without writing

## Do Not

- Do not use `npx`, `npm`, `yarn`, or `pnpm` — use `bun`/`bunx`
- Do not add Biome or ESLint
- Do not use `any` — TypeScript strict mode is enforced
- Do not exceed 500 lines per source file
- Do not create files unless necessary — prefer editing existing ones
- Do not add docstrings/comments unless logic is non-obvious
- Do not add error handling for impossible scenarios
- Do not add speculative abstractions or future-proofing
