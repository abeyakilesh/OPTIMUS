# ADR-0001 — A mission is a pull request

**Status:** accepted · **Date:** 2026-08-16 · **Supersedes:** —

## Context

OPTIMUS needs an execution model. The three previous attempts had none: work
was a chat turn that either "worked" or didn't, with no reviewable proposal, no
gate, no evidence and no undo.

We also needed to answer whether every tool should be its own retry loop, and
how missions compose.

## Decision

**A mission is a pull request.** Steps are jobs, verification is a required
status check, permissions are branch protection, skills are reusable workflows,
tools are composite actions, artifacts are build artifacts, rollback is revert.
Full mapping table in `../../CLAUDE.md`.

**Every step is a loop with a mandatory budget** (`max_attempts`,
`max_wall_time`, `max_cost`, stop condition). A mission is a DAG of such loops.

## Why this and not something invented

- It is proven at a scale we will never reach.
- The user already understands it — the mental model ships for free.
- We validated it by hand on this very repo before adopting it: the Gauntlet
  caught two real defects in itself (a wrong CodeQL input, empty secrets) within
  an hour of existing.
- It forces the properties we actually want: nothing lands unproven, everything
  is logged, everything is revertible.

## Consequences

**Good:** a familiar, teachable product; verification is structural rather than
bolted on; parallelism, resumption and caching all have obvious analogues.

**Bad, accepted:**
- More machinery than a chat loop. A one-line question still costs a plan, a
  step and a check. Mitigation: trivial objectives may compile to a single step,
  but they still get a check.
- Budgets add manifest surface that authors must fill in. Deliberate — a step
  without a budget is a slot machine.
- Nested skills need a depth cap (4) or they recurse forever.
