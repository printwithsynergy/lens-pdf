# Service Ownership Contract

This contract defines ownership boundaries across:

- `loupe-pdf`: display and visual inspection UX
- `lint-pdf`: reporting, policy/rules, preflight workflow orchestration
- `codex-pdf`: extraction and normalized document intelligence

## Loupe ownership (this repo)

Loupe owns display and inspection experience:

- PDF rendering and viewer interaction model
- visual review UX (navigation, overlays, panels, affordances)
- presentation of extraction/rule data from backend services

Loupe does **not** own:

- extraction normalization logic from raw PDFs
- pass/fail policy engines or customer-specific rule semantics

## Cross-service boundaries

- Consume Codex for document facts/summaries/signals.
- Consume Lint for findings, decisions, and report semantics.
- Keep Loupe UI-focused so multiple products can reuse shared display primitives.

## Future offshoot rule

For new products (Forge, Trap, Impose, Marks, etc.), map each capability to one owner:

1. Display/inspection UX -> Loupe layer
2. Rules/reporting/workflow -> Lint layer
3. Extraction/normalized intelligence -> Codex layer

If a feature spans layers, split by contract and avoid duplicating backend logic in viewers.
