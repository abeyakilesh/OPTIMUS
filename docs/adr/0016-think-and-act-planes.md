# ADR-0016 — THINK and ACT planes, methods, and the outcome the kernel is missing

**Status:** accepted (design) · **Date:** 2026-09-07 · **Author:** owner spec, recorded here

## Context

The owner specified a real-world execution layer: two planes, a method
registry, and checker rules that apply identically regardless of what a step
does. Most of it maps onto machinery that already exists — evidence, checks,
the event log, `docs/DEFECT_CLASSES.md`. **Three parts do not exist at all**,
and they are the reason this is an ADR rather than a note.

Verified against the code before writing:

```
grep -rn "sideEffect|irreversible|THINK|ACT plane|human-review" kernel/   → nothing
StepStatus = pending | running | passed | failed | budget-exhausted | blocked | skipped
```

## Decision

### 1. Every step declares its plane

- **THINK** — planning, reasoning, scoring, parsing. No side effects. Safe to
  re-run, safe to retry, safe to replay.
- **ACT** — touches the real world. Sends, writes, books, spawns, posts.

This is **not** the same as `permissions`, and conflating them is the mistake
to avoid. Permissions say *what a capability may reach*; the plane says
*whether the world changes if it runs twice*. `llm.chat` holds `net:write` and
is THINK — running it again costs tokens and changes nothing outside.
`communicate.send` run twice sends two emails.

### 2. **Irreversibility is the real consequence, and the spec did not state it**

CLAUDE.md lists **rollback** as one of the five guarantees a capability must
wire. **An ACT step can break it.** You cannot un-send an email, un-book a
meeting, or un-post a message.

So the guarantee changes shape rather than disappearing:

> **A THINK step is protected by rollback AFTER. An ACT step must be protected
> by approval BEFORE.**

An irreversible step declares `reversible: false`, and the kernel refuses to
run it inside a mission that has not been approved for exactly that action.
This is what "nothing applies to the real world with a red check" already says
— made enforceable for the case where "applies" cannot be taken back.

### 3. A METHOD is a shared proof contract

A method groups tools that produce the **same shape of proof**, so a new tool
inherits a checker instead of hand-writing one:

| METHOD | Proof it must return |
|---|---|
| `communicate.send` | delivery/message id, non-null |
| `communicate.read` | message object; sender + subject match intent |
| `data.read` | non-empty payload, schema validated |
| `data.write` | path + sha256, or insert id |
| `schedule.read` | event array, date range matches query |
| `schedule.write` | event id, time + title match intent |
| `compute.run` | exit 0 + stdout matches expected pattern |
| `web.interact` | non-empty content, source URL logged |
| `service.call` | HTTP 2xx + body passes the output schema |

This is the same leverage as the xmcp play: the expensive part is proving a
tool, and a per-method contract makes the proof reusable where the tool is not.

### 4. **`HUMAN_REVIEW` — the outcome the kernel does not have**

The checker rules end with the important one:

> *intent match cannot be asserted → HUMAN_REVIEW, not DONE*

Today a step is `passed` or `failed`. There is no way to record **"the tool
succeeded and I cannot prove it did the right thing."** Forced to choose, a
checker either passes it — a green tick on an unverified action — or fails it,
which is false and blocks a mission that may be fine.

`human-review` is added as a distinct `StepStatus`, and a mission containing
one is **not green**. This is the same honesty as `advertised` vs `measured`:
the third value exists because collapsing it into either neighbour is a lie.

### 5. **HUMAN_REVIEW will be COMMON, not exceptional — say so now**

The spec's rule 4 is the demanding one: *correct target + correct content +
correct timing*, not "something came back". Most methods can only mechanically
prove **delivery**, not **correctness**. A Gmail message id proves the API
accepted a message; it proves nothing about whether the right words went to
the right person.

So `human-review` should be expected as the **default** outcome for
`communicate.send` and most `schedule.write`, not a rare escape hatch. Designing
it as an edge case guarantees pressure to weaken rule 4 the first week — which
is how "intent match" quietly becomes "id non-null".

## Consequences

`browser.navigate` becomes the first capability to be re-examined under this:
it spawns a child process, which is ACT by the definition above, and it is
currently treated like any other step.

The plan compiler gains a hard rule: **a compiled plan may not contain an
irreversible ACT step**, for the same reason it may not currently select
`browser.navigate`. A model may propose one; only a human may approve one.

`#84`'s remaining capabilities land under this vocabulary directly, which is
the immediate value rather than a future one:

| #84 capability | Plane | Method |
|---|---|---|
| `github.resolve` | THINK | `data.read` |
| download tarball | **ACT** (writes to disk) | `data.write` |
| `archive.extract` | **ACT** (spawns tar, writes) | `compute.run` |
| `repo.intact` | THINK | it is a checker |

Notably: downloading is ACT but **reversible** — a wrong file can be deleted.
So it needs no approval gate, and that distinction is exactly why
`reversible` is a separate flag from the plane rather than implied by it.

## Status

**Design only. Nothing here is built**, and per THE ENFORCEMENT RULE that is
stated rather than implied. It is not a work package; `docs/WORK_PACKAGES.md`
caps the registry at six and a design does not earn a row.

The parts that will land first are the ones #84 needs anyway: the plane and
method labels on the four new capabilities, so the vocabulary is exercised on
real work before it is generalised.

## Alternatives rejected

**Treating "has permissions" as ACT.** Wrong, and dangerously so: `llm.chat`
holds `net:write` and is THINK, while a zero-permission capability that writes
through an injected client would be ACT. The plane is about *world change*, not
*reach*.

**Passing a step whose intent cannot be verified.** A green tick on an
unverified real-world action is the exact defect this project exists to
prevent, and it is worse than usual here because the action already happened.

**Rollback for ACT steps.** Cannot be built for the irreversible ones. Approval
before is the honest substitute; pretending an undo exists is worse than
admitting there is none.
