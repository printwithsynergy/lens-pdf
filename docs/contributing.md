# Contributing

Notes for contributors to LoupePDF itself. End-user / host docs live
elsewhere in [`docs/`](.).

## Boundary rule

The viewer core MUST NOT import:

- `@lintpdf/*` packages or any `**/lintpdf/**` paths,
- the literal string `"/api/lintpdf/"` (route through `ViewerServices`).

This is enforced upstream in lint-pdf's `eslint.config.mjs` and re-checked
in this repo's CI typecheck pass. Anything LintPDF-shaped (findings,
brand-spec violations, audit verdicts) belongs in the `loupe-plugin-lintpdf`
plugin pack — the `core/` namespace stays unbranded so OSS hosts can run
it with zero SaaS coupling.

When you add a new feature, ask:

- Does it talk to a backend? → It's a `ViewerServices` field.
- Does it draw on top of the page or in a panel/toolbar? → It's a plugin.
- Does it depend on a domain shape (a finding, an annotation
  interpretation, a brand spec)? → It does not belong in `core/`.

## Phase 4 status

This package was extracted from the lint-pdf monorepo via
`git subtree split --prefix=packages/viewer-shared/src/core/`. History is
file-scoped; the synthetic root commit (`c77ccc51`) is the start of this
repo's history.

The lint-pdf SaaS continues to ship the `@thinkneverland/loupe-plugin-lintpdf`
plugin pack (proprietary findings + branding overlays); LoupePDF itself
ships unbranded.

## Local development

```sh
pnpm install
pnpm typecheck   # tsc -p tsconfig.json
pnpm test        # vitest run
pnpm build       # tsc -p tsconfig.build.json
```

There's no published lockfile yet (the package is still pre-flip); CI
tolerates an empty test suite for the same reason. Add tests alongside
new components — `vitest` is already wired up.

## Public API surface

Anything exported from a barrel (`index.ts` at the package root, or
`{components,plugin,host,types,units}/index.ts`) is part of the public
API and should be considered semver-stable once the package goes public.
Keep `@public` JSDoc tags accurate when you add or remove exports — they
double as the contract for downstream consumers.

## Commit / PR style

- Conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`, `ci:`, `build:`).
- Keep PRs small and focused; one feature or one cleanup per branch.
- Match the existing code's no-comment-by-default policy — write the WHY
  only when the WHY is non-obvious.

## License

LoupePDF is AGPL-3.0-or-later. By contributing you agree to license your
contribution under the same terms. See [`LICENSE`](../LICENSE) for the
full text.
