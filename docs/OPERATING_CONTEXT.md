# OPERATING CONTEXT

**Read this at the start of every session, before touching anything.**

This file exists because of a measurable failure: three knowledge files describing this
project sat in the workspace for weeks, and the sessions building OPTIMUS never opened
them. The audit of 2026-08-26 even reported *"no Atlas file exists anywhere"* — a `find`
run inside this repo, reported with workspace scope. One directory up would have found
1.28 MB of specification.

> **"Information that is absent from the context window during an execution step is, for
> operational purposes, non-existent to the agent."** — Gemini spec, *Context Window Economy*

That is the whole argument for this file. It is committed, reviewable, and small enough
to actually be read.

**It deliberately does NOT restate the build bible.** The bible holds the rules; this holds
what the bible cannot: where external knowledge lives, what the repo actually contains
today, and what previous sessions got wrong. Two copies of one rule is `stale-duplicate`
with the clock already running.

---

## 1 · The three knowledge files, and how to cite them

They live **outside this repo**, in the workspace parent:

```
../OPtimus X atlass/
├── Optimus Engineer Atlas Research by gemini.txt      854 lines   SPECIFICATION
├── 2.0 OPTIMUS and ATLAS RAW BRAIN.txt             24,324 lines   CURRICULUM
└── OPTIMUS and ATLAS RAW BRAIN 1.0.txt             34,591 lines   CURRICULUM (earlier)
```

**Measured, not assumed:**

| File | lines | distinct lines | notes |
|---|---:|---:|---|
| Gemini spec | 854 | — | Dense. Read it whole; it is the only *executable* one |
| RAW BRAIN 2.0 | 24,324 | 12,111 | **~50% duplicate.** Lines 219–2000 repeat verbatim at 2245–4000. `DOMAIN 15` heading appears **4×** |
| RAW BRAIN 1.0 | 34,591 | 17,717 | **~49% duplicate.** 59 unique domains, engineering-only |

### ⚠️ Four incompatible numbering schemes

**A bare "Domain N" reference is ambiguous and must never be used.** Always name the file.

| Scheme | Where | Example |
|---|---|---|
| 2.0's 125-domain roadmap | RAW BRAIN 2.0 | D18 = Security, D76 = Loop Engineering, D102 = Project Mgmt |
| 1.0's 59-domain sequence | RAW BRAIN 1.0 | D18 = DevOps/CI-CD, D50 = AI Agents, D57 = Local LLMs |
| a 150-domain "master taxonomy" | referenced by 2.0 line 221, **file not present** | db at 40–49, cloud 70–79 |
| hierarchical IDs | Gemini spec | `ENG-ASE-4.2` |

The same number means different things: **2.0's D18 is Security Engineering; 1.0's D18 is
DevOps & CI/CD.** Corrections already needed once — "Domain 110 has the Work Package",
"Domain 18 has AI security", "Domain 126 is local LLMs" were all mis-cited.
Correct: 2.0 D102.3 · 2.0 D18.15 · 1.0 D57.

### Where the OPTIMUS-relevant content actually is

| Topic | Location |
|---|---|
| SKILL.md schema | Gemini **Section S** (line 584) |
| Executable task schema + budgets | Gemini **Section Q** (line 477) |
| Source quality hierarchy | Gemini **Section F** (line 287) |
| Decay clocks | Gemini **Section Y** (line 692) |
| AI scaffolding vs verifier rules | Gemini **Section P** (line 458) |
| AI security subtree | 2.0 **D18.15** (line 4437) |
| Untrusted-content boundary | 2.0 **D18.19** (line 4799), **D80.4** (line 14791) |
| Loop engineering | 2.0 **D76** (line 14147) |
| AI memory systems | 2.0 **D77** (line 14321) |
| Tool calling + risk classes | 2.0 **D78** (line 14457) |
| Evals | 2.0 **D79** (line 14593) |
| Work Package lifecycle | 2.0 **D102.3** (line 18692) |
| Artifact catalogue (~300 types) | 1.0 lines 12081–12400 |
| Capability use-case schema | 1.0 line 12076 |

**Skip without guilt:** the curriculum domains (SQL indexing, Kubernetes objects, career
development, SaaS metrics). They are a learning syllabus for a human engineer, not a spec
for this codebase.

---

## 2 · Schemas worth knowing before you design anything

