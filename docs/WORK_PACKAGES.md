# OPTIMUS — Work packages

**Status:** draft for review · **Date:** 2026-08-16

## The rule this registry exists to enforce

SDE-Atlas planned **16 work packages × 10 documents each**. It shipped one, and
that one was marked ✅ Done with acceptance criteria like:

```
[x] Health score ring displays 92/100 with animation
[x] 7 engineering issues display in responsive grid
```

…while its own PRD listed *"Real repository analysis"* as a **non-goal**. Every
box was ticked. Nothing worked. The criteria tested that a `<div>` rendered.

So this registry has three hard rules:

1. **Max 6 work packages exist at a time.** No 16-row roadmap.
2. **WIP ≤ 3.** Merge green before starting the next.
3. **Every acceptance criterion must be falsifiable by a machine.** If a
   criterion can be satisfied by something that renders, it is rewritten or
   deleted. "Displays X" is banned. "Given A, when B, then C — asserted by test
   T" is the only accepted form.

---

## Registry

| WP | Title | Priority | Status | Gate coverage | Branch |
|---|---|---|---|---|---|
| WP-000 | Landing page + CI gauntlet | P0 | ✅ **Done** | 7/12 live | `main` |
| WP-001 | Kernel walking skeleton | P0 | 📋 Next | — | `feature/wp-001-skeleton` |
| WP-002 | Browser capability (absorb browser-use) | P0 | ⏸ Blocked by WP-001 | — | — |
| WP-003 | Extraction + schema verification (absorb Scrapling) | P0 | ⏸ Blocked by WP-001 | — | — |
| WP-004 | Model layer (bundle OmniRoute) | P0 | ⏸ Blocked by WP-001 | — | — |
| WP-005 | Mission Control surface | P1 | ⏸ Blocked by WP-002/3 | — | — |

Nothing beyond WP-005 is planned on purpose. The 17 pages, the other 58 repos
and every Tier-3 surface stay out of this table until the wedge works.

---

## WP-000 · Landing page + CI gauntlet — ✅ Done

**What shipped:** the public landing page, and the fail-closed pipeline
(7 of 12 gates live, 5 explicitly absent rather than stubbed green).

**Acceptance criteria — all machine-verified:**

- [x] `npm run build`, `lint`, `typecheck` all exit 0 — *asserted by gate 1 in CI*
- [x] 7 unit tests pass, and can fail — *one genuinely failed first (a banned word in shipped copy) and was fixed*
- [x] ast-grep blocks a real vulnerability — *planted a 512-bit RSA key → exit 1; clean tree → exit 0*
- [x] absorption-guard rejects an inflated score — *5 scenarios tested, incl. "claims 95/100 while parts sum to 45"*
- [x] `main` cannot be pushed to directly — *branch protection API returns `enforce_admins: true`*
- [x] No secret reaches the repo — *gitleaks over full history, 0 matches*

**Honest gaps:** gates 6, 7, 9, 10, 12 are absent. Recorded in `../CI_STATUS.md`.

---

## WP-001 · Kernel walking skeleton — 📋 Next

**Goal:** one trivial mission runs end to end through all five kernel parts. The
task is deliberately boring; the *pipe* is the deliverable.

**Mission under test:** *"Fetch `example.com` and extract the page title."*
One step, one tool, one check.

**Scope**

| In | Out |
|---|---|
| K1 broker with exactly 1 registered tool | more than one tool |
| K2 permission boundary (`net:read` only) | credential vault, multi-tenant |
| K3 artifact store, sha256-addressed, on disk | Postgres, CDN, dedup GC |
| K4 scheduler: 1 step, sandboxed, with a budget | parallelism, resumption, merge queue |
| K5 verification: 1 real check | check library, harbor |
| Event log + fold-to-state | UI beyond a CLI |

**Acceptance criteria — every one is a test that can fail**

- [ ] **AC-1** Given the objective, when the mission runs, then an artifact exists whose sha256 matches the fixture's expected hash. *(test: `skeleton.e2e`)*
- [ ] **AC-2** Given the tool declares `net:read`, when it attempts a filesystem write, then the write is refused and the step fails. *(test: `permission-boundary`)* — **satisfies FR-3**
- [ ] **AC-3** Given the extracted title is corrupted before verification, when the check runs, then the step is marked failed and **the mission is not applied**. *(test: `fault-injection`)* — **satisfies FR-6, FR-7, PRD M2**
- [ ] **AC-4** Given a step whose check can never pass, when it runs, then it terminates within `max_attempts` and `max_wall_time` and reports budget-exhausted. *(test: `budget-exhaustion`)* — **satisfies PRD M3**
- [ ] **AC-5** Given a completed mission, when it is rolled back, then the on-disk state is byte-identical to the pre-state. *(test: `rollback`)* — **satisfies FR-9, PRD M4**
- [ ] **AC-6** Given the mission's event log alone, when state is rebuilt from events, then it equals the live state. *(test: `event-fold`)* — **satisfies NFR-24**
- [ ] **AC-7** Given the same fixture, when the mission is re-run, then the artifact hash is identical. *(test: `determinism`)* — **satisfies PRD M6**
- [ ] **AC-8** Every step in the trace has inputs, tool version, exit code, duration, cost and artifact ids. *(test: `evidence-schema`)* — **satisfies FR-8, PRD M5**

**Definition of done:** all 8 tests in CI, and **AC-3 demonstrated by video or
terminal capture** — because "verification actually blocks" is the single claim
the whole product rests on, and it should be visible, not just asserted.

**Explicit non-goal:** it does not need a UI. A CLI that prints the trace is
enough. Building Mission Control before the kernel works is the Atlas mistake.

---

## WP-002 · Browser capability

Absorbs **browser-use** through all 16 gates. Blocked until WP-001, because
there is no broker to register into.

Key criteria: fidelity vs the parent repo on golden inputs (gate 6, currently
absent — **this WP is what makes gate 6 real**), and honest failure on a
hostile page (PRD M8).

## WP-003 · Extraction + schema verification

Absorbs **Scrapling** (PORT). Makes FR-22 and FR-23 real: schema-conforming
rows, every cell traceable to a source artifact.

## WP-004 · Model layer

Bundles **OmniRoute** as a local child process. Makes NFR-20/21/22 measurable
— cost per mission recorded, ceiling enforced, estimate shown before approval.
Already partly proven: it fronts gate 4 in CI today.

## WP-005 · Mission Control

The first real surface. Only starts once a mission demonstrably runs and
verifies without it.

---

## Per-WP documents

Atlas used ten documents per WP. That ratio is what buried it. OPTIMUS uses
**three**, and only the first is required to start:

| Doc | Required? | Purpose |
|---|---|---|
| The WP section in this file | ✅ always | scope, criteria, links to FR/NFR |
| `Fidelity.md` | only for absorption WPs | golden inputs vs parent outputs |
| `Retrospective.md` | only after merge | what the score actually was, what rotted |

PRD, Architecture, Research, Tasks, Testing, Demo, Review, ReleaseNotes are
**not** created per WP. They exist once, at `docs/`, and are amended.
