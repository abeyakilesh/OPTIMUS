# ADR-0007 — A capability declares what it returns, and the kernel checks it on the way out

**Status:** accepted · **Date:** 2026-08-26

## Context

ADR-0006 added the third leg of the capability manifest: step input is its own
boundary, separate from permission and isolation. Three legs described the
capability and what it may be handed. Nothing described **what it gives back**:

```
$ grep -n "outputConstraints\|outputSchema\|outputs" kernel/types.ts
(no matches)
```

That absence had not cost anything yet, because nothing in the kernel had ever
needed to reason about a step's output before the step ran. Two pieces of work
immediately downstream do:

- **`$from` reference resolution.** A plan says `{"$from": "fetch.artifactId"}`
  and a later step consumes it. Rejecting `{"$from": "fetch.title"}` while the
  plan is being *validated* — rather than three steps into a mission — requires
  something that records `web.fetch` returning `artifactId` and `bytes` and no
  `title`.
- **The plan compiler.** With no machine-readable output declaration it has to
  read field names out of a capability's prose `description`, which is a
  description of a thing that lives somewhere else and is checked by nobody.

## Decision

**1. `outputs` is a required field of `CapabilityManifest`**, with the same
reasoning as `inputConstraints`: optional means decoration on the manifests
nobody revisits. A capability that returns nothing declares `{}`, meaning "the
output must be empty" — there is no value meaning "anything goes".

**2. It reuses the input contract's constraint vocabulary.** `kernel/inputContract.ts`
is already a small closed set of kinds, already linear in the size of the value,
already compiles no patterns, and already refuses undeclared fields. A second
schema language would be a second thing to keep true.

**3. Two kinds are refused in an output declaration: `url` and `executable`.**
They exist to *restrict* a value the kernel is about to act on — refuse the host
before a request is assembled around it, refuse the binary before `spawn()` sees
it. An output has already been produced. The same declaration on the way out can
only ever fail a step late while *reading* as a security boundary, which is
`rule-without-mechanism` wearing a security-shaped name.

**4. It is enforced at runtime, in the same PR that introduced it.** The harness
calls `broker.validateOutput` after `run()` returns and before any check sees the
value. This is the load-bearing half of the decision, and the reason it is not a
follow-up: a declaration nothing compares to reality is a claim about a thing
that lives elsewhere, and `$from` is about to trust it. Validated-at-registration
only would answer *"does the manifest claim this field"* — and a manifest that
has drifted from its `run()` then produces a plan that validates and resolves to
`undefined` several steps downstream.

**5. The contract is checked BEFORE the step's checks.** A check answers the
mission's question ("is this title non-empty"); this answers the contract's ("is
this the shape the manifest promised"). A capability that has drifted from its
own manifest fails with the field named, rather than as whatever downstream
confusion the wrong shape happens to produce.

## Consequences

**Good**

- `$from` can be validated at plan time rather than discovered at runtime, which
  is what makes a mission a proposal that can be refused rather than a program
  that fails halfway.
- The closed field set means a capability cannot grow an output field silently.
  It earns most on `browser.navigate`, whose output is JSON parsed from a child
  process the kernel does not sandbox: an extra key appearing there is a change
  in something outside this repo, and it now fails the step by name.
- Five manifests were read against their implementations to write this, and the
  reading is the value. `llm.chat` has three return paths, only one of which
  carries `content`; `scrapling.relocate`'s `matches` omit their parent fields
  for a root-level element. Neither is visible from the type declaration alone.

**Bad, accepted**

- **Every manifest is longer again**, on top of ADR-0006's input block.
- **A capability's return type now needs two edits** — the interface and the
  declaration. Forgetting the second fails closed (the step is refused), which is
  the right direction but is a papercut.
- **It moved where several existing tests fail.** A new door upstream of an old
  one inherits its refusals, and four places were exercising the old one: AC-3's
  sabotage, the `npm run mission fail` demo, and three check-logic suites. All
  four kept going red and stopped testing their subjects. Recorded as its own
  defect class, `new-door-inherits-old-failures`, because this will happen again
  the next time a door is added.
- **A check's malformed-output branch is now unreachable through the harness.**
  `Check.run` still takes `unknown` and must still survive one, so those tests
  call the check directly instead. Two tests where there was one.
- **The declaration can still drift from a return path that no test exercises.**
  Runtime validation only checks the paths that actually run. `llm.chat`'s
  timeout path is declared and, in CI without a live OmniRoute, not exercised.

## Supersedes / relates

Extends ADR-0006, which added the third leg. Does not supersede anything.
