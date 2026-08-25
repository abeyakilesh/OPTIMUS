<!--
One repo per PR. If this PR absorbs a capability, fill in everything.
If it's ordinary product work, delete the absorption sections and keep the top.
-->

## What this changes

Closes #

## Type

- [ ] Kernel (K1 broker / K2 permission / K3 artifact graph / K4 scheduler / K5 verification)
- [ ] Capability absorption
- [ ] Surface / UI
- [ ] CI, tooling, docs

---

## Absorption (delete if not absorbing a repo)

**Repo:** · **Fate:** PORT / BUNDLE / HARVEST · **Pinned SHA:**

### Extraction summary

<!-- What was taken, what was left, and why. -->

### Fidelity evidence vs parent

<!-- Gate 11. Golden inputs → outputs matching the parent repo.
     Paste the actual comparison. "It looks right" is not evidence. -->

| Input | Parent output | OPTIMUS output | Match |
|---|---|---|---|
| | | | |

### Capability manifest diff

```diff
```

### Rollback note

<!-- How to undo this, including the parts that succeeded. -->

### Absorption score

**_ /100** — never round up, always with the breakdown:

| Component | Max | This PR | Why not full marks |
|---|---|---|---|
| Fidelity | 35 | | _x of N functions wired + golden-tested_ |
| Safety | 25 | | permission _/5 · sandbox _/5 · verify _/5 · log _/5 · rollback _/5 |
| Robustness | 15 | | |
| Integration | 15 | | |
| Proof coverage | 10 | | |

**Still missing:**

> AVAILABLE requires ≥90/100 with Fidelity ≥30/35 and Safety 25/25.
> Below that, the capability ships as **UNAVAILABLE** and must not be
> presented in the UI as though it works.

---

## Gauntlet

- [ ] All live gates green (1, 2, 3, 4, 5, 8, 11 — see `CI_STATUS.md`)
- [ ] No gate was disabled, skipped, or made non-blocking to get this merged
- [ ] Golden tests for anything new added to CI permanently
- [ ] Nothing in the UI claims a capability that isn't actually wired
- [ ] **Every change this description claims is actually in the diff** — checked against
      `git diff --name-only`, not from memory. A PR body that describes work living
      somewhere else is the same defect as a green check on a capability that does
      nothing (THE SELF-DESCRIPTION RULE in `CLAUDE.md`)

<!-- If you disabled a gate, say so here explicitly and why. Silently
     weakening the gauntlet is the failure mode this whole process exists
     to prevent. -->
