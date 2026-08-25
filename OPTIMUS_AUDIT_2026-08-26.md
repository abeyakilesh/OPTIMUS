# OPTIMUS capability audit — 2026-08-26

Read-only assessment at `ccf2f87` (`ci: require the defect-registry gate (#59)`).
No file was modified to produce this. Every claim cites a path and, where useful, a line.

Two commands were executed to verify behaviour rather than infer it: `npx tsx kernel/cli.ts`
and `npx tsx kernel/cli.ts fail`. Both use `MemoryArtifactStore` (`kernel/cli.ts:48`) and
write nothing to disk.

**Headline: 435 / 1000.**

---

## PART 1 — what actually runs

### 1. Kernel — does it execute a mission end to end? **WORKING**

Verified by running it, not by reading it.

```
✔ fetch (collector) · passed
    ✔ artifact.exists — artifact sha256:78b2e56c… readable, 114 bytes
✔ extract (analyst) · passed
    ✔ title.nonEmpty — title is 14 chars
MISSION GREEN — every check passed, the result may be applied.
7 events recorded · state is a fold of the log        exit 0
```

`kernel/` is 3,315 lines across 16 files. `broker.ts` · `harness.ts` · `scheduler.ts` ·
`artifacts.ts` · `events.ts` · `permissions.ts` · `sandbox.ts` · `rollback.ts` ·
`inputContract.ts` · `missionStore.ts` · `registry.ts` are all real implementations, not
scaffolding.

The step loop in `kernel/harness.ts` is the real `attempt → observe → verify → repair`
arc with attempt, wall-time and cost budgets. Rollback is wired into the failure path
(`kernel/harness.ts:82-88`), not an orphan module.

**The qualification that matters:** it executes *a plan that was handed to it*. Nothing
in the repo writes a plan. See §5 and PART 5.

### 2. Gate system — how many gates, implemented vs named-only?

Two distinct systems share the word "gate". Both are reported because conflating them
overstates coverage.

**A · CI gates — 12 named, 8 implemented, 1 partial, 3 absent.**

| Gate | State | Evidence |
|---|---|---|
| 1 build/typecheck/lint | ✅ | `.github/workflows/_build.yml` |
| 2 unit + contract | ✅ | 337 passed, 3 skipped, 27 files |
| 3 static security | ✅ | gitleaks · npm audit · ast-grep · CodeQL |
| 4 AI security review | ✅ | `_ai-review.yml`, runs over a bundled OmniRoute |
| 5 licenses + SBOM | ✅ | `scripts/license-gate.mjs` |
| 6 fidelity vs parent | ⚠️ **PARTIAL** | see §3 |
| 7 verification self-eval | ❌ **ABSENT** | `CI_STATUS.md:97` — "harbor not integrated" |
| 8 performance budgets | ✅ | Lighthouse CI |
| 9 scalability smoke | ❌ **ABSENT** | nothing to load-test |
| 10 isolation invariants | ✅ | `kernel/sandbox.ts`, implemented 2026-08-24 |
| 11 e2e | ✅ | 26 Playwright tests, 4 spec files |
| 12 dynamic security | ❌ **ABSENT** | no deployed preview |

**These are enforced, not merely present.** 13 required contexts on `main`, verified by a
deliberately-red PR being refused (`GH006 … protected branch hook declined`).

**B · The 16-gate capability-onboarding pipeline — per capability, not global.**
Gates 8, 9, 10, 12, 14, 15 pass for the three absorbed capabilities. Gate 11 covers
**1 of 3**. Gate 13 (performance baseline) exists for **none** — it is the reason no
capability's Robustness score is full.

### 3. Gate 6 / sha256 artifact verification — **PARTIAL, and the sha256 half is a STUB**

Two separate things are being asked about. They land differently.

**Fidelity vs parent — PARTIAL and honestly labelled.** `scripts/fidelity-check.mjs` is a
real required job. It pins each golden by sha256, pins the *generator* by sha256, and where
CI has the parent it **re-runs it and diffs**. Its own output, on every run:

```
goldens integrity-checked           2/2
goldens re-derived from the real parent   1/2
capabilities with a golden AT ALL         1/3
no golden at all: llm.chat, browser.navigate
```

**sha256 artifact verification — this is a stub, and it is not labelled as one.**

`kernel/artifacts.ts` computes a content address on **write** (`addressOf(data)`,
line 21). On **read** it does not re-hash:

```ts
async get(id: ArtifactId): Promise<string> {
  const path = this.pathFor(id);
  if (!existsSync(path)) throw new Error(`No such artifact: ${id}`);
  return readFile(path, "utf8");        // ← never verified against the id
}
```

The check that consumes it, `artifact.exists` (`kernel/builtin.ts:101-129`), reports
`artifact <id> readable, N bytes`. **A tampered artifact passes.** There is no
tamper-detection test anywhere in `tests/`.

The check's *name* is honest — it says `exists`, not `verified`. The store's description
as "content-addressed" is what oversells it. Content addressing here provides naming and
deduplication; it does not currently provide integrity.

### 4. MISSION GREEN / MISSION RED — **WORKING**

Real and observable, with real process exit codes.

```
MISSION RED — a check failed. Nothing is applied.        exit 1
  ✘ extract (analyst) · failed
      ✘ title.nonEmpty — expected a non-empty title, got ""
      ✘ artifact.exists — step returned no artifactId (got undefined)
```

`fetch` succeeded and produced a real artifact; the mission is still red and nothing is
applied. Failure is not cosmetic.

### 5. Capability broker — **WORKING**. Agent registration — **ABSENT**

The broker is real and singular. `kernel/registry.ts` holds one `ALL_CAPABILITIES`, and
`tests/kernel/registry.test.ts` enforces two invariants by import-and-inspect: every
`Capability` exported under `kernel/capabilities/` must appear in it, and **no file outside
the registry may construct a `Broker`**. Manifests carry permissions, isolation, budget and
`inputConstraints`.

**Agent registration does not exist.** There is no `Agent` class, interface, or module
anywhere in `kernel/`, `lib/` or `app/`. What exists is one optional string on a step:

```ts
/** Which agent owns this step. Used for reporting and concurrency limits. */
agent?: string;                                    // kernel/types.ts:181
```

See §8.

### 6. Scheduler / DAG — **PARTIAL**, and the gap is fundamental

Present and real: `dependsOn` resolution, cycle detection with the offending path
(`kernel/scheduler.ts:84`), `maxParallel`, resource locks, `continueOnError` with a
distinct `step.continued` event, transitive `blocked` propagation, memoisation on input
hash, an `onEvent` hook.

**Missing: steps cannot pass data to their dependents.**

```
$ grep -n "output" kernel/scheduler.ts
(no matches)
```

`execute()` takes `outcome.status` and `outcome.evidence` and discards `outcome.output`.
Every step's input is fixed when the plan is written. A dependent cannot consume an
artifact id that did not exist at plan time.

The demo makes this visible. `extract` declares `dependsOn: ["fetch"]` but reads a
hard-coded fixture:

```ts
input: { artifactId: addressOf(FIXTURE_HTML) },   // kernel/cli.ts:73
dependsOn: ["fetch"],                             // kernel/cli.ts:74
```

The ordering is real. The data flow is not. This is the single largest gap in the repo.

### 7. Artifact store — **WORKING for addressing, STUB for verification**

Real sha256 content addressing, memory and disk adapters, a path-traversal guard that
rejects anything not matching `/^sha256:([0-9a-f]{64})$/` before it reaches the
filesystem, and `removeAllExcept` for rollback. Integrity on read is absent — see §3.

### 8. Agent roster — **ABSENT. Zero agents exist.**

Eight names appear in the codebase — `analyst`, `chat`, `coder`, `collector`, `fixer`,
`integrator`, `planner`, `researcher`, `reviewer` — and **all of them are string literals
in demos and tests**. No file defines behaviour for any of them. There is no roster, no
registry, no dispatch, no per-agent prompt, tool set, or policy.

