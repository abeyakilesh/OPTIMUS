# OPTIMUS — Product Requirements

**Status:** draft for review · **Owner:** Abey Akilesh · **Date:** 2026-08-16
**Supersedes:** nothing. **Companion docs:** `REQUIREMENTS.md`, `COST_MODEL.md`, `WORK_PACKAGES.md`, `../CLAUDE.md` (execution model), `../../OPTIMUS_SYSTEM_DESIGN.md`.

---

## 0. Why this document exists

Three previous attempts (Nexify, nexus, SDE-Atlas) had extensive planning and
little working software. Atlas alone had **16 work packages, 10 documents each**,
and shipped one. Its WP-001 was marked **done** with acceptance criteria like
*"health score ring displays 92/100"* while its own non-goals said *"real
repository analysis: future WP"*. It tested that a `<div>` rendered.

So this PRD has two rules:

1. **Every success metric is behavioural.** No criterion may be satisfied by
   something that renders. It must be satisfied by something that *works*.
2. **Scope is a wedge, not a platform.** The 17-page vision is the destination,
   not v0.1. Anything not needed to make one real thing work is a non-goal.

---

## 1. What OPTIMUS is

> **A local-first work environment where you state an objective, and it does the
> work and hands you the proof.**

Not a chatbot: it produces artifacts, not messages. Not an agent framework: it
is a product you open. Not a wrapper: it runs a real kernel with permissions,
sandboxing, verification, logging and rollback around every action.

**The one-sentence differentiator:** every other AI tool tells you it did the
work. OPTIMUS *shows you the receipt* — and refuses to call a step done until a
real check passes.

### The shape (decided, see `CLAUDE.md`)

A **mission is a pull request**. It is proposed, its steps run as checked jobs,
and nothing touches the real world until the checks are green. Users who have
opened a PR already understand the product.

---

## 2. Who it is for — v0.1

**Primary user: a technical solo builder or small team who already distrusts AI output.**

They have been burned by an agent that claimed success and produced garbage.
They will pay attention to a tool whose core promise is *"you can check it."*

| | |
|---|---|
| **Not for (v0.1)** | non-technical users, enterprises, teams needing SSO/RBAC/audit compliance |
| **Why** | those need trust infrastructure we haven't earned and can't staff |

---

## 3. The wedge — what it actually does on day one

**Research → verified dataset.** You give an objective in plain language. OPTIMUS
plans the steps, browses and extracts, and returns a dataset **plus the proof it
is correct**.

Chosen over code/design/automation for four reasons:

1. **The repos are strongest here.** browser-use, Scrapling, firecrawl and
   Agent-Reach are the most mature, most testable capabilities on the list.
2. **The output is mechanically verifiable.** Row counts, schema conformance,
   every claim traceable to a fetched source. Verification is not subjective —
   which is the whole thesis.
3. **The pain is real and frequent.** "Collect X about Y and put it in a table"
   is an hour of tedium a week for the target user.
4. **It is not a crowded fight.** Coding agents are saturated (Cursor, Claude
   Code, Copilot). Verified collection is not.

### The v0.1 mission, end to end

```
You:      "Find every YC W25 company doing devtools, with pricing and funding."
OPTIMUS:  plans 5 steps  →  you approve
          step 1  browse  · fetch YC directory        ✓ 214 rows
          step 2  filter  · devtools only             ✓ 38 rows
          step 3  browse  · fetch each pricing page   ✓ 38/38, 2 retries
          step 4  extract · normalise to one schema   ✓ schema valid
          step 5  verify  · every cell has a source   ✓ 100% cited
          →  artifact  a41c9e · companies.json  (+ run trace, + 38 screenshots)
          →  save as skill?  "yc-devtools-teardown"
```

**What makes this OPTIMUS and not a scraper:** step 3 retried twice inside its
budget and said so; step 5 is a gate, not a summary; the artifact is
content-addressed so it can never silently change; and the whole thing is now a
one-click skill.

