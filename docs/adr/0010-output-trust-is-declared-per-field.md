# ADR-0010 — Output trust is declared per field, and checked at plan time

**Status:** accepted · **Date:** 2026-09-06

## Context

ADR-0006 made input a boundary. ADR-0007 made a capability declare what it
returns. Neither says who **authored** what comes back, and that is a different
question with a different consequence: `browser.navigate` returns `ok` and
`text` with identical `boolean` / `string` honesty, and one of them is written
by whoever controls the page.

`llm.chat` has required a `trust` tag on every message since #65, fail-closed
at the manifest door. What that could not do is tell whether the tag was
**true**. `kernel/provenance.ts` said so in its own header rather than leaving
it to be discovered:

> a caller that tags fetched web content as `kernel` is lying, and nothing here
> detects that

That was tolerable while every call site was hand-written. Two things made it
not tolerable. ADR-0008 gave the graph real data flow, so a value now arrives
by reference and the kernel knows at plan time exactly which capability
produced it. ADR-0009 then put a **model** in charge of writing plans. A
compiler that can wire `web.fetch` into `llm.chat` and assert the result is
`kernel` is a prompt-injection laundry with a schema.

## Decision

**1. Trust is declared PER FIELD, not per capability.** The alternative was one
level for a whole capability, and it fails on the first real case:
`browser.navigate` would have to be `untrusted` — making `ok` useless as a
check input — or `capability`, which is false about `text`. `outputs` is
already keyed by field, so the honest answer is also the structurally simpler
one. It is `outputTrust`, the fifth leg of gate 8, required and exhaustive in
both directions.

**2. Two levels are legal for an output, not four.** `kernel` and `operator`
are refused at registration, with the reason in the error text:

- `kernel` means bytes OPTIMUS itself authored — committed policy — and is the
  only level `mayInstruct` returns true for. A return value is computed at run
  time from inputs the kernel did not write. A capability that could declare
  one `kernel` would **mint instructions by returning them**.
- `operator` means text the human typed. A capability returns nothing the
  human typed.

So: `capability` (computed here — trusted as a value, never as an instruction)
or `untrusted` (came from outside the boundary).

**3. Required, with no default.** `untrusted`-by-default was the other
candidate and it loses for the reason `inputConstraints` is required rather
than optional: a field that may be omitted becomes a field nobody revisits, and
the omission reads as "safe" long after it stopped being true. Making the
author write `untrusted` next to `text` **is** the mechanism.

**4. The plan-time check keys off the provenance SHAPE, not off `llm.chat`.**
`validateReferences` refuses a reference to an `untrusted` field that sits
inside an object carrying a `trust` sibling tagged anything better. Nothing in
`references.ts` knows which capabilities talk to models. Any capability
accepting the kernel's own provenance shape gets the check the day it
registers — which is the difference between a rule and a special case.

**5. Under-tagging is refused; over-tagging is allowed.** Carrying a
`capability` field as `untrusted` costs fidelity and nothing else. Refusing it
would punish caution and push plan authors toward the weaker tag.

## Consequences

**`llm.chat` does NOT become selectable, and an earlier draft of this ADR said
it did.** PR #74 recorded selection as "Blocked on #70", which made
"selectable now" the obvious consequence to write down. It is wrong, and it was
caught in review rather than by a test — worth recording, because an ADR
claiming a product change the same commit declines to make is the defect the
neighbouring rules exist to prevent, in the document justifying a rule about
honest declarations.

What this actually delivers is **half** of that blocker. A message whose content
is a `$from` reference is now structurally forced to carry the producing
field's real trust, so a compiled plan cannot chain two `llm.chat` steps into
each other's `kernel` messages and cannot present a fetched page as operator
intent. The remaining half is the **literal**: the model writes every literal
in a compiled plan, so tagging one `kernel` is still a lie with no reference to
check it against. `CAPABILITY_SELECTION` keeps `selectable: false` and its
reason string now says exactly this. The honest fix is a rule that `llm.chat`
message content must be a reference and never a literal — its own decision and
its own PR.

`llm.chat.content` is declared **untrusted**, which is the least intuitive line
in the kernel and the one most likely to be "corrected" later. Nothing attacked
us to produce a completion; it is untrusted because nobody accountable wrote
it, and because the context window that produced it routinely contains bytes
this kernel already labelled untrusted. Weakening it would let a model
laundering attacker text into a summary pass that summary on as trusted, and
the fence around the original would have bought nothing.

## What this does not do

Stated here because the check is easy to over-read, and enumerated in code at
`assertTrustNotLaundered`:

1. **Trust does not propagate.** `html.extractTitle` declares `title`
   untrusted because a human decided it does, not because the kernel traced
   the bytes. A manifest that declared it `capability` would register cleanly.
   This is the weakest joint in the mechanism.
2. **The artifact store is not covered.** `web.fetch` correctly declares both
   its fields `capability` — a SHA-256 and a length are facts OPTIMUS
   established, not the response. The untrusted body leaves through the
   artifact store where no reference can see it.
3. **A hand-written literal is not covered.** Someone who pastes scraped text
   into a plan as a string tagged `kernel` is lying, and there is no reference
   to catch them by. Unchanged from provenance.ts.

This checks what the **plan declares**, not every route a byte can take. What
it closes is the one route a model can author, which is the route that matters
now that ADR-0009 exists.

## Alternatives rejected

**Full dataflow taint tracking.** The correct long-term answer and much larger
than one PR. It also needs the static declaration first — taint has to start
somewhere, and that somewhere is a manifest saying "this field is untrusted".

**Inferring trust from the permission list.** `html.extractTitle` holds zero
permissions and returns attacker-authored text. The permission list is the
kernel's usual danger signal and it is exactly wrong here; that inference is
recorded as `purity-mistaken-for-trust` in `docs/DEFECT_CLASSES.md`.

**Hardcoding `llm.chat` in the validator.** Would have worked today and would
have silently stopped working the first time a second model-facing capability
was absorbed — which is the next thing this repo intends to do.
