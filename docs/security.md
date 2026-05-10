---
title: "Security policy"
description: "How to report a vulnerability in LoupePDF, what's in scope vs. out of scope, supported versions, and how disclosure is coordinated."
group: "Project"
order: 10
---

# Security policy

LoupePDF is the renderer, not the access layer. This page covers what
counts as a LoupePDF vulnerability, how to report one, and what we
promise back.

## Reporting a vulnerability

If you believe you've found a security issue in LoupePDF, please **do
not** open a public GitHub issue. Instead, email
**security@printwithsynergy.com** with:

- A clear description of the issue and its impact.
- Steps to reproduce (a minimal repro repo or code snippet helps).
- The version / commit you tested against.
- Any suggested mitigation, if you have one.

We aim to acknowledge reports within **3 business days** and to ship a
fix or workaround within **30 days** for confirmed issues, depending on
severity.

You're welcome to request a CVE assignment; we'll coordinate disclosure
timing with you.

## Scope

LoupePDF is a pure renderer. It does not authenticate, sign, or
rate-limit any URL it consumes — those concerns are the host's. The
following are **not** in scope as LoupePDF vulnerabilities and should
be reported to the relevant host instead:

- A signed URL that didn't expire when the host expected it to.
- Unauthorised access to a PDF the host served from an unguarded
  endpoint.
- Cross-tenant data leaks at the host's API layer.

In scope:

- Issues in the viewer's rendering or sampling that could leak data the
  user's session shouldn't see (e.g., a tool returning a value derived
  from a PDF object the host meant to hide).
- XSS / injection / prototype-pollution in any code shipped from this
  repo.
- Issues in the pdf.js fallback adapter or in any dependency we
  bundle / re-export.
- DoS-grade resource exhaustion in the renderer or sampling tools.

For dependency vulnerabilities, please report to the upstream project
first; we'll bump our version after they ship a fix.

## Supported versions

Until the package reaches `1.0.0`, only the latest minor version line
receives security fixes. Once `1.0.0` ships, the latest two minor
version lines are supported.

## Disclosure

We follow [coordinated
disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
fixes ship before details are made public, and reporters are credited
in the release notes unless they request otherwise.
