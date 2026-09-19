# ADR-0015 — The mission canvas: no pixel without an event

**Status:** accepted (design only — nothing is built) · **Date:** 2026-09-07

## Context

The product surface is a large canvas where a mission is watched happening:
the goal, the plan appearing, steps running, which tool each step uses, what it
produced, and where the results are kept.

The risk is not that this is hard to build. The risk is that it is the most
satisfying thing in the project to build, and **SDE-Atlas died of exactly
this** — Mission Control before the kernel worked, shipping a health-score ring
that animated over nothing while its own PRD listed *"real repository
analysis"* as a non-goal. Every box ticked. Nothing worked.

So this ADR records the shape and, more importantly, records the rule that
stops the canvas from becoming decoration.

## Decision

### 1. No pixel without an event

**Every visual element maps to a `KernelEvent` that already exists.** If
something on screen has no event behind it, it is not drawn — however good it
would look.

The kernel publishes ten event types today, and the surface is a fold of them,
exactly as `MissionState` is:

| On screen | Event it reads |
|---|---|
| The goal | `mission.proposed` → `spec.objective` |
| The plan appearing | `mission.proposed` → `spec.steps` |
| A step lighting up | `step.started` |
| Retry counter | `step.attempt` (n of `maxAttempts`) |
| Step result, checks, evidence | `step.finished` → `Evidence` |
| **Data-flow arrows** | `step.resolved` → `{ at, from, outputArtifactId }` |
| A step greyed out | `step.blocked` / `step.continued` |
| Final verdict | `mission.finished` → green \| red |
| Undo | `mission.rolled-back` |
| **Warehouse** | the artifact store — content-addressed, already exists |

### 2. There is no "thinking" event, so there is no thinking animation

The obvious element — a pulsing blob while the agent "thinks" — has **nothing
behind it**. The model call happens *inside* a step; the kernel emits no event
for deliberation, because it cannot observe any.

A thinking indicator bound to nothing is the Atlas health-ring with better
taste. What is real, and more interesting anyway: **`step.attempt 2 of 3`** —
the loop actually retrying, against a declared budget.

### 3. It is a DAG, not a list

Steps run in parallel; `dependsOn` is a real graph and the scheduler honours
it. A vertical chat-style list **lies about the shape of the work** — it shows
sequence where there is concurrency, and hides the structure that makes a
mission a mission rather than a transcript.

This is the largest single visual difference from every chat UI, and it comes
free from data the kernel already emits.

### 4. The refusal screen is a feature, not an error state

When the plan compiler **refuses** — no capability can serve the objective, a
check does not apply, a reference would launder untrusted content — that is the
most important screen in the product, and the one every demo hides.

> *"Cannot compile: no capability can send email. Available: web.fetch,
> html.extractTitle, …"*

Directive #4 says a demo that lies is worse than a missing feature. A surface
that only renders success is that demo.

### 5. Evidence is reachable, and strength is visible

Every check renders its **verification method** beside its verdict —
`title.nonEmpty [reasoned]` next to `artifact.intact [observed]` (ADR-0013).
Two green ticks that are visibly *not the same strength*.

Clicking a check reaches its artifact by content address. The hash is not
decoration: it is how a person confirms the thing themselves.

### 6. Budgets burn down live

`attempts`, `elapsedMs` and `cost` against their declared ceilings are now
recorded in evidence (#63 review). A ring that fills as a **real** budget burns
is both honest and the best-looking element on the page — the rare case where
the truthful thing is also the impressive one.

### 7. Time-travel comes free

`state is a fold of the log`. A scrub-bar that replays a mission is a `reduce`
over a prefix of the events — no extra machinery, no second source of truth.

## Consequences

The canvas is a **projection**, never a source of truth. It holds no state the
log does not hold, so two people watching the same mission cannot disagree, and
a reload loses nothing.

It also means the surface can be rewritten entirely without touching the
kernel — which is the property the Atlas never had.

## What this deliberately does not do

**It is not scheduled.** This is WP-005 territory, blocked behind a mission
that runs and verifies end to end. `docs/WORK_PACKAGES.md` caps the registry at
six rows, and a design being written down does not earn one.

**It is not a control plane.** Watching and steering from another device is
ADR-0012, a different concern with a different threat model.

## The test that keeps it honest

**If a UI element ever requires a new kernel event, that is the signal the
surface is being designed too early** — the same one-directional rule as
ADR-0012. The mapping table above runs one way on purpose: every row starts
from something the kernel already emits.

An exception is allowed only when the missing event is something the kernel
*should* record for its own sake, independent of any screen.

## Alternatives rejected

**A chat transcript with tool-call bubbles.** What everyone else ships. It is
the wrong shape: it renders a graph as a sequence, hides parallelism, and has
nowhere to put evidence, budgets, or a refusal that is more informative than a
result.

**Rendering "agent state" from model output.** Whatever the model says it is
doing, unverified. That is a narrated demo, and the narration is exactly the
thing this project refuses to trust.

**Building it now, in parallel with absorption.** The reason there is a bible
at all.
