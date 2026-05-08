---
trigger: always_on
description: "Service ownership boundary: Loupe display, Lint rules, Codex extraction"
---

# Service Ownership Boundary

- Loupe owns display/inspection UX and viewer interactions.
- Lint owns rule decisions, reporting semantics, and workflow behavior.
- Codex owns extraction and normalized intelligence contracts.
- Do not re-implement extraction or policy engines in this repo.
- New offshoots (Forge, Trap, Impose, Marks, etc.) must map capabilities to one owner layer and integrate by contract.
