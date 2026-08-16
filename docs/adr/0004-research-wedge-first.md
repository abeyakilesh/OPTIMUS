# ADR-0004 — Verified research is the first wedge

**Status:** accepted · **Date:** 2026-08-16

## Context

62 repos are in scope across browser, code, research, data, design and
automation. Doing several at once is what produced 4 empty packages and 832
dead skills in nexus. One must go first.

## Decision

**Research → verified dataset** is the v0.1 wedge. Code, design and automation
are deferred, each to its own wedge later.

## Rationale

1. The strongest, most testable repos are here (browser-use, Scrapling,
   firecrawl, Agent-Reach).
2. The output is **mechanically verifiable** — row counts, schema conformance,
   every cell traceable to a fetched source. Verification is objective, which is
   the entire product thesis. Code correctness and design quality are not.
3. The pain is frequent and concrete for the target user.
4. Coding agents are a saturated market; verified collection is not.

## Consequences

**Good:** the first capability absorbed is also the one that proves gate 6
(fidelity) and gate 11 (e2e) are real; the demo is legible to anyone.

**Bad, accepted:**
- We ship nothing for developers first, despite the user being a developer.
- Browser automation is the most fragile capability class (sites block, change,
  rate-limit). Accepted deliberately: if verification and honest failure work
  *here*, they work anywhere. PRD M8 tests exactly this.

## Revisit when

The wedge is proven, or two consecutive attempts at AC-1 fail because
browser fragility (not kernel design) makes determinism impossible.
