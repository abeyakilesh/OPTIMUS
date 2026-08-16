# ADR-0003 — Local-first, behind ports and adapters

**Status:** accepted · **Date:** 2026-08-16

## Context

The product must run on one MacBook Pro i9 (16 GB) today, and must not need a
rewrite if it ever serves many users. Previous attempts chose cloud-shaped
architectures they could not afford to run, and stalled.

Measured constraint: several candidate repos are far too heavy to run locally —
Dify **55** docker services, firecrawl **15**, maxun **7**.

## Decision

Every infrastructural concern sits behind a **port** with two adapters:

| Port | LOCAL | SCALE |
|---|---|---|
| Storage | SQLite + filesystem | Postgres + object store |
| Scheduler | in-process | queue + workers |
| SandboxPool | child process | microVM |
| BrowserPool | 1 browser | browser farm |
| ModelRouter | OmniRoute child process | same, replicated |
| EventBus | in-process emitter | durable log |

Kernel code may only import ports, never adapters. The same kernel test-suite
runs against both (NFR-9).

## Consequences

**Good:** ₹0 and offline today; no rewrite later; adapters are independently
testable; heavy repos stay SERVICE-fate and out of the laptop.

**Bad, accepted:**
- Indirection cost — every concern needs an interface even when only one
  implementation exists. Mitigation: only these six ports; new ones need an ADR.
- The SCALE adapters will be under-tested until someone needs them. Accepted and
  written down rather than pretended away.
