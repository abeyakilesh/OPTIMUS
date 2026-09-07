# ADR-0011 — A check declares what it can verify

**Status:** accepted · **Date:** 2026-09-07

## Context

`Check` was `{ id, run }`. Nothing linked a check to the capability whose
output it understands, so this plan validated, ran, and was guaranteed red:

```json
{ "id": "s", "capabilityId": "web.fetch", "checks": ["browser.navigateSucceeded"] }
```

Not hypothetical — the first real compile against llama3.2:3b produced exactly
that pairing. The kernel could refuse an **unregistered** check and not an
**inapplicable** one, which is a hole in ADR-0009's guarantee that the compiler
"never returns a plausible-looking plan that fails at runtime": closed for
capabilities, open for checks.

`planCompiler.ts` carried a hardcoded `CHECK_APPLICABILITY` map as a stand-in,
with a note saying the real fix belonged on `Check`. Two things were wrong with
it beyond being temporary. It was **already inaccurate** — it listed
`title.nonEmpty` against `html.extractTitle` only, while the check reads
`output.title` and `browser.navigate` returns one too. And it could only
constrain the **compiler's own output**; a hand-written plan hitting the
scheduler directly got no check at all.

## Decision

**1. `appliesTo` is a required fifth thing a check declares.** Refused at
registration if absent or malformed, for the same reason `inputConstraints` is
required: an optional field becomes decoration on the things nobody revisits.

**2. Two kinds, because one cannot express both facts.**

- `{ kind: "outputs", requires: [...] }` — applies to any capability declaring
  those output fields. **Derived from ADR-0007's `outputs`, so it cannot go
  stale.** `artifact.intact` covers a sixth capability the moment it registers,
  with no list to remember.
- `{ kind: "capabilities", ids: [...] }` — applies to exactly these. For checks
  whose meaning is tied to an implementation rather than a shape.

Both were tried alone and neither survives. Ids-only makes `artifact.intact` a
list that goes stale on every absorption. Fields-only cannot separate
`llm.chatSucceeded` from `browser.navigateSucceeded`: **both read `ok`**, so a
field rule makes each apply to the other's capability — true about the shape,
false about the meaning.

**3. The empty list means opposite things in the two kinds.** The first draft
refused both with one message, which was a real bug caught while converting
fixtures:

| | means | verdict |
|---|---|---|
| `ids: []` | matches **nothing** — unreachable | refused |
| `requires: []` | matches **everything**, vacuously | allowed |

`requires: []` is the honest declaration for a check that does not read the
output at all. Forcing it to name a field it never touches would be a lie told
to satisfy a validator.

**4. Enforced at the scheduler, not only in the compiler.** `validatePlanChecks`
runs beside `validateReferences` — both answer "is this plan coherent before
anything runs". A hand-written plan now gets the same refusal a compiled one
does, which the compiler-local map could never provide.

**5. `CHECK_APPLICABILITY` is deleted, not kept alongside.** Two copies of one
fact is `stale-duplicate` whichever is authoritative. The compiler's prompt,
the plan validator and the tests all call `checkAppliesTo`.

**6. Deliberately not derived from the id.** `browser.navigateSucceeded` begins
with `browser.navigate`; `relocate.foundMatch` begins with neither. Inferring
the link from a name is `name-over-capability`, and the near-miss already bit
once in ADR-0009's own tests (`substring-vs-token-match`).

## Consequences

`title.nonEmpty` now correctly applies to `browser.navigate` as well as
`html.extractTitle` — a widening the old map got wrong, surfaced by deriving
the rule instead of maintaining it.

`expectArtifact(id)` was flagged in the issue as needing per-instance
applicability. It does not: the **id** varies per instance, the **shape it
reads** does not, so every instance declares `requires: ["artifactId"]`.

Two robustness gaps in neighbouring code were exposed and fixed rather than
worked around. `literalInputViolations` called `broker.manifest()` on an
unregistered capability and **threw** where every other path returns a
refusal — surviving only because a guard upstream normally caught it first,
which its own mutation test deliberately removes. And the compiler now
intersects the caller's `checkIds` allow-list with what the broker actually
holds, rather than assuming they agree.

## What this does not do

It answers "can this check read this capability's output", not "is this check
the RIGHT one to ask here". A plan may still pair `artifact.intact` with a step
whose real risk is elsewhere; that is a judgement about mission design, and
nothing in the kernel is positioned to make it.