`agent` is a grouping label for reporting and concurrency limits, exactly as its docstring
says. The docstring is accurate; the word "agent" is what misleads.

### 9. Skill library — **ABSENT. Zero.**

```
SKILL.md in the OPTIMUS repo:              0
SKILL.md in the workspace (unabsorbed):    4,165
```

There is no `Skill` type in `kernel/`, no save path, no replay path, no versioning, no
re-verification. The flywheel described as step 6 of the build order does not exist in any
form. The 4,165 workspace files are catalogued, not absorbed — none is reachable from the
kernel.

### 10. External tool adapters

| Capability | State | Notes |
|---|---|---|
| `web.fetch` | ✅ WORKING | `kernel/builtin.ts`, real HTTP, permission-gated |
| `html.extractTitle` | ✅ WORKING | `kernel/builtin.ts` |
| `scrapling.relocate` | ⚠️ PARTIAL | real port, golden-tested vs Scrapling 0.4.9. **1 of ~10** parent tools. Fidelity 8/35 |
| `llm.chat` | ⚠️ PARTIAL | real OmniRoute call. **1 endpoint**. Needs a running gateway |
| `browser.navigate` | ⚠️ PARTIAL | real Chrome over CDP. **1 of 11** MCP tools. Needs Python + Chrome, absent in CI |
| **search** | ❌ ABSENT | no capability, no adapter |
| **RAG / vector store** | ❌ ABSENT | no embeddings, no index, no retrieval |
| **code execution** | ❌ ABSENT | `spawnProcess` exists as a primitive; no sandboxed exec capability |
| **data storage (DB)** | ❌ ABSENT | artifacts + JSON event logs only; no Postgres, no pgvector |

Five registered capabilities, six checks, one repair (`kernel/registry.ts`).

### 11. UI layer — **WORKING**

19 components, 2,646 lines. Landing page; a real auth gate (`proxy.ts`, HMAC-SHA256 signed
session, constant-time compare); `/chat` backed by real missions with a sidebar that lists
and reopens persisted runs; `/settings/providers` where every number comes from a live API
call. 26 e2e tests across 4 spec files.

This is a real interface, not a mockup — with the caveat that what it can *do* is send one
`llm.chat` step.

### 12. Persistence / memory — **WORKING for missions, ABSENT for memory**

Verified on disk: `.optimus-data/` holds 4 persisted missions and 4 artifacts. A mission is
stored as its **event log**, and state is rebuilt by folding it:

```
mission.proposed · hi → mission.started → step.started · chat
→ step.finished · passed → mission.finished · green
```

State survives process restart, and a past mission is reopenable with its real reply text.

**No memory layer exists.** No cross-mission recall, no embeddings, no wiki, no supabase.
Persistence ≠ memory, and only the first is built.

---

## PART 2 — dependency reality check

### 13. Absorbed vs planned

`OPTIMUS_REPO_INVENTORY.md` is **not in this repo** — it lives in the workspace parent,
which is a different git repository. Cross-checking its named repos against what is
present here:

**Absorbed (code present and imported):** 3 — Scrapling (PORT, 10 kernel files),
browser-use (SERVICE, 7 files), OmniRoute (SERVICE, 4 files).

**Everything else named in the inventory is planned only.** Zero code present for harbor,
supabase, firecrawl, n8n, gitnexus, anydoc, Stirling-PDF, langflow, dify, and the rest.

### 14. The four named specifically

| Repo | Status |
|---|---|
| **harbor** | **ABSENT.** Zero files, zero references in `kernel/`. Gate 7 (verification self-eval) is blocked on it — `CI_STATUS.md:97` |
| **xmcp** | **ABSENT.** One mention, in a Python comment: `bridge.py:12` says the protocol is "deliberately not full MCP — xmcp … not yet absorbed" |
| **Scrapling** | **PARTIAL — genuinely absorbed.** `kernel/scrapling.ts` + `kernel/sequence-matcher.ts` are real ports, golden-tested against real Scrapling 0.4.9. One of ~10 tools |
| **codesandbox-sdk** | **ABSENT.** One mention, in a comment at `navigate.ts:122` naming it as the blocker for child-process isolation |

