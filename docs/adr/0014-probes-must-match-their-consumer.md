# ADR-0014 — A probe grades at its consumer's size, with its consumer's reading

**Status:** accepted · **Date:** 2026-09-07

## Context

`strict-json` asked a model for a ~40-token object. llama3.2:3b passed,
`qualified.json` recorded it, and everything downstream read that record as
"this model emits strict JSON".

The plan compiler asks for something else entirely: a nested, multi-field
object of ~400 characters, and it **refuses any bytes after the closing brace**.
Measured on the same model, three consecutive compiler runs:

| run | outcome |
|---|---|
| 0 | correct plan, then `Note that the url is incorrect…` |
| 1 | correct plan, then a **second object**: `{"refuse": "…"}` |
| 2 | clean |

**7/10 compiled** across two independent samples of ten. The plans were
correct. What failed was *stopping* — and a probe whose answer has nothing to
stop after cannot exercise that.

`qualificationOf` is a gate: an unqualified model makes the model layer
UNAVAILABLE and the route returns 503. So the probe set decides what OPTIMUS
trusts a model to do, and it was certifying for a size of task it never ran.

## Decision

**1. `plan-shaped-json` — a probe the size of the use.** Nested, two linked
steps, an array, cross-references, and a worked example. Graded on the
**same strict parse the compiler uses**, including *nothing after the closing
brace*.

The worked example is deliberate rather than generous: measured **7/10 with
one and 0/6 without**, because without it the model invented a literal id
instead of a reference. A probe must resemble its consumer — being *harder*
than the consumer is the same defect pointed the other way.

**2. `refuses-without-capability` — refusal on a missing TOOL, not a missing
fact.** `refuses-to-fabricate` grades a trivia question. The compiler needs a
model that declines *an objective its tools cannot serve*. The dangerous
failure is a model routing "send an email" through a fetcher: downstream that
is a plan that runs and cannot possibly work.

**3. One strict reading, shared.** `unfence` and `trailingAfterFirstObject`
moved out of `planCompiler.ts` into `kernel/strictJson.ts`, imported by both.
Two implementations of "read exactly one JSON object" is `stale-duplicate` with
a security-shaped consequence.

**Taking the first object and ignoring the rest is refused**, and run 1 is why:
the trailing content was a *refusal*. Leniency there converts an admitted
refusal into a plan — inverting the model's own answer.

**4. `CONTRACT_VERSION` → 2, and the record is EMPTIED, not carried forward.**

## Consequences — stated plainly, because they are the point

**No model is qualified today.** The model layer is UNAVAILABLE and the route
returns 503 until someone re-runs the probes against a live OmniRoute.

That is the honest state, not a regression to work around. The issue said so in
advance: *"if llama3.2:3b fails the new probe, it is UNQUALIFIED and the
local-first bet needs a bigger local model — that is information, not a reason
to weaken the probe."*

**One precision matters.** llama3.2 and qwen2.5 are **not known to fail v2** —
they are **unmeasured** against it. CI has no local OmniRoute, and writing
entries by hand is the defect `qualified.json`'s own header names: *"the same
defect as marking a capability AVAILABLE without proof."* So the record says
"nothing qualified yet", which is true, rather than "these were rejected",
which is not.

The tests were rewritten to assert that honest state, plus a guard that any
future entry carries a result for **every** probe, all passing — so the empty
record cannot be quietly repopulated by hand to make a red test green.

## What this does not do

It does not make the compiler's 7/10 into 10/10. It makes the **certificate**
honest about which of those a model has earned. Whether a 3B model is good
enough for plan compilation is now a question that gets *measured* rather than
inherited from a probe that never asked.

It also says nothing about scoring. Whether weak evidence should cap a proof
score is gate 7's decision and #52's, and gate 7 does not exist.

## Alternatives rejected

**Keep v1 records and add the probes for new models only.** Cheaper, and it
leaves two entries certifying a claim they never faced — the exact
overstatement the bump retires.

**Grade "extract the first JSON object".** Would have passed runs 0 and 1, and
turned an observed refusal into a plan.

**Shrink the probe until llama3.2 passes.** The gate exists to tell us whether
the local-first bet holds. A gate tuned until it agrees has stopped being one.
