---
title: "Contributing"
description: "Boundary rule, provenance, local development workflow, public-API surface, commit and PR style, and license terms for contributors."
group: "Project"
order: 9
---

# Contributing

Notes for contributors to LoupePDF itself. End-user / host docs live
elsewhere in [`docs/`](.).

## Boundary rule

The viewer core MUST NOT import:

- any host- or product-specific package or path,
- a literal backend route string anywhere in source — every URL is
  composed by a `ViewerServices` URL builder the host supplies.

CI typecheck flags violations. Anything domain-shaped (findings,
brand-spec violations, audit verdicts, host-specific configuration)
lives in plugin packs — the core namespace stays unbranded so any
host can mount it with zero coupling to a particular SaaS.

When you add a new feature, ask:

- Does it talk to a backend? → It's a `ViewerServices` field.
- Does it draw on top of the page or in a panel/toolbar? → It's a plugin.
- Does it depend on a domain shape (a finding, an annotation
  interpretation, a brand spec)? → It does not belong in `core/`.

## Provenance

This package was extracted from an upstream SaaS monorepo via
`git subtree split` over `packages/viewer-shared/src/core/`. History
is file-scoped; the synthetic root commit (`c77ccc51`) is the start
of this repo's history. Everything host-specific from the original
monorepo lives in separate downstream plugin packs — none of it is
imported here.

## Local development

```sh
npm install
npm run typecheck   # tsc -p tsconfig.json
npm test            # vitest run
npm run build       # tsc -p tsconfig.build.json
```

The repo doesn't track a `package-lock.json` (libraries leave that to
consuming apps). Add tests alongside new components — `vitest` is
already wired up; see `plugin/services.test.ts` for the existing
pattern.

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