### 15. What the kernel imports that does not exist

**Nothing.** `tsc --noEmit` is clean and every one of the 21 distinct relative imports
resolves. The kernel's only third-party dependencies are `domhandler` and `htmlparser2`
(for the Scrapling port); everything else is a `node:` builtin.

This is worth stating plainly: there are **no dangling imports, no TODO-shaped stubs, no
`throw new Error("not implemented")`** in the kernel. What exists, compiles and runs. The
problem is not broken code — it is absent code.

---

## PART 3 — score

| Category | Max | Score | Evidence |
|---|---|---|---|
| Kernel & orchestration core | 150 | **95** | Runs end to end, verified both ways. Budgets, rollback, isolation, input contracts all real and mutation-tested. Loses 55 because *orchestration* means executing a hand-written plan — no planner, and no data flow between steps |
| Gate system & verification integrity | 150 | **85** | 8 of 12 CI gates live, 13 required contexts proven to refuse a red PR. Loses 65 for gates 7/9/12 absent, gate 11 covering 1 of 3 capabilities, gate 13 covering none, and artifact integrity unverified on read |
| Capability broker & agent registration | 100 | **55** | Broker is real, singular and enforced by import-and-inspect tests. Agent registration **does not exist** — half the category is a string field |
| Scheduler & DAG execution | 100 | **50** | Real ordering, cycles, parallelism, locks, propagation, memoisation. **No output→input flow**, so no mission needing a result from a prior step can be expressed |
| Artifact store & content addressing | 100 | **65** | Real sha256 addressing, traversal guard, memory+disk, rollback support. No verification on read; a tampered artifact passes its check |
| Agent roster | 100 | **0** | Zero agents. Eight string labels in demos |
| Skill library | 100 | **0** | Zero SKILL.md, no `Skill` type, no save, no replay |
| External capability (scrape/search/RAG/exec) | 100 | **25** | 3 real external capabilities, each a single tool of a much larger parent surface. Search, RAG and code execution entirely absent |
| Persistence & memory | 50 | **25** | Mission + artifact persistence real and verified on disk. Memory layer absent entirely |
| UI / interface layer | 50 | **35** | Real auth, real chat over real missions, real provider panel, 26 e2e tests. Capped because it drives one fixed step |
| **TOTAL** | **1000** | **435** | |

---

## PART 4 — the three blockers

### 1. Step-to-step data flow in the scheduler

**What:** `Scheduler.execute()` discards `outcome.output`. Dependents cannot reference an
upstream step's artifact — inputs are frozen at plan time.

**Why it blocks:** every multi-step mission. Fetch→extract, search→read→summarise,
navigate→scrape→store are all inexpressible today. It also blocks the planner, because a
planner's whole job is writing steps that consume each other's results. The demo's
`dependsOn` already *looks* like this works, which is why it has gone unnoticed.

**Effort:** small — 1–2 days. A step-output map in the scheduler plus a reference syntax in
`StepSpec.input` (`{"$from": "fetch.artifactId"}`), resolved before `runStep`. The input
contract must validate *after* resolution, and repairs already rewrite input between
attempts, so the plumbing exists.

**After:** real DAGs. Every subsequent capability becomes composable instead of standalone.

### 2. A planner

**What:** nothing converts an objective into a `MissionSpec`. `app/api/missions/route.ts`
hard-codes a one-step plan naming `llm.chat`.

**Why it blocks:** this is the difference between a chat box and OPTIMUS. Five capabilities
are registered and callable; four are unreachable from the product because no code chooses
them. It also blocks the agent roster and the skill library, which are both meaningless
without a plan to specialise or replay.