---

## 4. Explicit non-goals for v0.1

Being wrong about these is how the last three died.

| Non-goal | Why | When |
|---|---|---|
| The other 16 pages | one working surface beats seventeen empty ones | after the wedge works |
| Multi-user, auth, teams, sharing | single-user local app needs none of it | v0.3+ |
| Cloud hosting / SaaS billing | runs on your machine, costs ₹0 | v0.4+ |
| Code / design / automation workspaces | each is its own wedge | v0.2+, one at a time |
| Absorbing all 62 repos | the pipeline matters, not the count | continuously, WIP ≤ 3 |
| Mobile | no | — |
| A model of our own | OmniRoute routes to free tiers | never |

---

## 5. Success metrics — behavioural only

A metric that can be satisfied by rendering something is not on this list.

| # | Metric | Target for v0.1 | How it is measured |
|---|---|---|---|
| M1 | A real mission completes end to end | 1 mission, unattended | CI e2e test runs the YC mission against fixtures and asserts the artifact hash |
| M2 | Verification actually blocks | 100% | fault-injection test: corrupt a step's output → mission must NOT be applied |
| M3 | Budgets actually bound | 100% | a deliberately unsatisfiable step must fail within its budget, not hang |
| M4 | Rollback actually reverts | 100% | apply a mission, roll back, assert the filesystem/DB matches the pre-state byte for byte |
| M5 | Evidence is complete | every step | every step in the trace has inputs, tool version, exit code, duration, artifact hash |
| M6 | Replay is deterministic | 100% | re-running a saved skill on the same fixtures yields the same artifact hash |
| M7 | Cost per mission is known before it runs | ±20% | estimated vs actual token cost recorded per mission |
| M8 | It survives a hostile page | no crash, honest failure | run against a site that blocks, 429s, and returns malformed HTML |

**M2, M3 and M4 are the product.** If those three fail, OPTIMUS is a scraper with
a nice UI and should not ship.

---

## 6. What "done" means for v0.1

- [ ] The YC mission above runs unattended and produces a verified artifact
- [ ] All 8 metrics above have a passing automated test in the Gauntlet
- [ ] A corrupted step provably prevents the mission from being applied
- [ ] The run costs ₹0 (free tiers via OmniRoute) and is measured, not assumed
- [ ] The whole thing runs on the MacBook Pro i9 with nothing cloud-hosted
- [ ] Absorption Score ≥ 90/100 for every capability the mission touches

Not on the list: how it looks. The landing page is already built and is not
part of v0.1's definition of done.

---

## 7. Risks, and what we do about them

| Risk | Likelihood | Consequence | Mitigation |
|---|---|---|---|
| **Free-tier models are too weak to plan reliably** | high | missions fail or need babysitting | plan with the best free model, execute with cheap ones; measure planning accuracy in M1; the design must let a paid key be dropped in without changing anything else |
| Scope creep back to 17 pages | **very high** — it killed three projects | nothing ships | non-goals above are binding; WIP ≤ 3; the absorption guard blocks multi-repo PRs |
| Sites block the browser | certain | steps fail | camoufox fallback is already on the repo list; M8 tests it |
| Verification becomes theatre | high | worst outcome — we'd be the thing we're replacing | every check must be able to fail; fault injection (M2) is a required test, not optional |
| Solo developer, no runway | certain | burnout | one wedge, ₹0 cost, no deadline pressure from external users |

---

## 8. Open questions for Abey

1. **Is "verified research" the right wedge**, or would you rather the first
   working thing be in code/automation? The kernel is identical either way —
   only the first absorbed capabilities change.
2. **Is a local-only v0.1 acceptable**, or does it need to be shareable (a URL
   someone else can open) to feel real to you?
3. **What is the honest deadline?** Not to pressure the build — to size the
   wedge. "Working in 2 weekends" and "working by December" are different products.
