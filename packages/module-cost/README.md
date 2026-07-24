# @arkv/module-cost

Visualize what your `node_modules` actually cost on disk — an interactive treemap of
per-package and per-scope size, served straight from `npx`.

```bash
npx @arkv/module-cost
```

Run it in any project with an installed `node_modules`. It scans your dependency tree,
starts a tiny local server, and opens a browser with the report. No config, no account,
**zero runtime dependencies** — just Node.

## What you get

- **Treemap** — every package as a tile, sized by the metric you pick and colored by
  scope, so `@nestjs`, `@babel`, and friends read as blocks at a glance.
- **Scope rollup** — "`@nestjs` = 240 MB" style totals, largest first.
- **Sortable, filterable table** — every package with all three size measures.
- **Detail panel** — click any tile or row to see its sizes, what it depends on, and
  everything that depends on it.

## The three size measures

`node_modules` is flattened and deps are shared, so "how big is this package" has three
honest answers. Toggle between them in the header:

| Metric | Meaning |
| --- | --- |
| **Self** | The package's own files only (excludes nested `node_modules`). Exact — the self sizes sum to the real on-disk total, and power the per-scope rollup. |
| **Exclusive** | What you'd actually reclaim by removing it: files reachable *only* through this package. Computed as retained size over the dependency graph's dominator tree. A dep shared by several parents contributes to none of them individually. |
| **Transitive** | Self plus its entire reachable dependency closure. Intuitive, but double-counts deps shared with other packages. |

**Exclusive** is usually the number you want when deciding whether a dependency is worth
its weight.

## Options

```
npx @arkv/module-cost [options]

  --dir <path>   Project directory to analyze (default: current directory)
  --port <n>     Preferred port for the server (default: 4321)
  --no-open      Do not open the browser automatically
  --json         Print the analysis as JSON and exit (no server)
  -h, --help     Show this help
```

`--json` makes it scriptable:

```bash
npx @arkv/module-cost --json | jq '.scopes[:5]'
```

## How it works

1. **Scan** — walks `node_modules`, records each package's own file size, and dedupes
   instances by real path (so symlinked/hoisted copies are counted once).
2. **Graph** — resolves each package's dependencies with Node's resolution algorithm
   (walking up ancestor `node_modules`), building the real dependency graph plus a
   synthetic root of your project's direct dependencies.
3. **Metrics** — sums self sizes per scope, computes each package's transitive closure,
   and derives exclusive (retained) size from the graph's dominator tree.

Because it resolves from installed `package.json` files rather than a lockfile, it works
the same for **npm, yarn, pnpm, and bun** installs. pnpm's `.pnpm` and bun's `.bun`
virtual stores are handled explicitly; symlink layouts are collapsed by real path.

## Notes

- Measures **installed on-disk** size, not published tarball or download size.
- Requires an existing `node_modules` — run your install first.

## License

MIT
