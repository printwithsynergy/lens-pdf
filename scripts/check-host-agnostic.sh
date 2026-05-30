#!/usr/bin/env bash
# Host-agnostic purity tripwire — Phase H of the cross-stack
# architecture audit (lint-pdf/AUDIT.md finding #6).
#
# Enforces lens-pdf's CLAUDE.md scope rule:
#
#   "The viewer never imports a SaaS, never hardcodes a backend
#    route, and self-hides any tool whose backing service the host
#    hasn't wired."
#
# Concretely: lens-pdf source (the npm-published library, not the
# companion server in `server/`) must not import any of:
#
#   - @synergy/*    (synergy workspace packages)
#   - @platform/*   (platform workspace packages)
#   - lintpdf       (lint-pdf python? unlikely — but ban anyway)
#   - lint-pdf      (lint-pdf TS? doesn't exist yet — but ban)
#
# The lens-pdf companion server (`server/`) is excluded — it CAN
# legitimately depend on @printwithsynergy/codex-client + Python
# codex tools because it's a Node server, not the React library.
#
# Usage:
#   ./scripts/check-host-agnostic.sh
#
# Exit codes:
#   0  no violations
#   1  one or more SaaS imports found

set -euo pipefail

# Where to search — the React library source (not the companion server).
SEARCH_DIRS=(
  "adapters"
  "browser"
  "components"
  "host"
  "plugin"
  "types"
  "fallback-pdfjs"
)

# Banned import-source patterns.
BANNED_PATTERNS=(
  '@synergy/'
  '@platform/'
  '"lintpdf'
  '"lint-pdf'
  '@printwithsynergy/lintpdf'
  '@printwithsynergy/lint-pdf'
)

# Build the regex: import|from ... "(<banned1>|<banned2>|...)"
# Use python-style alternation to be portable.
JOINED=$(IFS='|'; echo "${BANNED_PATTERNS[*]}" | sed 's|/|\\/|g')
PATTERN="(import|from)[[:space:]].*[\"']($JOINED)"

VIOLATIONS=()
for dir in "${SEARCH_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r hit; do
    VIOLATIONS+=("$hit")
  done < <(grep -rEn \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo \
    "$PATTERN" "$dir" 2>/dev/null || true)
done

if (( ${#VIOLATIONS[@]} > 0 )); then
  echo "ERROR: host-agnostic tripwire found SaaS imports in the" >&2
  echo "lens-pdf React library source." >&2
  echo "" >&2
  echo "Per lens-pdf's CLAUDE.md: the viewer never imports a SaaS." >&2
  echo "Hosts inject services through ViewerServices (plugin/services.ts);" >&2
  echo "the library doesn't reach upward to synergy / platform / lint-pdf." >&2
  echo "" >&2
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v" >&2
  done
  echo "" >&2
  echo "If you need data from a SaaS service, the host injects it via" >&2
  echo "ViewerServices.<serviceName>. See CLAUDE.md 'Capability registry'." >&2
  echo "" >&2
  echo "Note: the lens-pdf companion server in \`server/\` is excluded" >&2
  echo "from this check — it's a Node service that CAN depend on" >&2
  echo "codex-client + other tools." >&2
  exit 1
fi

echo "host-agnostic tripwire: 0 violations (library stays host-agnostic)"
