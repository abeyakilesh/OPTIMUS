# OPTIMUS — Requirements

**Status:** draft for review · **Date:** 2026-08-16 · **Companion:** `PRD.md`

Every requirement here is **testable**. If you cannot write a test that fails
when it is violated, it is not a requirement — it is a wish, and it belongs in
the PRD's prose instead.

Format: `FR-n` functional, `NFR-n` non-functional. Each carries its **verification
method** and the **gate** that enforces it, so nothing here can quietly rot.

Non-functional categories follow the system-design-primer checklist on disk
(performance vs scalability, latency vs throughput, availability vs consistency,
caching, asynchronism, security).

---

## A. Functional — the kernel

| # | Requirement | Verified by | Gate |
|---|---|---|---|
| **FR-1** | Every capability is described by a **manifest entry**: inputs, outputs, error modes, required permissions, cost class, isolation level, and budget defaults. A capability without a complete manifest cannot be registered. | Contract test rejects an incomplete manifest | 2 |
| **FR-2** | The broker resolves a capability **by name and version only**. No caller may reach an engine directly. | Static rule: no import of an engine outside its adapter | 3 |
| **FR-3** | A step declares the permissions it needs. It receives **exactly those and nothing else** — no ambient credentials, no shared token, no inherited network. | Isolation test: step requesting `net:read` cannot write the filesystem | 10 |
| **FR-4** | Every step output is written to the artifact store **content-addressed by sha256**, and **every read re-derives the address before returning bytes**. An artifact is immutable; a changed output is a new artifact; content that no longer matches its address is not returned at all. | Hash test: re-writing identical bytes yields the same id; changed bytes yield a different one. **Tamper test: bytes altered underneath the store make `get()` throw** (`tests/kernel/artifact-integrity.test.ts`) | 2, #60 |
| **FR-5** | The scheduler executes the mission graph: parallel where independent, ordered where dependent, and **resumable after a crash** without re-running completed steps. | Kill the process mid-mission, restart, assert completed steps are not re-executed | 14 |
| **FR-6** | **A step is done only when its check passes.** Model output is never a completion signal. | Fault injection: corrupt a step's output, assert the step is marked failed | 2 + 11 |
| **FR-7** | A mission's effects are **not applied to the real world** until every required check is green. | Test: a mission with one red check leaves the target state untouched | 11 |
| **FR-8** | Every step emits an evidence record: inputs, resolved tool + version, exit code, duration, cost, artifact ids, and retry history. | Schema test over the trace of a completed mission | 2 |
| **FR-9** | Any applied mission can be **rolled back**, including its successful steps. | Apply → rollback → assert byte-identical pre-state | 14 |
| **FR-10** | A verified mission can be saved as a **skill**, versioned, and replayed. Replay re-runs verification; it does not trust the previous result. | Replay a skill against fixtures, assert identical artifact hash and that checks re-ran | 15 |
| **FR-11** | Skills may nest (a step may be a skill) to a **maximum depth of 4**. Exceeding it is a manifest error, not a runtime hang. | Test: depth-5 skill is rejected at registration | 2 |
| **FR-12** | The system reports **which capabilities are UNAVAILABLE** and never renders an unavailable capability as usable. | UI test: a capability below 90/100 renders disabled with its reason | 2 |

## B. Functional — the v0.1 mission

| # | Requirement | Verified by | Gate |
|---|---|---|---|
| **FR-20** | A plain-language objective produces an **explicit, editable plan** shown before anything runs. | e2e: objective in → plan rendered → no side effects until approval | 11 |
| **FR-21** | The browser capability fetches a page and returns content **plus the URL, fetch time, and status**. | Fidelity test vs the parent repo's own output | 6 |
| **FR-22** | Extraction produces rows conforming to a **declared schema**; non-conforming rows fail the step. | Feed malformed input, assert failure not silent coercion | 11 |
| **FR-23** | **Every extracted cell is traceable** to the source artifact it came from. | Trace test: pick any cell, resolve it to a fetched page artifact | 11 |
| **FR-24** | A blocked/429/malformed site produces an **honest failure with evidence**, never a crash and never fabricated rows. | Hostile-fixture test (PRD M8) | 14 |

