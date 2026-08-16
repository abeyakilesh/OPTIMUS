# ADR-0002 — Users bring their own key; OPTIMUS never resells inference

**Status:** accepted · **Date:** 2026-08-16

## Context

Budget of record: an existing $20/mo Claude subscription plus ≤ ₹2000 one-off.
The question "how does this cost me money at 1,000 users" was open for weeks.

Arithmetic (full working in `../COST_MODEL.md`): a v0.1 mission is ~92k tokens.
1,000 users × 10 missions/month ≈ 920M tokens/month ≈ **$276–$4,100/month** on
paid APIs. Serving that from free tiers instead would breach most providers'
terms and hit per-minute rate limits regardless of the monthly headroom.

## Decision

**OPTIMUS never pays for anyone else's inference.** Every user supplies their
own key, or their own free tiers via their own bundled OmniRoute. Marginal cost
per user is ₹0 at any scale.

If OPTIMUS is ever monetised, it charges for the **application**, never the
tokens.

## Consequences

**Good:** the economics cannot break; no billing system, no quota service, no
abuse surface; self-hosting is the default rather than a concession; it justifies
the single-standalone-repo constraint already in `CLAUDE.md`.

**Bad, accepted:**
- Onboarding friction — a new user must obtain a key before anything works.
  Mitigation: OmniRoute ships with keyless free providers pre-wired, so a fresh
  install answers out of the box.
- We cannot offer a zero-setup hosted demo without eating cost. Accepted: the
  demo is a recorded mission, not a live shared instance.
- Quality varies by whatever key the user brings; our verification layer must
  therefore be model-agnostic, which is the correct design anyway.