### SKILL.md — Gemini Section S

```yaml
skill_id · version · description
provenance: {derived_from_task, author_kernel, verification_date}
trigger_conditions: []
permissions: {required_capabilities, filesystem_access}
procedure_steps: {1..n}
postcondition_verifier · rollback_procedure
failure_handling: {on_X_failure: fallback}
```

**Do not conclude the skill library is a schema problem.** It scores 0/100 because a skill
is *a verified mission saved for replay*, and there are no multi-step missions to save —
the DAG has no data flow. The schema is the easy half. Design against it; do not build it
before the plan compiler exists.

### Task schema — Gemini Section Q

Maps closely onto `MissionSpec`. Two fields OPTIMUS lacks:

- **`allowed_sources`** — nothing constrains where a step may get information
- **`budget.max_tokens`** — our `Budget` is `{maxAttempts, maxWallTimeMs, maxCost}`

### Source quality hierarchy — Gemini Section F

| Tier | Kind | Required metadata |
|---|---|---|
| Primary | RFCs, kernel docs, POSIX | syscall id, version, section |
| Secondary | peer-reviewed, official blogs | DOI/arXiv, org, date |
| Tertiary | maintained repos | git SHA, URL, license |
| Community | forums, SO, issues | URL, upvotes, author rep |

**Nothing in this kernel enforces any of it.** `web.fetch` output and `llm.chat` output are
equally trusted, carry no tier, and capture no provenance metadata. Real, open gap.

### Decay clocks — Gemini Section Y

`STABLE 5y · SLOW-CHANGING 2y · MODERATE 6mo · FAST 1mo · VOLATILE 1wk`
(VOLATILE = *"LLM APIs, prompt formats, experimental AI tool libraries"*)

**This is not absent from OPTIMUS — it is present and ungeneralised.**
`kernel/models/qualified.json` carries `maxAgeDays: 30` and a `contractVersion` that
invalidates every model at once; `qualificationOf()` treats an expired record as **not
qualified**, never as a warning. That is a FAST-tier clock applied to one artifact type.
Generalising it is a small PR, not a new subsystem. Say it that way.

---

## 3 · What this repo actually contains (verify before trusting; these rot)

As of `9ae8389`, 2026-08-26 — **advertised here, measured at that commit:**

- **5 registered capabilities**: `web.fetch`, `html.extractTitle`, `scrapling.relocate`, `llm.chat`, `browser.navigate`
- **13 required status checks** on `main`; repo is **public** (private kills branch protection *and* CodeQL on Free)
- **352 unit tests + 3 skipped**, 28 files; 26 e2e
- **75 defect classes** recorded, 63 with a mechanism, **12 UNDETECTED**
- **2 qualified models**: `ollama/llama3.2:latest`, `ollama/qwen2.5:7b`
- Audit score **435/1000** (`OPTIMUS_AUDIT_2026-08-26.md`)

**Registered ≠ AVAILABLE.** Nothing in the UI may present a capability as working until its
PR merges green at ≥90/100 with Safety 30/30.

---

## 4 · Facades — named, so they cannot be rediscovered

The audit named three. **One is dead. Two are live.**

| # | Facade | Status |
|---|---|---|
| 1 | **"Multi-agent orchestration"** — `agent?: string` at `kernel/types.ts:181`. No `Agent` class, interface or module exists. Eight names are string literals in demos/tests, yet output prints `✔ fetch (collector)` | **LIVE** |
| 2 | **The demo's DAG edge carries no data** — `kernel/cli.ts:73` reads `addressOf(FIXTURE_HTML)` beside `dependsOn: ["fetch"]`. `grep -n "output" kernel/scheduler.ts` → zero matches. **The same fake edge is in `tests/kernel/acceptance.test.ts:69`** | **LIVE** |
| 3 | "Content-addressed" storage returned unverified bytes on read | **DEAD** — PR #61 |

**Two more, not in the audit:**

- `components/landing/Kernel.tsx:21` ships `{ name: "Skill", note: "replayable" }`. There is no `Skill` type. Skill library: 0/100.
- `kernel/cli.ts:51` injects `fetcher: async () => FIXTURE_HTML` while the objective reads *"Fetch example.com"*. The demo never touches the network.