**Effort:** medium — 3–5 days for a first honest version. The model contract gate already
guarantees a backend that returns strict JSON and refuses to fabricate, which is precisely
what a planner needs. Depends on blocker 1.

**After:** the registered capability set becomes the *usable* set. Agents become real
(a planner assigning steps to specialised executors). Verified missions become saveable —
the flywheel starts.

### 3. Artifact integrity on read

**What:** `DiskArtifactStore.get()` returns bytes without re-hashing them against the id
it was asked for.

**Why it blocks:** it undermines every downstream proof. Evidence chains, replay,
memoisation on input hash, and rollback all assume an artifact is what its address says it
is. Reproducibility — "every run is reproducible from the artifact graph" — is not
currently true, and this is cheap to make true.

**Effort:** trivial — under an hour. Re-hash in `get()`, throw on mismatch, add a tamper
test. It is listed third only because 1 and 2 unlock more; by cost-to-value it should be
done first.

**After:** the artifact graph becomes trustworthy evidence rather than trusted storage.

---

## PART 5 — honest verdict

### Can OPTIMUS complete any non-trivial task end to end without a human writing code mid-run?

**No.**

It completes exactly two things unassisted: a single `llm.chat` turn through the real
kernel, persisted and reopenable; and the two-step demo mission, whose plan is written in
`kernel/cli.ts` by hand and whose second step reads a fixture rather than the first step's
output.

Anything else requires a human to author a `MissionSpec` in TypeScript — and even then it
cannot express "use the result of step 1 in step 2."

### The single largest gap between stated architecture and running code

**The plan.** The architecture is "a mission is a DAG of budgeted loops, each verified,
composed by a planner from a registered capability set."

Built: the loop, the budget, the verification, the registry, the evidence, the persistence.
All real, all tested.

Absent: **the DAG has no data flow, and nothing writes the plan.** The graph machinery
exists and has never carried a graph that needed it. Five capabilities are registered and
four are unreachable in the product.

The kernel is not the weak part. The kernel is the strongest part, and it is idling.

### Anything that LOOKS implemented but is a facade?

Three, in descending order of how misleading they are.

**1 · "Multi-agent orchestration" — the most misleading thing in the repo.**
PR #13 shipped under the title *"kernel walking skeleton + multi-agent orchestration"*, and
mission output prints `✔ fetch (collector)`, `✔ extract (analyst)`. A reader concludes
agents exist. **They do not.** `agent` is `agent?: string` — a label for reporting and
concurrency grouping. There is no `Agent` anywhere in the codebase. The docstring is
accurate; the surrounding vocabulary is not. Anyone reading the demo output would
reasonably believe two agents collaborated on that mission. Nothing did.

**2 · The demo's DAG dependency.** `extract` declares `dependsOn: ["fetch"]` and reads
`addressOf(FIXTURE_HTML)`. It would produce a byte-identical green mission if `fetch`
returned something completely different — the dependency edge affects ordering only. The
most-run artifact in the repo demonstrates data flow that does not exist.

**3 · "Content-addressed" artifact storage.** Addressing is real; integrity is not
enforced on read. The check is honestly named `artifact.exists`, which is why this ranks
third — the code does not lie, but "content-addressed" carries an integrity promise the
store does not currently keep.

**Not facades, and worth saying:** the gates, the branch protection, the input contract,
the sandbox, rollback wiring, the model contract, the fidelity harness, the persistence
layer and the auth gate are all real, tested, and in several cases mutation-tested. This
repo's problem is not decoration over emptiness. It is a very well-built engine that has
not been connected to a steering wheel.

---

## Stage

**435 / 1000 — builder stage** (250–500) by the criteria supplied with this audit.

One caveat on that placement, offered rather than assumed: the score is carried by kernel
and gate quality, while the two categories scoring **zero** — agent roster and skill
library — are precisely the ones a builder-stage factory concept depends on. Both are
blocked on the planner (blocker 2), which is blocked on data flow (blocker 1).

Those two blockers are roughly a week of work, and neither requires absorbing another repo.
