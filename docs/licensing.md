---
title: "Licensing"
description: "AGPL-3.0-or-later licensing terms for LensPDF — what hosts can do, what they must do, and how to request alternative terms for proprietary use."
group: "Project"
order: 11
---

# Licensing

LensPDF is published under **AGPL-3.0-or-later** — the GNU Affero
General Public License, version 3 or any later version. The full
licence text lives in [`LICENSE`](https://github.com/Printwithsynergy/lens-pdf/blob/main/LICENSE)
at the root of the repository, and `package.json` declares the same
SPDX identifier so npm tooling picks it up automatically.

## What you can do

- Use LensPDF in any application, commercial or non-commercial.
- Modify the source — fork it, vendor it, patch it for your build.
- Redistribute it, modified or unmodified, on any platform.
- Combine it with other AGPL-compatible code.

## What you must do

If you distribute LensPDF (binary or source) — or **make it available
over a network** — you have to:

- Make the **complete corresponding source code** of your modified
  version available, under AGPL-3.0-or-later, to every recipient and
  every user interacting with it remotely.
- Preserve the copyright and licence notices from this repository.
- State the changes you made, with dates.
- License any larger work that links against LensPDF under
  AGPL-3.0-or-later.

The "**make available over a network**" clause (§13 of AGPL-3) is the
key difference from GPLv3: a SaaS that ships LensPDF — even if no one
ever downloads a binary — has to offer the source to its users. Hosting
a hosted PDF viewer that imports `@printwithsynergy/lens-pdf` triggers
this.

## Third-party code

LensPDF re-exports and bundles open-source dependencies:

- **pdf.js** (Apache-2.0) — fallback rendering adapter.
- **fabric.js** (MIT) — annotation canvas (optional peer).
- **React** (MIT) — peer.

Their licences are compatible with AGPL-3.0-or-later. When you ship
LensPDF you also ship those dependencies, so check their notices in
`node_modules` and reproduce them if your distribution channel
requires it.

## Alternative / commercial licensing

The AGPL-3.0 reciprocity requirement is incompatible with some
proprietary or closed-source products. If you want to embed LensPDF
in a product you can't or don't want to release under AGPL-3.0,
contact **licensing@printwithsynergy.com** to discuss commercial
terms.

## Why AGPL?

LensPDF is the rendering core for the printwithsynergy OSS PDF
tooling family. Releasing it under AGPL keeps the core honest:
improvements anyone makes — even hidden behind a SaaS — flow back to
the community. Hosts that want a non-reciprocal arrangement can buy
into the commercial track above; everyone else gets the same code on
the same terms.

## Contributor licensing

Contributions are accepted under the same AGPL-3.0-or-later terms by
default. By submitting a PR you agree your changes are licensed that
way, and that you have the right to submit them. See
[Contributing](/docs/contributing) for the boundary rules and PR
style.
