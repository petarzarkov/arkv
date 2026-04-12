Run all CI checks for this repo in order. Stop and report on the first failure.

1. **Lint** — `bun run lint`
2. **Typecheck** — `bun run typecheck`
3. **Build** — `bun run build`
4. **Test** — `bun run test`

Run each command using the Bash tool in that order - build needs to be before test always. After all pass, confirm with a brief summary of results.