**About the `agent` field specifically** — measured, because the docstring is wrong in both
directions. It claims *"reporting and concurrency limits"*. Concurrency is `maxParallel`
(`scheduler.ts:113`) and `locks` (`:136`); `agent` appears in neither. It **is** used for
repair-strategy lookup (`scheduler.ts:247`), which the docstring omits. It is a repair
namespace and a print label. **Do not build an `Agent` class to justify the word** — that
is the facade with a constructor. The plan compiler must not emit `agent`.

---

## 5 · Gaps the Atlas names that this kernel does not cover

Cross-referenced against all 13 CI gates:

1. **AI security (2.0 D18.15) — entirely absent.** Prompt injection · tool abuse · data exfiltration · agent permissions · model supply chain · context leakage · agent sandboxing. Zero gates.
2. **Untrusted content vs trusted instructions (2.0 D18.19).** `llm.chat` takes `messages[]` with **no provenance on any message**. `web.fetch` output can reach a model with nothing marking it untrusted. The Atlas requires boundaries between System Policy / Developer Instructions / User Instructions / Tool Results / Web Content / Repo Content / Agent Messages.
3. **Tool risk classification (2.0 D78.5).** `READ_ONLY / LOW_RISK_WRITE / HIGH_RISK_WRITE / DESTRUCTIVE / PRODUCTION_CRITICAL`. OPTIMUS permissions are capability-scoped but unclassified — `delete_production_database()` and `read_file()` would carry the same shape.
4. **Human approval for dangerous ops (2.0 D18.20, D80.6).** propose → classify → approve → execute → audit → verify. No approval step exists.
5. **Source tiering (Gemini F).** Above.
6. **No-progress detection (2.0 D76.5).** The harness caps attempts but does not detect *the same error three times* and change strategy.
7. **Knowledge and Learning Method** — two of the Gemini spec's Four Pillars. OPTIMUS models Capability and Evidence only.

None of these blocks the current arc. All belong in the registry as known-and-unbuilt
rather than being rediscovered later.

---

## 6 · Where the Atlas and this repo independently agree

Corroboration, not instruction — these were arrived at separately and match:

- **Proof-or-stop gating** (Gemini P) == *"done means a check passed"*
- **Mutation testing** (2.0 D20.10) == THE MUTATION RULE
- **Coverage ≠ correctness** (2.0 D20.15) == the assertion rule
- **Coverage-confidence %, state unverified remainder** (Gemini 16-step) == THE COUNTING RULE
- **Budgets on every loop** (2.0 D76.4) == *"no step runs without a declared budget"*
- **Planner / Executor / Replanner split** (2.0 D76.6) == the arc's PR C

Where the Atlas and the bible disagree, **the bible wins** — it is enforced by CI; the Atlas is not.

---

## 7 · Session-start checklist

1. Read the build bible (loaded automatically) and this file.
2. `git log --oneline -5` · `gh issue list` · `gh pr list` — state before assumptions.
3. Never claim absence without a **control query and a coverage fraction.** `find` in one directory is not "anywhere". This is how the Atlas was missed.
4. Cite Atlas content as **file + section + line**, never as a bare domain number.
5. Any count you report names its method: advertised / measured / sampled.
6. Before calling a test proof, remove its subject and watch it go red.
7. Before pushing: `git show --stat HEAD`, read as a stranger.

---

## 8 · What previous sessions got wrong, so it is not repeated

| Claim | Reality |
|---|---|
| *"No Atlas file exists anywhere"* (audit, 2026-08-26) | 1.28 MB in `../OPtimus X atlass/`. The `find` ran in one directory; the claim had workspace scope |
| *"Domain 110 has the Work Package format"* | 2.0 D102.3 — and it is an 8-stage lifecycle, not a five-field template |
| *"Domain 18 has an AI security subtree"* | 2.0 **D18.15** — but 1.0's D18 is DevOps. The number alone is ambiguous |
| *"Domain 126 covers local LLMs"* | No D126 exists. It is **1.0 D57** |
| *"OPTIMUS has no concept of capability expiry"* | `qualified.json` `maxAgeDays: 30`, enforced, expired = not qualified |
| *"The skill library is 0 because the schema was missing"* | It is 0 because there are no multi-step missions to save |

Each of these was stated confidently and was wrong in a way one command would have caught.
That pattern — **confident, checkable, unchecked** — is the one this file exists to break.
