# Loupe PDF — Agent Guidance

## Service boundary

Loupe is the PDF display and visual inspection layer in the Print with Synergy stack.

- Own rendering, viewer interaction UX, and presentation behavior.
- Consume backend intelligence/reporting contracts from Codex and Lint.

## Non-goals for this repo

- Do not implement extraction normalization logic here.
- Do not implement policy/rule pass-fail engines here.

Those belong to Codex (extraction) and Lint (rules/workflow).

## Offshoot rule

For new products (Forge, Trap, Impose, Marks, etc.), map capabilities to one owner:

1. Display/inspection -> Loupe
2. Rules/reporting/workflow -> Lint
3. Extraction/normalized facts -> Codex

When features span layers, keep logic in owner services and integrate via versioned contracts.
