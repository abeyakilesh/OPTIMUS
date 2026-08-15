---
name: Absorb a repository
about: One repo = one issue = one branch = one PR. Never two repos in one PR.
title: "absorb: <repo-name>"
labels: ["absorption"]
---

## Repo

- **Name:**
- **Path on disk:**
- **Upstream:**
- **Pinned commit SHA:**

## Fate

<!-- PORT (copy byte-for-byte) · BUNDLE (local child process) · HARVEST (data only) · CUT -->

- **Fate:**
- **Reason:**
- **Owner:**
- **Target page/surface:**

## Capability surface

<!-- Gate 2. The REAL functions with params, return types and error modes.
     Found by reading entry points, never the README. List every one — the
     Fidelity score is the fraction of these actually wired and tested. -->

| # | Function | Params | Returns | Error modes |
|---|---|---|---|---|
| 1 | | | | |

**Total callable surface:** _N_ functions

## License

- **License:**
- **Copyleft / source-available concern?** yes / no
- **Bundling implication resolved?** <!-- AGPL, BSL, SSPL, Elastic and n8n's Sustainable Use all constrain a commercial standalone build -->

---

## The 16 gates

**Phase A — assess**
- [ ] 1 · Source recon — real entry points and executable paths identified
- [ ] 2 · Capability surface enumerated above
- [ ] 3 · License & legal gate cleared
- [ ] 4 · Supply-chain scan (deps, secrets, CVEs) clean
- [ ] 5 · Fate decided, recorded with reason + owner

**Phase B — integrate**
- [ ] 6 · Provenance pinned (SHA + checksum, reproducible)
- [ ] 7 · Brought in by its fate
- [ ] 8 · Capability contract written (inputs, outputs, errors, permissions, cost class, isolation level)
- [ ] 9 · Broker adapter registered through the one manifest schema
- [ ] 10 · Permission + isolation boundary defined, blast radius documented

**Phase C — prove**
- [ ] 11 · Fidelity test vs parent — golden inputs produce matching outputs
- [ ] 12 · Five guarantees wired AND tested: permission · sandbox · verify · log · rollback
- [ ] 13 · Performance baseline captured, regression alarms set
- [ ] 14 · Failure & recovery tested: timeout, crash, retry, kill-switch
- [ ] 15 · Golden regression suite added to CI permanently

**Phase D — ship**
- [ ] 16 · Manifest + docs + upstream-sync plan published

## Absorption score

**Current: 0/100** — nothing done yet. This is a valid, honest score.

| Component | Max | Now | Evidence |
|---|---|---|---|
| Fidelity | 35 | 0 | _x of N functions working, verified by gate 11_ |
| Safety | 25 | 0 | permission 0/5 · sandbox 0/5 · verify 0/5 · log 0/5 · rollback 0/5 |
| Robustness | 15 | 0 | gates 13 + 14 |
| Integration | 15 | 0 | gates 8 + 9 |
| Proof coverage | 10 | 0 | gate 15 |

**AVAILABLE requires ≥90/100, with Fidelity ≥30/35 and Safety exactly 25/25.**
Safety is never partial credit. Never round up. A score may go down — if it
does, downgrade immediately and say why.
