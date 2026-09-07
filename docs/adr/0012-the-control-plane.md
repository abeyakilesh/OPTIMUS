# ADR-0012 — The control plane: one mission, many devices

**Status:** accepted (design only — nothing is built) · **Date:** 2026-09-07

## Context

OPTIMUS runs long missions. A person is not sitting at the machine for all of
them. Watching, pausing, steering and approving has to work from a phone, a
tablet, or a second laptop — anywhere the operator is already signed in.

The risk is not that this is hard. The risk is that it is *exciting*, and that
building it early lets a surface define the kernel. SDE-Atlas built Mission
Control before its kernel worked and shipped a health-score ring over nothing.
The correction is not "never design the surface" — it is **"do not let the
surface define the kernel."**

So this ADR records the shape and explicitly does not schedule the work.

## Decision

**1. This is not a second architecture.** Every part of it starts from
something the kernel already produces. The table is deliberately
one-directional:

| The kernel already has | What the control plane does with it |
|---|---|
| `state is a fold of the log` — the CLI prints it today | Any device rebuilds the same state by replaying events. No second source of truth |
| A mission is a **pull request** (ADR-0001) | The remote view *is* the PR view: watch checks, read evidence, approve or reject |
| Every step is a **loop with a budget** | Pause / resume / cancel are scheduler operations, not new machinery |
| Content-addressed artifacts | A device fetches only the hashes it lacks; sync is diffing an immutable set |
| K2 permission boundary | A command from a phone passes **the same door** as a compiled plan |

**If a control-plane feature ever requires a kernel change the kernel would not
otherwise want, that is the signal it is being built too early.** That sentence
is the actual load-bearing part of this ADR.

**2. A device is not an authority.** A remote command is `operator` trust *at
best, and only after authentication*. It is an intent; permissions decide what
it may do. Being signed in is not permission to bypass anything — the phone and
the plan compiler face the same boundary.

**3. The log is the protocol.** Devices exchange **events, never state**. Two
clients that sync state will disagree and neither will know; two clients that
fold the same log cannot. Events must therefore be ordered and idempotent,
because a phone on a train reconnects and retries.

**4. Read is not write.** Monitoring, viewing evidence and reading a trace need
far less privilege than commanding. They split, and a newly-linked device
defaults to read-only.

**5. Nothing applies to the real world from a small screen that would not apply
from a big one.** Approval is a gate, not a button, and it is the same gate.

**6. Adaptive layouts, never separate logic.** Small screens get their own
*layouts*. A phone view is a thin view over the same kernel objects the desktop
reads — same events, same evidence, same refusal text. The moment a mobile
client holds logic the desktop does not, the two disagree about what a mission
is, and a mission has two definitions.

What legitimately differs by screen is *what is worth showing*: a phone shows
the one decision waiting on you, a desktop shows the graph. That is a
presentation decision and the only one allowed to fork.

## The thing to say out loud

**Remote commanding is remote code execution wearing a friendly UI.** The
friendliness is the risk. An authentication mistake here is not a leaked page;
it is a stranger running capabilities as the operator, inside the permission
set the operator holds.

That is why this ADR spends more words on boundaries than on screens.

## Status and scheduling

**Nothing here is built.** Per THE ENFORCEMENT RULE, this is a design, not a
mechanism, and no part of it is enforcing anything today.

It is deliberately **not** a work package. `docs/WORK_PACKAGES.md` caps the
registry at six rows because Atlas planned sixteen, and a design being written
down does not earn a row — a free slot does. It becomes a work package when
WP-005 (Mission Control) lands, which is itself blocked behind a mission that
runs and verifies with **no surface at all**.

## Alternatives rejected

**A separate mobile app with its own logic.** Faster to demo, and it gives a
mission two definitions the first time the two clients disagree about whether a
step passed. Layouts fork; logic does not.

**Syncing state between devices.** The obvious design, and the one that breaks
silently: two clients holding divergent state have no way to notice. Folding a
shared log makes divergence impossible rather than detectable.

**Treating a signed-in device as trusted.** It is the assumption that turns a
convenience feature into a remote shell. Authentication establishes *who is
asking*; K2 still decides *what may happen*.
