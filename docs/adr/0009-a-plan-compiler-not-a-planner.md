# ADR-0009 — A plan compiler, not a planner

**Status:** accepted · **Date:** 2026-08-26

## Context

Nothing turned an objective into a `MissionSpec`. `app/api/missions/route.ts`
hard-coded a one-step `llm.chat` plan, so four of five registered capabilities
were unreachable from the running product — absorbed, scored, tested, and
inert.

ADR-0007 gave capabilities declared outputs and ADR-0008 gave the graph real
data flow. Both existed so that something could write a plan and have it
checked. This is that something.

## Decision

**1. It is called a plan compiler — in the code, the type names, the tests, the
PR title and this file.** Not "planner". A planner searches, revises and
replans; this does none of those:

- **single shot** — one model call. A wrong plan fails and a human looks.
- **no search** — no alternatives, no scoring, no backtracking.
- **no replanning** — a red step does not produce a new plan.

What it does is translate one language into another over a fixed instruction
set, refusing what it cannot translate. That is a compiler, including the
refusing.

The honest name is written into the code because a name that lives only in a
design conversation drifts back within a few PRs, and "planner" would promise
three things this does not do.

**2. The capability set is a parameter, and selection is fail-closed.** The
compiler never reads a global registry. `selectionOf` applies three rules with
deliberate precedence: a capability declaring `unconfinedChildEgress` is never
selectable whatever else says; a capability absent from `CAPABILITY_SELECTION`
is not selectable; otherwise the record decides. A test fails if any registered
capability has no entry, so absorbing one forces the decision rather than
defaulting to yes.

**This is not a fidelity-score filter, which is what was originally specified.**
There is no machine-readable score in this repo — the only occurrences of
"Absorption Score" in code are inside a script that parses a PR *body*, and #52
exists because the recorded ones are stale. The nearest machine-readable
fidelity signal, a golden in `kernel/fixtures/goldens.json`, covers 1 of 3
non-builtin capabilities and is undefined for the two builtins, which have no
parent to have fidelity against. Filtering on it would have left the product
with no live path. When #52 produces a real score, `CAPABILITY_SELECTION` is
where it plugs in.

**3. `llm.chat` is not selectable, for a provenance reason rather than a blast
radius one.** Every literal in a compiled plan was written by the model, and
each `llm.chat` message carries a required `trust` tag. A message the compiler
emits cannot declare that tag truthfully: `kernel` would be a lie about
model-authored bytes, `operator` a lie about anything the operator did not
write, and `untrusted` — the only honest option — would fence the operator's
own words as data. Blocked on #70.

**4. It may not emit `agent`.** That field selects which repair strategy runs
when a step fails, so a model choosing one chooses the recovery code for its own
mistake. It is also a label that makes a trace read as though a named actor was
involved when none was.

**5. Every compiled plan goes through the same validation a hand-written one
gets, plus one more.** `validateGraph`, `validateReferences`, capability-set
membership, check applicability — **and the input door at plan time**. The last
was not in the original design and was added because the first real compile
produced it: asked to send an email, llama3.2:3b answered
`web.fetch { url: "mailto:accountant@example.com" }`, and every gate accepted it
because nothing compared step input to the manifest until the harness ran it.

**6. Refusal over fabrication, and no lenient parsing.** A plan that cannot be
built returns an honest refusal. The model's own `{"refuse": "..."}` is honoured
and marked as the model's rather than ours. Output that is a valid JSON object
followed by more text is **refused, not salvaged** — in an observed run the
trailing content was itself a refusal, so taking the first object would have
converted an admitted refusal into a plan, inverting the whole point.

**7. The request has two halves that never merge.** `compilerInstructions` is
kernel-authored and does not contain the objective; the objective travels as a
separate message. Interpolating it would put operator text inside a message
tagged `trust: "kernel"` — manufacturing the confusion #64 closed, in the PR
that lets a model choose capabilities.

## Consequences

**Good**

- A mission with more than one capability is reachable from the product for the
  first time.
- The instruction set is rendered from the manifests, so the prompt cannot
  disagree with the doors that will actually judge the plan.
- Plan-time input validation means "this plan was never going to work" is said
  before any budget is spent, rather than "step 3 failed".

**Bad, accepted**

- **The local model is marginal at this task, and the number is in the PR.**
  llama3.2:3b reliably produces a *correct* plan and then appends commentary or
  a second JSON object, which strict parsing refuses. This is a real limit of
  the local-first bet at 3B, not a compiler defect, and it is reported as a
  measured rate rather than averaged away.
- **The model contract certifies a behaviour it did not test at this size.** Its
  `strict-json` probe grades a 40-token answer; the trailing-prose failure only
  appears on a plan-sized output. Filed as #72.
- **`CHECK_APPLICABILITY` is a second place that knows about checks.** The right
  home is a declaration on `Check` itself, so the broker enforces it for
  hand-written plans too — #71. Until then this record and the `Check` list can
  drift, and only an exhaustiveness test holds them together.
- **The chat path is not compiled**, so `route.ts` has two paths rather than
  one. Both are named in the response (`compiled`, `compilerReason`) so a
  refusal is visible rather than converted into something that looks like
  success.
- **Plan-time input validation cannot check a resolved reference.** It proves
  the literals are acceptable; a declared output constraint says a field's kind,
  not the value a given run will produce.

## Supersedes / relates

Depends on ADR-0007 (declared outputs) and ADR-0008 (`$from`). Neither is
optional: without outputs the compiler guesses field names, and without
references it can only emit steps that do not talk to each other.
