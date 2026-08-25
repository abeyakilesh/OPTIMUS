# ADR-0006 — Step input is its own boundary, separate from permission and isolation

**Status:** accepted · **Date:** 2026-08-25

## Context

The kernel had two boundaries around a capability:

- **Permissions (K2)** — WHAT it may do: `fs:read`, `net:write`, `proc:spawn`.
- **Isolation (K4)** — WHERE it may do it: `readRoots`, `writeRoots`,
  `allowedHosts`, `cwd`, `env`.

Both describe the capability. Neither describes the **input the capability is
handed**, and a survey of the three absorbed capabilities found three real
holes of exactly that shape:

| Capability | Field | What the existing boundaries did |
|---|---|---|
| `llm.chat` | `baseUrl` | K4 refuses the socket to a remote host — **after** the capability has assembled a request around it, `Authorization: Bearer <apiKey>` included |
| `browser.navigate` | `url` | Nothing. `file:///etc/passwd` went to a real Chromium and came back in `output.text`. K4's `readRoots` do not apply: the read happens in a child process — the same blind spot `unconfinedChildEgress` already admits to for sockets |
| `browser.navigate` | `pythonExecutable` | Nothing. The string was passed to `spawn()` as the command. `proc:spawn` gates WHETHER a child runs; `isolation.cwd` gates WHERE. Nothing gated WHICH BINARY |

The stated form of the gap:

> K4 refuses the outbound connection; it does not refuse a capability
> constructing a request to a host it was handed. Those are different layers.

The second and third holes are not fixable by tightening permissions or
isolation at all, because neither is a permission or an isolation question.

**Reachability, stated honestly.** Today step input is built by server code in
`app/api/missions/route.ts`, so none of these was reachable by an outside user.
The next kernel task hands that job to a **planner** — an LLM writing step
inputs from a user's objective. These become reachable exactly when that lands,
which is why this was sequenced first.

## Decision

A third leg on the capability manifest: **`inputConstraints`**, declaring the
shape and permitted values of the step input a capability accepts. The **broker**
validates against it, and the harness calls that validation **before `run()`** on
**every attempt**.

Four choices worth recording:

1. **Required, not optional.** An optional field becomes decoration on the
   manifests nobody revisits. A capability taking no input declares `{}`, which
   means *"the input must be empty"* — there is no value meaning "anything goes".
   Making it a required TypeScript field meant the compiler named all 16 sites
   rather than discovering them one failing test at a time.

2. **A closed set.** An undeclared field is refused, not ignored. Ignoring is
   how a new parameter gets added to a capability and never acquires a
   constraint.

3. **Not JSON Schema.** A small closed set of kinds, every check linear in the
   size of the input, and **no pattern compilation**. The manifests are trusted;
   the input is not, and a regex engine between the two is a denial-of-service
   surface with no reason to be open. URLs are *parsed*, not matched.

4. **Checked on the broker, not in the capability.** A capability validating its
   own input is a capability trusting itself — and by the time `run()` holds the
   value it is one line from putting it in a request or a command line. The
   broker is the single door every invocation already passes through, the same
   reason the permission boundary lives at one door.

An unconstrained host must be declared explicitly (`anyHost: true`) rather than
left implied, mirroring gate 10's rule that a permission without a radius is
refused. `browser.navigate` legitimately takes any host — navigating the web is
the job — and now says so where a reader can see it.

## Consequences

**Good**

- Two holes closed that no other boundary could close.
- `llm.chat` gains defence in depth: the value is refused before a request
  carrying a credential is assembled around it.
- Manifests now document their parameters, which the coming MCP adapter needs
  anyway — it will generate manifests from a remote tool listing, and generated
  constraints are exactly where a typo'd `kind` must be refused rather than
  silently ignored.
- Repaired input is re-validated. A repair is code writing input today and an
  LLM writing input shortly; it goes through the same door.

**Bad, accepted**

- **Every manifest is longer**, and a capability with a rich input has a rich
  constraint block. Accepted: that block is the parameter documentation, which
  did not exist before.
- **A new parameter now needs two edits** — the interface and the constraint.
  Forgetting the second fails closed (refused as undeclared), which is the
  right direction to fail but will be a papercut.
- **The `executable` allow-lists mention real filesystem paths**, so a machine
  with Chrome somewhere unusual needs an operator-set env var. The trust
  boundary is drawn deliberately: step input may only SELECT from the list;
  the environment — which already chose our PATH and interpreter before the
  process started — may extend it.
- **The Absorption Score rubric has no slot for this.** A capability can be
  25/25 on Safety (permission · sandbox · verify · log · rollback) and still let
  step input choose which binary the kernel executes. Recorded here rather than
  quietly fixed by inflating a score; the rubric is CLAUDE.md's and changing it
  is its own decision.

## Supersedes / relates

Extends the boundary model in ADR-0003. Does not supersede anything.