---

## C. Non-functional

### C1. Performance

| # | Requirement | Target | Verified by |
|---|---|---|---|
| **NFR-1** | Interactive UI actions (open mission, view artifact, expand step) | **p95 < 200 ms** local | Perf test on the local adapter |
| **NFR-2** | Plan generation for a 5-step objective | **p95 < 15 s** | Timed test against free-tier models |
| **NFR-3** | Landing/app first contentful paint | **< 2 s**, LCP < 2.5 s, CLS < 0.1, TBT < 300 ms | Lighthouse CI (gate 8, already live) |
| **NFR-4** | Artifact read by hash | **p95 < 50 ms** for < 10 MB | Bench in the artifact-store test |
| **NFR-5** | Evidence write must not block the step | async, never on the critical path | Assert step duration is unchanged with tracing on/off |

> Latency budget rationale (primer's "latency numbers"): memory ~100 ns, SSD
> random read ~150 µs, same-datacentre round trip ~500 µs, but an **LLM call is
> 1–30 s**. Therefore model calls dominate every mission; optimise call *count*
> and caching, never local I/O.

### C2. Scalability

| # | Requirement | Target | Verified by |
|---|---|---|---|
| **NFR-6** | Concurrent steps on the dev machine (i9, 16 GB) | **≥ 4** without swap | Load test, memory watermark |
| **NFR-7** | Mission history | **100k missions** without UI degradation | Keyset pagination test at 100k rows |
| **NFR-8** | Pagination is **cursor/keyset everywhere**. `OFFSET` is forbidden. | Static rule + query test at depth 100k | 3 |
| **NFR-9** | Swapping LOCAL → SCALE adapters (SQLite→Postgres, 1 browser→pool) requires **no change to kernel code** | Run the same kernel test-suite against both adapters | 2 |

### C3. Availability & consistency

| # | Requirement | Choice | Verified by |
|---|---|---|---|
| **NFR-10** | Mission state is **strongly consistent**; you must never see a step as green that later turns red. | single writer, append-only event log | Concurrency test |
| **NFR-11** | Artifacts are immutable ⇒ **eventual consistency is safe** for artifact reads/CDN. | content-addressed, **checked on read** — immutability that is never re-checked is an assumption, and it is the assumption a cache is built on | Hash + tamper test |
| **NFR-12** | A crash mid-mission loses **no completed step**. | fold-from-events + checkpoints | Kill-restart test (FR-5) |
| **NFR-13** | The app is **fully usable offline** except model calls and page fetches. | Run the suite with network disabled | CI job with egress blocked |

### C4. Security

| # | Requirement | Verified by | Gate |
|---|---|---|---|
| **NFR-14** | Secrets are never written to logs, evidence, artifacts, or the UI. | Redaction test with a canary token planted in every field | 3 |
| **NFR-15** | No secret ever reaches the repo. | gitleaks over full history | 3 (live) |
| **NFR-16** | No AGPL/GPL/SSPL/BUSL/Elastic dependency enters the tree. | license-checker | 5 (live) |
| **NFR-17** | Every step runs with a **network allow-list**, default deny. | Isolation test: undeclared egress is refused | 10 |
| **NFR-18** | A capability cannot read another mission's artifacts. | Cross-tenant read test | 10 |
| **NFR-19** | Untrusted page content is never executed or interpolated into a shell/SQL. | ast-grep rules + injection fixtures | 3 (live) |

### C5. Cost — the binding constraint

| # | Requirement | Target | Verified by |
|---|---|---|---|
| **NFR-20** | Marginal cost of a v0.1 mission | **₹0** — free tiers via OmniRoute | Cost recorded per mission; test asserts ₹0 provider spend |
| **NFR-21** | Every mission has a **cost ceiling**; exceeding it fails the mission. | Budget test with a deliberately expensive plan | 14 |
| **NFR-22** | Estimated cost is shown **before** the user approves the plan, within ±20%. | Estimate vs actual regression test | 13 |
| **NFR-23** | Token spend is reduced by caching identical tool calls on artifact hash. | Cache-hit test: identical step re-run makes zero model calls | 13 |

### C6. Observability

| # | Requirement | Verified by |
|---|---|---|
| **NFR-24** | Every mission is fully reconstructible from its event log alone. | Rebuild state from events, assert equality with live state |
| **NFR-25** | Every failure surfaces **what failed, why, and what to do** — never a stack trace as the user-facing message. | Error-copy test over the failure catalogue |
| **NFR-26** | Perf and cost regressions fail CI, not a dashboard nobody reads. | Gate 8 + 13 thresholds |

### C7. Accessibility & UX

| # | Requirement | Verified by |
|---|---|---|
| **NFR-27** | Lighthouse accessibility **≥ 95**. | Gate 8 (live) |
| **NFR-28** | All motion respects `prefers-reduced-motion`; nothing is load-bearing. | Already enforced in `globals.css`; e2e assertion |
| **NFR-29** | No horizontal scroll at 375 / 768 / 1440 px. | e2e test (already written and passing) |

---

## D. Constraints (not negotiable)

> **C-4 does not shrink the roadmap.** It changes *how* a repo is used, never
> *whether*. Of the 62 kept repos, most are **PORT** (their logic is copied into
> OPTIMUS — zero runtime cost) or **HARVEST** (only their data/rules come across
> — zero runtime cost). Only SERVICE-fate repos need to actually run, and only a
> handful of those are heavy. Nothing is lost; the heavy ones are simply queued
> behind hosting we don't need yet.

| # | Constraint | Source |
|---|---|---|
| **C-1** | Runs on a MacBook Pro 16" i9, 16 GB RAM, ~500 GB free | user hardware |
| **C-2** | Total spend: existing $20/mo Claude subscription + ≤ ₹2000 discretionary | user budget |
| **C-3** | Single deployable repo; engines are local child processes, not external APIs | `CLAUDE.md` |
| **C-4** | Heavy repos are **deferred, not dropped**. A repo needing a big runtime (Dify **55** docker services, firecrawl **15**, maxun **7**) is not run on the laptop — it becomes SERVICE fate and waits for stage-3 hosting. Its capability is still on the roadmap. | measured docker-compose service counts |
| **C-5** | One developer | reality |

---

## E. Traceability

Each requirement maps to a CI gate. Requirements whose gate is **not yet live**
(6, 7, 9, 10, 12–15) cannot be claimed as met — see `../CI_STATUS.md`. A
requirement with no live gate is **UNVERIFIED**, and must be written as such in
any status report.

| Gate | Status | Requirements it enforces |
|---|---|---|
| 1 build/typecheck/lint | ✅ live | — |
| 2 unit + contract | ✅ live | FR-1, 4, 8, 11, 12; NFR-9 |
| 3 static security | ✅ live | FR-2; NFR-8, 14, 15, 19 |
| 5 licenses/SBOM | ✅ live | NFR-16 |
| 8 performance | ✅ live | NFR-3, 26 |
| 11 e2e | ✅ live | FR-6, 7, 20, 22, 23; NFR-29 |
| 6 fidelity | ❌ absent | FR-21 |
| 10 isolation | ❌ absent | FR-3; NFR-17, 18 |
| 13 perf baseline | ❌ absent | NFR-22, 23 |
| 14 failure/recovery | ❌ absent | FR-5, 9, 24; NFR-21 |
| 15 golden regression | ❌ absent | FR-10 |
