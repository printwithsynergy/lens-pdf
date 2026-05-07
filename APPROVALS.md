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

### loupe-pdf 0.3.0-beta.34 publish on npm (this audit)
- gate: loupe-pdf 0.3.0-beta.34 publish on npm
- decision: Approved (executed)
- date: 2026-05-07T15:40:00Z
- source: Quincy authorization in Multi-Agent Cutover Prompt — cross-cutting actions clause
- evidence: tag `v0.3.0-beta.34` (commit 6df7c6b); https://www.npmjs.com/package/@printwithsynergy/loupe-pdf/v/0.3.0-beta.34
- notes: Includes Pantone-aware `host/spotColor/` package, strict codex metadata authority, render-parity proof stack. 52/52 vitest tests pass. Published with `--tag beta`; `latest` dist-tag (0.2.0-beta.1) untouched.
