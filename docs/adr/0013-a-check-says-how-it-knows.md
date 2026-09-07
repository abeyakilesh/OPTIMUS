# ADR-0013 — A check says how it knows

**Status:** accepted · **Date:** 2026-09-07

## Context

`CheckResult` was `{ checkId, passed, reason, detail? }`. A check that
concluded something **by reading a returned value** and a check that **ran the
thing and watched it behave** produced structurally identical evidence.
`passed: true` is `passed: true`.

Concretely, in the same green mission:

- `title.nonEmpty` reads a string off the output and decides.
- `artifact.intact` reads the bytes back through a store that **re-derives the
  content address on read** (ADR from #61) and reports what actually happened.

Both rendered as `✔`. Nothing downstream — the mission log, gate 7's proof
scoring, the Absorption Score's Proof-coverage component — could tell them
apart, because the distinction was recorded nowhere.

> Atlas 1.0 §14: *"Do not claim stronger evidence than actually exists."*

The kernel had no way to express that claim, so it had no way to overstate it
— and no way to check it. This is **THE COUNTING RULE applied to proof**: a
count that does not name its method defaults to the weakest label its evidence
supports; a check that did not name its method defaulted to *looking exactly
like the strongest*.

## Decision

**1. Three values, not the Atlas's seven.** The precedent is `provenance.ts`,
which cut a larger source hierarchy to four because *"a vocabulary with more
values than the system can tell apart is the `advertised-not-measured` defect
wearing a taxonomy."* Four of the Atlas's seven have no mechanism here:

| Atlas type | Why it is absent |
|---|---|
| B Documentation | nothing reads authoritative docs as evidence |
| C Source | no check inspects an implementation; they inspect **output** |
| F Production | no operational telemetry exists to confirm from |
| G Consensus | nothing cross-references independent sources |

What ships is `reasoned` · `observed` · `measured`, deliberately echoing THE
COUNTING RULE's own trio. **The label names the METHOD, not the confidence.**

**2. Declared on the check, claimed on the result** — #63 asked which, and it
is both, because the split *is* the mechanism:

- `Check.verification` — the methods this check may **ever** use. Required,
  non-empty, refused at registration.
- `CheckResult.verification` — the method **this run** actually used. Refused
  by the harness if the check never declared it.

A check whose method never varies declares one and returns it every time. One
whose reach varies declares both and reports honestly — gate 11's fidelity
harness is already that shape, re-running CPython's difflib where the parent is
available and integrity-pinning Scrapling's where it is not.

**3. A set, not a ranking.** Ordering these would require asserting that
`measured` beats `observed`, which is not true in general — they answer
different questions, and a fake total order would be exactly the invented
precision this ADR exists to prevent. So "do not claim stronger evidence than
actually exists" is enforced as **do not claim a method you do not have**,
which is checkable. "Stronger" is not.

**4. An overclaim FAILS the step.** Not a pass with a note. Recording it
otherwise would be the green-check-on-nothing the whole spine exists to
prevent.

**5. It appears in the trace.** `title.nonEmpty [reasoned]` beside
`artifact.intact [observed]`. A distinction recorded and never shown is half a
feature; the reader of a mission log is the audience.

## Consequences

The kernel's own synthesised results are classified too, and one of them is why
`measured` exists at all rather than being an empty box: **budget exhaustion is
`measured`** — attempts, wall time and cost are counted against declared
ceilings, and the numbers are the evidence. `capability.completed` is
`observed`: the kernel invoked the capability and watched it fail; there was no
returned value, and that absence *is* the observation.

`browser.navigateSucceeded` is `reasoned`, not `observed`, and the reason is
worth stating: the navigation happened in a child process this check never
watched. It inspects what the bridge reported. Calling it `observed` would
claim a vantage point it does not have — the exact overstatement §14 names.

## What this does not do

**It cannot verify that a check calling itself `observed` observed anything.**
Nothing can, short of instrumenting the check itself. What it does is stop a
check claiming a method it never declared, which is where the drift would
start — the same shape and the same honest limit as `outputTrust` in ADR-0010.

**It does not yet change any score.** #63 raised whether gate 7 should refuse
to raise a proof score on weak evidence alone — the version with teeth, and the
version that could invalidate existing Absorption Scores. Gate 7 does not
exist, so that decision is deferred to it and to #52. This PR makes the data
available and says nothing about what should be done with it.

## Alternatives rejected

**All seven Atlas types.** A taxonomy where four values are unreachable
advertises a precision the system does not have — and the unreachable ones are
the impressive-sounding ones, which is the direction that flatters.

**Type on the result only.** Simplest, and it makes the field a label a check
writes about itself with nothing to check it against — the same position the
`trust` tag was in before #70.

**Type on the check only.** Cannot express a check whose reach legitimately
varies run to run, which is not hypothetical: gate 11's harness already does
exactly that and already prints which is which.
