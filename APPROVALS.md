# loupe-pdf — STOP-Gate Approvals (mirror)

Authoritative source: `/Users/macadmin/synergy-agents/approvals.md`. This
file mirrors the entries that affect `loupe-pdf` for in-repo
discoverability.

## Entries

### loupe strict codex enforcement (criterion 3)
- gate: loupe strict codex enforcement (loupe-pdf criterion 3)
- decision: Approved
- date: 2026-05-07T00:00:00Z
- source: Quincy authorization in Multi-Agent Cutover Prompt + QUESTIONABLE-DECISIONS.md 2026-05-07 loupe strict codex metadata enforcement
- evidence: `browser/index.ts`, parity reports under `reports/parity/`

### Deletions (limited scope: pdf.js metadata/layer fallbacks)
- gate: Deletions
- decision: Approved (limited to pdf.js metadata/layer fallbacks)
- date: 2026-05-07T00:00:00Z
- source: Quincy authorization in Multi-Agent Cutover Prompt
- notes: No tests deleted. Inference paths in pdf.js optional-content config removed in favor of strict codex authority.

### Codex spot-colorant additive Lab/CMYK fields (consumer alignment)
- gate: Codex spot-colorant additive Lab/CMYK fields
- decision: Approved
- date: 2026-05-07T00:00:00Z
- source: Quincy authorization + QUESTIONABLE-DECISIONS.md 2026-05-07 codex spot-colorant additive Lab/CMYK fields
- notes: loupe adapter is permissive — reads any of `lab`/`alternate_lab`/`pantone_lab`, `cmyk`/`cmyk_bridge`/`pantone_cmyk`, `rgb`/`alternate_rgb`, `pantone_name`/`canonical_name`, so a future codex extractor extension does not require coordinated cutover.
