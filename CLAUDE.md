@AGENTS.md

# CLAUDE.md — OPTIMUS Build Bible

> **This file is the tracked source.** It lives in the OPTIMUS repo so that changes to the rules move through
> the same gauntlet as changes to the code they govern: reviewed, gated, and tied in history to the commits
> that acted on them. The workspace copy one directory up is now a pointer here, not a second original.
> Moved 2026-08-25 — before that it lived only in the workspace, untracked alongside this codebase, which is
> how PR #33's body came to describe changes that were real but invisible to the diff (see THE SELF-DESCRIPTION RULE).

*Load this every session. It is the map for turning 107 repositories into ONE product (OPTIMUS) without repeating the Frankenstein mistake. It tells you what each repo is FOR, how it gets absorbed (its "fate"), its super-ability, and the rules that keep the build honest.*

**OPTIMUS =** an AI-native work environment where you state a goal and it assembles the right workspaces (browser, code, research, data, design, automation + specialized rooms) to do the work **and prove it**, saving every verified result as a reusable skill.

Companion docs in this folder: `OPTIMUS_CAPABILITY_ARCHITECTURE.md` (capabilities→domains), `OPTIMUS_PAGE_ARCHITECTURE.md` (the 17 pages), `OPTIMUS_REPO_INVENTORY.md` (all 107 repos), `The Missing Kernel` + `OPTIMUS Blueprint` artifacts.

---

## COURSE CORRECTION — 2026-08-24 (wins over anything below it that disagrees)

*Recorded because an agent reading the earlier version of this file would pull against the owner's actual goal in every session. The earlier plan was not malicious or lazy — it was cautious in the wrong direction, and it skipped a common-sense check before abandoning repos.*

**What the earlier plan got wrong.** It cut 45 of 107 repos and called that discipline. Reviewed with the owner and verified on disk, most of those cuts do not survive scrutiny:

- **It cut for redundancy.** "crawl4ai — redundant with scrapling+firecrawl." But three scrapers that fail in different ways are a fallback chain, not waste. Overlap is *wanted*: if four repos do security testing and ten do design, all fourteen come in.
- **It cut catalogs — while this same file defines a fate for catalogs.** HARVEST is written above as *"catalogs, rules, connectors → copy the data into OPTIMUS registry."* An awesome-list holding 744 curated, categorised URLs is precisely that: a discovery index and a target set for the browser and scraper capabilities OPTIMUS is being built to have. Cutting it contradicted the fate table on the page above it.
- **It dismissed real code as documentation.** Verified by counting files: ant-design **3,010** source files · chakra-ui **2,601** · ariakit **1,694** · daisyui **112** · MoBA **8 Python files** (a real block-attention implementation) · checkpoint-engine **19**. These were waved off as "UI kits" and "model cards" and dropped without being opened.
- **It called the Composio catalog "832 dead skills."** Verified: **832 of 864** SKILL.md files reference the same `rube.app` dependency. That is ONE unwired integration repeated 832 times — never connected, never gated, never tested. The skill content was never the problem. The wiring and the proof were.

**The corrected goal: absorb as much as possible, not as little as defensible.** Overlap is a feature. The only thing genuinely worth cutting is the same bytes stored twice under two names.

**What has NOT changed, and must not.** Nothing is marked AVAILABLE without proof, and no score is ever rounded up. Breadth did not kill nexus — *breadth with no gates, no wiring and no proof* did. The gates are exactly what makes breadth affordable now. Absorb widely; prove everything.

---

## PRIME DIRECTIVES (read before touching any repo)

1. **Do NOT copy-paste repos into one folder.** **~104 of 107** get a real fate, in the 5 ways below (see `OPTIMUS_REPO_INVENTORY.md` for the full breakdown). Only byte-identical duplicates are cut. Absorbing widely is the goal; the trap that killed nexus was never breadth — it was breadth with no gates, no wiring and no proof (4 empty packages; 832 skills all pointing at one integration nobody connected).
2. **Kernel first, features later.** Build the spine (broker, manifest, permissions, artifact graph, scheduler, verification) before wiring any repo. The kernel is the only genuinely new code.
3. **Nothing is accepted without proof.** Every capability added must run in isolation and produce evidence. Verification is a required gate, never a button.
4. **If a capability isn't really integrated, mark it UNAVAILABLE.** Never show a button that fakes it. A demo that lies is worse than a missing feature.
5. **Port small, service big, harvest catalogs, cut only duplicates.** (Fates below.) When in doubt, run it as a service — you get its real byte-for-byte behavior for free. Never cut a repo for overlapping with one already absorbed: a second engine that fails differently is a fallback, and a fallback is a feature.
6. **One repo in = one test proving it works inside OPTIMUS.** No absorption without a passing probe, and no repo is marked AVAILABLE without an honest **Absorption Score out of 100** (see scoring rubric below `CAPABILITY ONBOARDING PIPELINE`). Never round up. A 60/100 reported honestly is worth more than a fake 95.
7. **The kernel makes repos "better," not rewrites.** Same logic + permission + sandbox + verify + log + rollback = product. Don't improve a repo by editing its algorithm; improve it by wrapping it in the 5 guarantees.
8. **node_modules is never vendored.** Regenerate with the package manager. Real source that matters is <1 GB; the 21 GB is 90% junk.
9. **Never delete a source repo.** Cut/reference repos stay on disk untouched — they're simply excluded from the build. If a cut repo's name, package, or capability would collide with a kept one, **flag it explicitly** in the PR/issue rather than silently dropping it or silently overwriting it.

---

## THE SELF-DESCRIPTION RULE — a description is a claim, and claims get checked

*Added 2026-08-25 after the same defect surfaced three times in one week. Three separate catches is the signal that it needed a rule rather than a third catch.*

| # | Where | What it claimed | What was true |
|---|---|---|---|
| 1 | `gauntlet.yml`'s coverage summary | listed the CI gates not yet implemented | it was a hardcoded second copy that had drifted — it printed "gate 10 · no sandbox" for a day after K4 merged |
| 2 | PR #33's body | described three `CLAUDE.md` rules as part of the change | those edits were real, but in a **different git repo** — not one line of them was in the diff |
| 3 | `CI_STATUS.md`, gate 6's blocker | "Nothing absorbed yet, so no parent behaviour to diff" | three repos were absorbed; the real blocker is that no golden-diff harness exists (issue #34) |

**The rule.** Anything that *describes* work — a PR body, a CI job summary, a status table, an Absorption Score, a capability's `description` field — is a **claim about a thing that exists somewhere else**. It is checked against that thing before it ships. Where the check can be automated, automate it (`scripts/gate-coverage.mjs` + `tests/unit/gate-coverage.test.ts` is the worked example). Where it cannot, it is a line on the PR checklist, ticked by someone who actually looked.

A description that has gone wrong is worse than no description: it is the same defect as a green check on a capability that does nothing, and it is read by exactly the people who have no other way to know.

> **Corollary — single-sourcing and staleness are different failure modes, and only one of them is now covered.** Consolidating two copies into one stops them DIVERGING from each other. It does nothing to stop the one remaining copy from going stale against reality. Instance 3 above was found *inside* the single source, in the same PR that created it. A single source needs its own freshness check, or you have traded two copies that disagree for one that is confidently wrong.

**Where this bites hardest:** the Absorption Score. A score is a description of proof that exists elsewhere. Directive #6's "never round up" is this same rule applied to a number.

---

## THE 5 FATES

| Fate | When | How | Example |
|---|---|---|---|
| **PORT** (copy byte-for-byte) | small, pure-logic, no heavy runtime | copy/translate the core algorithm into OPTIMUS code, with tests proving identical output | Scrapling selector, ast-grep matcher, scrollama (nexus already ported these) |
| **SERVICE** (run as sidecar) | heavy engine, don't rewrite | run as its own process (Docker); OPTIMUS calls it via API/MCP; behavior unchanged | n8n, Dify, browser engines, codesandbox microVM, Stirling, Fincept, OmniRoute |
| **HARVEST** (take data, drop app) | catalogs, rules, connectors, link indexes, design systems | copy the data into OPTIMUS registry; delete the wrapper. Scored by **sampled proof** — see *Catalog absorption* below | 4,157 skills, sim's 378 connectors, ast-grep's 184 rules, awesome-lists' 1,000+ curated URLs, ant-design/chakra-ui component patterns |
| **FIXTURE** (test data, not a capability) | corpora, metadata and reference implementations whose job is to **prove other capabilities work** | load it, write its known-content assertions, and wire it into another repo's proof gate. Scored by *Definition of Done* below, never by an Absorption Score | CodeSandbox+Kimi docs as the memory layer's retrieval corpus; codesandbox-client as K4 architecture reference |
| **CUT** | **byte-identical duplicates only** | **not deleted** — left on disk, excluded from the build, referenced only; flagged if it collides with a kept repo | India Lovable (3.5 GB copy), the second free-programming-books, the second scrollytelling |

---

## BUILD ORDER

0. **CI/CD GAUNTLET FIRST.** Before any product code, stand up the fail-closed pipeline (see CI/CD section). Every PR — from the very first — passes security + fidelity + performance + scalability gates. No "we'll add tests later." The kernel's own first commit runs the full gauntlet.
1. **Catalog, don't delete** — every repo stays on disk untouched. Byte-identical duplicates (India Lovable's 3.5 GB copy and friends) are referenced only; if a duplicate or naming collision surfaces while absorbing another repo, flag it in that repo's issue/PR rather than silently deleting or overwriting anything.
2. **Kernel** — broker · capability-manifest schema · permission boundary · artifact graph · execution scheduler · verification spine. (New code, small.)
3. **Model layer** — OmniRoute BUNDLED (local child process, no internet) → 516 models, one local endpoint.
4. **Absorb capabilities** — one repo at a time through the 16-gate Onboarding Pipeline below; each becomes AVAILABLE only when all gates are green.
5. **Surfaces** — the 17 pages as thin views over kernel objects (see `OPTIMUS_PAGE_ARCHITECTURE.md`).
6. **Flywheel** — verified missions save as replayable skills.

> **Terminology:** "BUNDLE" = the engine ships **inside this one repo** and runs as a **local child process** (stdio/localhost, no internet). It is NOT an external API. One repo, one deploy, everything local.

---

## THE EXECUTION MODEL — a mission is a pull request

*This is the spine of how OPTIMUS runs work. Decided 2026-08-16. If any other doc conflicts, this wins.*

We already trust this model: it is how the OPTIMUS repo's own CI works, and how GitHub runs a hundred million repos. Propose a change → automated checks run → **nothing lands until they're green** → everything is logged, replayable and revertible. OPTIMUS uses the same shape internally, so a user who has ever opened a pull request already understands Mission Control.

### The mapping (build to this table)

| GitHub | OPTIMUS | Kernel |
|---|---|---|
| Repository | Workspace / project | K3 |
| **Pull request** | **Mission** — a proposed change to the world, not yet applied | — |
| Commit | Action → Observation atom | — |
| **Job** | **Step** — one tool, one loop, one budget | K4 |
| Workflow (DAG of jobs) | Mission plan — the graph | K4 |
| **Required status check** | **Verification.** A step is done when a check passes, never because a model said so | K5 |
| Branch protection | Permission boundary — nothing applies with a red check | K2 |
| Reusable workflow (`workflow_call`) | **Skill** — a verified mission saved for replay | K1 |
| Composite action | **Tool** — one capability, one manifest entry | K1 |
| Build artifact | Artifact, content-addressed | K3 |
| Run log / annotations | Evidence + audit trail | K3 |
| Revert a merge | Rollback — including the parts that succeeded | K2 |
| Runner | Sandbox — isolated, disposable | K4 |
| Merge queue | Execution scheduler | K4 |
| Concurrency group | Resource lock (one browser profile, one repo worktree) | K4 |
| `paths-filter` change detection | Skip steps whose inputs are unchanged (memoise on artifact hash) | K3 |
| Secrets | Credential vault, least privilege per step | K2 |
| `harden-runner` egress policy | Per-step network allow-list | K2 |

### Every step is a loop. Every loop has a budget.

A step is **not** a function call. It is a small loop:

```
attempt → observe → verify → ┬ pass → seal evidence, emit artifact
                             └ fail → diagnose → repair → attempt (n+1)
```

This is what makes OPTIMUS reliable rather than hopeful. But a loop that can retry can also spin forever and burn the whole token budget on one stuck step, so:

> **No step runs without a declared budget.** `max_attempts`, `max_wall_time`, `max_cost`, and an explicit stop condition. When a budget is exhausted the step **fails honestly, with its evidence attached** — it never retries into the void and never reports success it can't prove. A loop without a budget is a slot machine.

Budgets live in the capability manifest (gate 8) beside permissions and isolation level. A step that omits them fails its contract test.

### The graph

A mission is a DAG of these loops. Independent steps run in parallel; a failed step fails its dependents unless it is explicitly marked continue-on-error (which is recorded in the evidence, never silent). The scheduler (K4) owns the graph: ordering, parallelism, resource locks, resumption after a crash.

**Nesting is allowed and expected** — a step may itself be a saved skill, which is its own graph of loops. Same as a reusable workflow calling another. Cap the depth (GitHub caps at 4) so a skill can't recurse into itself forever.

### Five rules that follow

1. **Done means a check passed.** Model confidence is not a check.
2. **No budget, no run.** Enforced by the capability contract.
3. **Nothing applies to the real world with a red check.** Missions stay proposed until green — that's the whole point of making a mission a PR rather than a chat reply.
4. **Every run is reproducible** from the artifact graph plus the pinned tool versions.
5. **Only verified missions become skills.** Skills are versioned, and re-verified before reuse — an upstream change can rot a skill exactly like it rots a fidelity test.

---

## REPO → FATE → EXTRACT → SUPER-ABILITY

### Kernel substrate (build the spine around these)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| software-agent-sdk (OpenHands) | PORT+SERVICE | Action/Observation/Executor loop = OPTIMUS's "process" model. The agent step-loop. |
| xmcp | PORT | file-routed MCP server framework = how capabilities register into the broker. **The fidelity leverage play.** Today `1 Capability = 1 hand-written run()`, so each absorbed repo sits at one entry point (Scrapling 1 function, browser-use 1 of 11 tools, OmniRoute 1 endpoint) — that is an ADAPTER limit, not a work limit: the broker is a plain `Map<string, Capability>` with no per-repo cap, and the repos already publish their full surface over MCP (browser-use's `mcp/manifest.json` declares **11 tools**; Scrapling's `core/ai.py` exposes ~**10**). A generic MCP adapter registers all of them without hand-writing 21 adapters. ⚠️ **Registering 21 tools is NOT 21 tools proven.** Gates 8–9 (manifest + broker wiring) automate; gates 11, 12 and 14 stay per-tool. Fidelity gets cheaper, never free — a score that jumps on registration alone is exactly the unearned number this file exists to prevent. |
| supabase | SERVICE | Postgres + pgvector + realtime + RLS = artifact graph + memory + permission store. Use CLI/service, not the 759 MB monorepo. |
| harbor | SERVICE | Verifier + Task + 10 pluggable Environments = the verification/eval engine (K5). |
| codesandbox-sdk | SERVICE | microVM create/shell/fs/hibernate = the isolation every action runs inside (K4). |
| OmniRoute | SERVICE | 516 models, one OpenAI endpoint, failover, cost = the model layer. |

### Browser & collection (Browser Lab, Research Lab)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| browser-use | PORT/SERVICE | LLM browser agent: act/multi_act/DOM understanding. Default browser backend. |
| pinchtab | SERVICE | Go/CDP Chrome control, token-cheap. Backend for hot paths. |
| camofox | SERVICE | anti-detection browser. Fallback when blocked. |
| scrapling | PORT | adaptive selectors + 10-tool MCP server. Survives site redesigns. |
| firecrawl | SERVICE | scrape/search/crawl/extract/map at scale. Hosted or self-host. |
| crawl4ai | CUT | redundant with scrapling+firecrawl (908 MB). |
| anydoc | PORT | any doc (9 formats) → markdown, Rust/WASM. Ingestion front door. |
| Agent-Reach | PORT | read YouTube/Reddit/X/13 platforms around paywalls. |

### Code & verification (Code Studio, Security Console)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| gitnexus | PORT/SERVICE | repo → kuzu knowledge graph + cypher, multi-lang parsers. Code understanding. |
| ast-grep-essentials | HARVEST | **184** structural code rules → verification spine. (The repo has 554 `.yml` files, but that counts rules **plus their test fixtures plus config**. 184 is the real rule count; 14 are JS/TS, the rest activate as engines in those languages get bundled. 87 also needed repair — their utility ids contain reserved characters that the current ast-grep CLI rejects outright.) |
| git-worktree-runner | PORT | parallel agents in isolated worktrees. |
| claude-security (review action) | SERVICE | AI PR security review w/ findings+severity. |
| strix | SERVICE | reproduce-to-prove exploit loops. Security gate. |
| hexstrike / mergen / CyberStrikeAI | SERVICE | 151 MCP security tools. ⚠️ authorized targets only. |
| kimi-code | OPTIONAL | alt coding agent, cheap/provider-flexible. |

### Automation (Workflow Studio)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| n8n | SERVICE | WorkflowExecute DAG runtime + ~400 nodes + native MCP. The workflow engine. |
| langflow | SERVICE | visual authoring, flows→API+MCP (MIT). |
| sim | HARVEST | 378 tool integrations → connector catalog. Keep UI as reference only. |
| airflow | OPTIONAL SERVICE | heavy DAG scheduling when n8n isn't rigorous enough. |
| dify | OPTIONAL | RAG-app platform; only if a vertical needs it. |

### Specialized treasure (Tier-3 pages)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| FinceptTerminal | SERVICE | 1,379 files: databento feeds, deal scanner/parser/tracker, finagent core. Finance Terminal. |
| TimesFM | SERVICE | zero-shot time-series forecasting. |
| Stirling-PDF | SERVICE | 276 controllers / ~100+ PDF ops. Document Desk. |
| open-design | PORT/SERVICE | craft engine + clipper extension + figma-plugin + 521 skills. Design Studio. |
| shader-lab | PORT | WebGPU shader runtime for visual polish. |
| hyperframes | SERVICE | HTML→video render engine (core/engine/producer + cloud). Media Studio. |
| OpenMontage | SERVICE | agentic video pipelines. |
| openWakeWord + openSpeechToIntent | PORT | wake-word + intent = voice prototyping. |
| ui-ux-pro-max | HARVEST | design-judgment skill. |

### Memory & skills (cross-cutting pages)
| Repo | Fate | Extract / super-ability |
|---|---|---|
| obsidian-wiki | PORT | Karpathy bi-temporal wiki = agent long-term memory. |
| skill catalogs (nexus 919 / claude-skills 864) | HARVEST | dedupe into ONE registry. ~31 hand-built are the gold. The other **832 are not dead — they are one unwired dependency repeated 832 times**: every one references `rube.app`, which nobody ever connected or tested. Wire it once, then sample-verify (see *Catalog absorption*). |
| agent-skills / gstack / ponytail | HARVEST | process skills (quality gates, token-reduction). |
| genesis-kit | PORT | repo-bootstrap ritual for durable agent state. |
| coolify | SERVICE | self-host deploy (your own Heroku). |

### Your prior projects (harvest patterns, not code)
| Repo | Fate | Extract |
|---|---|---|
| nexus | HARVEST | the absorption patterns (scrapling→TS port), skills/built-in registry. Don't restart it. |
| Nexify (recoverable via `Mega Command Center` → `git checkout .`) | HARVEST | CONTEXT.md-into-system-prompt pattern, 121 API routes as reference. |
| SDE-Atlas | HARVEST | knowledge-graph UI patterns. |

### RE-FATED 2026-08-24 (was the old CUT list — see COURSE CORRECTION)

The previous version of this file cut everything below. Opened and verified on disk, most of it holds real code or real data:

| Repo | New fate | What's actually in there |
|---|---|---|
| crawl4ai | SERVICE | `Dockerfile` + `docker-compose.yml` + a Docker API with its own tests. Apache-2.0 — textbook SERVICE shape |
| ant-design · chakra-ui · ariakit · daisyui · evergreen | HARVEST | **156 / 46 / 9 / 18 / 18** token+theme files, MIT — design tokens and component patterns. Pays off only once Design Studio exists |
| awesome-lists ×6 | HARVEST | **971** parseable `- [name](url)` entries — a discovery index and a target set for the browser/scraper capabilities |
| free-programming-books · system-design-primer | HARVEST | **11,050** and **1,228** structured entries — learning corpora for the memory/wiki layer |
| icons-master · ui-frameworks · ui-tools | HARVEST | **480** curated links in **92 KB** total — genuine link indexes, nearly free to take |
| **MoBA** | **PORT — concept only. No byte-parity is possible, so gate 11 (fidelity vs parent) DOES NOT APPLY; score it as a new capability with its own tests.** ⛔ **Blocked on: obsidian-wiki + supabase** | `moba_topk` + `key_gate_weight` + block chunking is a top-k **selection** algorithm: chunk the sequence, take one representative per block, score, keep top-k. Strip the tensors and it is OPTIMUS's context-assembly problem — a mean and a dot product, **no CUDA needed**. Do not pick this up early: top-k retrieval over an empty store is a no-op until there is a memory layer to retrieve from |
| Kimi-K2 · Kimi-Linear | HARVEST → model registry | Not prose — routable metadata: total/activated params, context length (128K / 1M), KV-cache and throughput figures. OmniRoute routes 516 models; a router with no per-model facts routes blind |
| CodeSandbox docs · kimi-help-center | **FIXTURE** | **284** real technical markdown files — the retrieval corpus that proves the memory layer (obsidian-wiki + supabase/pgvector) actually works. Retrieval cannot be proven against three toy documents |
| **codesandbox-client** | **FIXTURE (read-only reference — GPL, never vendored, never copied)** | 4,697 files, 356 MB. A real in-browser VM + bundler architecture, useful while building K4. GPL blocks *bundling*, not *reading* — this constraint travels with the row, not in a footnote |
| fastlane | HARVEST | MIT, 2,983 files. The **lane** pattern — named, composable, parameterised sequences with before/after hooks — is structurally OPTIMUS's skill composition |
| checkpoint-engine | reference | 19 Python files, a hot-swap weight-update service. Real code, for a problem OPTIMUS does not have |
| awesome-android-ui | reference | 307 MB of GIFs behind a flat index — **2 headings total** (`## Maintainers`, `## Index`). Checked specifically for a categorised pattern corpus; there isn't one |

**Not a repo at all:** `Arctix/` is empty — 8 KB, one `.DS_Store`. `ARCTIX.code-workspace` bundles **76 folders** around an empty `ARCTIX` folder: this same project under an earlier name, abandoned before a line was written. Keep it as evidence, absorb nothing.

**Still CUT — byte-identical duplicates only:** India Lovable (3.5 GB copy) · the second free-programming-books · the second scrollytelling. Nothing else. Cut means *left on disk, excluded from the build* — never deleted.

## SIZE FACTS (so nobody re-copies junk)
- Total on disk: **21 GB** — but node_modules **6.8 GB** + .git **0.5 GB** + India Lovable dup **3.5 GB** are never vendored *into OPTIMUS* (they stay on disk exactly where they are; nothing here is a deletion instruction).
- Real logic you PORT byte-for-byte: **<1 GB** (cores are 1–20 MB each).
- Heavy repos (GitNexus 169 MB, OmniRoute 220 MB, Fincept, n8n) run as SERVICES — not copied.

---

## CAPABILITY ONBOARDING PIPELINE (16 gates · run on EVERY repo)
*Replaces the old 7-step method. A repo is not "absorbed" until all 16 gates pass. No skipping.*

**PHASE A — ASSESS (before you touch it)**
1. **Source recon** — find real entry points + executable paths. Never the README.
2. **Capability surface** — exact functions, params, return types, error modes (e.g., Scrapling `fetch` has 20+ params).
3. **License & legal gate** — flag AGPL / BSL / Sustainable-Use / Elastic. Resolve bundling implications BEFORE ingest. (Fincept, firecrawl, maxun = AGPL; n8n = Sustainable Use — these constrain a commercial standalone build.)
4. **Supply-chain scan** — deps, secrets, known CVEs in the repo itself before it enters OPTIMUS.
5. **Fate decision** — PORT / BUNDLE / HARVEST / CUT, recorded with reason + owner.

**PHASE B — INTEGRATE**
6. **Pin provenance** — exact commit SHA + checksum recorded; reproducible.
7. **Bring in by fate** — PORT: translate keeping logic identical. BUNDLE: ship as local child process, untouched. HARVEST: copy data/rules only.
8. **Capability contract** — manifest entry: inputs, outputs, errors, required permissions, cost class, isolation level.
9. **Broker adapter** — register through the ONE manifest schema (skill / MCP-tool / n8n-node / sim-tool all identical).
10. **Permission & isolation boundary** — least-privilege; define blast radius; assign sandbox.

**PHASE C — PROVE**

> **Assertion rule (applies to every gate below).** An assertion must test the value's MEANING, not its shape. `expect(typeof x).toBe("string")` on a field whose contract promises a page title is not a test — it is a placeholder that looks like one, and it passes on the wrong string forever.
>
> This is not hypothetical. `browser.navigate` shipped a URL in its `title` field from absorption until Validation Round 1. Gate 11 did not miss it: a session **observed** the behaviour, polled it 5 times over 1.5s to rule out a race, **correctly diagnosed it as upstream** — and then used that correct diagnosis to justify DELETING the assertion, leaving `expect(typeof output.title).toBe("string")` behind with an honest paragraph explaining why.
>
> That failure mode — right observation, wrong conclusion — is harder to catch than a plain wrong answer, because the reasoning sounds sound. So the rule is explicit: **"the capability doesn't control this" is true and irrelevant.** The capability's contract still promises what it promises; shipping the wrong value there is our defect regardless of whose code produces it. If upstream is wrong, fix it in the adapter or change the contract — never weaken the assertion to match the bug.

11. **Fidelity test vs parent** — golden inputs → outputs must match the parent repo. This is the ~100%-for-bundled / tested-parity-for-ported gate.
12. **5 guarantees wired & tested** — permission · sandbox · verify · log · rollback, each with a passing test. (This is the "make it better.")
13. **Performance baseline** — capture latency / memory / cost budget; set regression alarms.
14. **Failure & recovery** — timeout, crash, retry, kill-switch behavior all tested.
15. **Golden regression suite** — this capability's tests join CI permanently.

**PHASE D — SHIP**
16. **Publish manifest + docs + upstream-sync plan** → mark AVAILABLE only when gates 1–15 are green.

---

## ABSORPTION SCORE (0–100, per repo, always honest)
*Required by Prime Directive #6. Every repo gets this score the moment work starts on it — 0 before Phase A begins, updated as gates pass, never rounded up, never claimed higher than what's actually proven. Report it in the repo's issue AND its final PR description.*

**Five weighted components (sum = 100):**

| Component | Max pts | What earns the points |
|---|---|---|
| **Fidelity** | 35 | % of the parent's real capability surface (gate 2) actually working in OPTIMUS, verified by gate 11 golden tests. A repo with 10 real functions where only 6 are wired = 21/35, not 35/35. |
| **Safety** | 25 | The 5 guarantees (gate 12) each fully wired + tested: permission (5) · sandbox (5) · verify (5) · log (5) · rollback (5). |
| **Robustness** | 15 | Gate 13 (performance baseline) + gate 14 (failure/recovery) both passing with real tests, not stubs. |
| **Integration** | 15 | Gate 8–9: capability contract complete + broker adapter registered and callable from the kernel, not just present in code. |
| **Proof coverage** | 10 | Gate 15: golden regression suite exists and runs in CI, not a one-off manual test. |

### FIXTURE — DEFINITION OF DONE (it never gets an Absorption Score)

A FIXTURE has no capability to run, so "AVAILABLE at ≥90/100" is meaningless for it. It is DONE when **all three** are true:

1. **Loaded** — the corpus or data is in the OPTIMUS registry, pinned by commit SHA + checksum like any other ingest (gate 6).
2. **Asserted** — its known content is written down as real assertions ("this corpus holds N documents; document X contains Y"), so silent drift is detectable.
3. **Consumed** — **at least one other repo's proof gate references it and would fail without it.**

**Rule 3 is the entire point.** A FIXTURE that no test consumes is CUT wearing a nicer word, and that specific self-deception is what this file exists to prevent. If nothing consumes it within one absorption cycle, demote it to *reference* and say so out loud.

### CATALOG ABSORPTION (for HARVEST at scale)

A catalog is not a capability, and 16 gates × 832 entries is not a plan — attempting it is how 832 things get marked "done" that nobody checked. So a catalog is absorbed as **ONE unit with ONE score**, and its proof is a **verified random sample**, never a claim about the whole.

- Wire the catalog's shared dependency **once** (e.g. the `rube.app` integration that 832 of the 864 skills all point at).
- Verify a **random sample** running for real — 30 entries minimum, more for a bigger catalog.
- Score from the sample, and **state the unverified remainder out loud** in the score itself.

> `Composio catalog: 61/100 — dependency wired, 27/30 sampled connectors verified live, **805 unverified**.`

That trailing number is the whole point. A catalog whose score hides its unverified remainder is the nexus failure with better paperwork.

**Reporting rules:**
- **0/100** = issue opened, nothing else done yet. Never leave a repo unscored — "not started" is a valid, honest score.
- **AVAILABLE requires ≥90/100**, with Fidelity ≥30/35 and Safety = 25/25 (safety is never partial-credit in production — either all 5 guarantees are wired or the capability stays UNAVAILABLE, per Directive #4).
- A score may **go down** — e.g. an upstream repo update breaks fidelity, or a perf regression is caught. When it does, downgrade immediately and say why; do not leave a stale high score standing.
- State the score **with its breakdown**, not just the total (e.g. "Scrapling: 78/100 — Fidelity 28/35, Safety 20/25, Robustness 10/15, Integration 15/15, Proof 5/10 — missing: failure-recovery tests, 2 of 10 tools not yet fidelity-tested"). A bare number without the breakdown is not an honest score.

---

## ABSORPTION WORKFLOW — one repo = one issue + one PR
*This is HOW the 16 gates get executed and mistakes get CAUGHT. It exists to stop repeating the 3 previous failures — bulk-absorb → no gates → no wiring → no proof → 832 skills pointing at an integration nobody connected, empty packages, mock data, all discovered far too late. The fix is proof per repo, not fewer repos.*

**Iron rules:**
- **One repo → one tracking ISSUE → one branch → one PR.** Never two repos in one PR.
- **WIP limit: ONE repo at a time.** Finish it, then start the next. The loop per repo is:

  ```
  absorb → test (10+ real scenarios) → error → fix → re-test → validate → finish → next repo
  ```

  Re-test until it passes or until it is **blocked on something outside this repo**. That distinction is the whole rule: *"blocked on X"* is a legitimate place to stop and move on — **"not tested yet" never is.** A repo whose remaining work needs a kernel piece or another repo (ast-grep's 170 language rules; browser-use's proof needing Chrome in CI) is marked *blocked, with the blocker named*, scored at its honest ceiling, and revisited when the blocker clears. Without that escape valve you deadlock on repo #1 forever; without the naming rule, "blocked" becomes an excuse.
- **WIP for KERNEL work is also ONE.** The rule above counts repos, and kernel work has no repo — which is how three PRs ended up open at once against a rule written the same morning. The unit for kernel work is **one guarantee, one boundary, one gate**: K4 isolation is one PR, rollback wiring is one PR, input constraints is one PR. If a kernel change needs a second PR stacked on it before the first has merged, that is the signal it was scoped too large, not a licence to run two.
- **A capability is AVAILABLE only when its PR merges green.** Until then it is UNAVAILABLE — never faked in the UI (Prime Directive #4).
- **Walking skeleton first:** prove the whole pipeline end-to-end on ONE easy repo before scaling.

**Issue template (per repo):** fate · target page · capability surface (real functions) · license · the 16 gates as a checkbox acceptance list · Absorption Score starting at 0/100.
**PR template (per repo):** extraction summary · fate · fidelity evidence vs parent · CI gate results · capability-manifest diff · rollback note · linked issue · **Absorption Score with full breakdown** (see scoring rubric above).
**Labels:** `fate:port|bundle|harvest` · `page:browser|code|research|…` · `risk:low|med|high` · `license:mit|agpl|sustainable`.
**Definition of Done (per repo):** all 16 gates green · fidelity proven vs parent · Absorption Score ≥90/100 with Safety = 25/25 · manifest published · golden tests added to CI · issue closed.

### VALIDATION ROUNDS — per repo, then per category

Two different questions, both required. Gates ask *"did this pass its checks?"*. A validation round asks *"does it actually do the thing, on real input, with output a person reads?"*

1. **Per repo (every repo, no exceptions):** 10+ real scenarios in live OPTIMUS before the repo is finished. Failures loop back through fix → re-test.
2. **Per category (when a category completes):** the repos in a category get tested **together**, because the real product question is not "does each work" but "do they work as one." Categories: *model & routing · browser & collection · code & repo understanding · security & penetration · automation · design & media · documents & data · memory & skills · voice · infrastructure.*

A category round is where overlap earns its keep: three scrapers are only a fallback chain if the handoff between them is proven, and only a category round tests that.

**Extraction order (dependency-first):**
1. **Wave 1 — kernel substrate:** openhands-sdk · xmcp · supabase · codesandbox · harbor · OmniRoute. (These ARE the spine; build + bundle them first.)
2. **Wave 2 — walking skeleton:** Scrapling (easy PORT) + browser-use (bundle). Prove issue→PR→gates→merge→AVAILABLE end-to-end on 2 repos before scaling.
3. **Wave 3+ — the rest,** grouped by page, one repo at a time, WIP ≤ 3.

*When the OPTIMUS repo is created, this becomes real `.github/ISSUE_TEMPLATE/absorb-repo.md` + `PULL_REQUEST_TEMPLATE.md` + labels + a project board (one column per wave).*

---

## CI/CD — THE GAUNTLET (fail-closed, from the first PR)
*Principle: every PR guarantees security + scalability + performance from commit #1. OPTIMUS's CI is built from OPTIMUS's own verification treasure (dogfooding). Nothing merges red.*

**Required checks on EVERY pull request (all must be green):**
1. **Build · typecheck · lint** — compiles, types clean, style enforced.
2. **Unit + capability-contract tests** — every adapter satisfies its manifest contract.
3. **Static security** — `ast-grep` (184 rules, 14 active for a TS repo) + secret scan + dependency CVE scan + CodeQL.
4. **AI security review** — `claude-code-security-review` runs on the diff.
5. **License / SBOM gate** — all deps pinned; no license violations; SBOM generated.
6. **Fidelity tests** — bundled/ported capabilities vs parent golden outputs (blocks silent drift).
7. **Verification-spine self-eval** — `harbor` scores capabilities; a PR may NOT lower any proof score.
8. **Performance budgets** — latency / memory / cost thresholds; fail on regression.
9. **Scalability smoke** — concurrency/load on changed capabilities; no resource leaks.
10. **Isolation invariants** — prove no capability escapes its permission boundary.
11. **E2E golden missions** — a few full missions run in an ephemeral preview (`codesandbox` / `coolify`).
12. **Dynamic security (pre-release/nightly)** — `strix` / `hexstrike` against the preview deploy.

**Pipeline flow:**
`PR → fast gates (build/lint/unit) → security + fidelity → perf + scale → ephemeral preview + E2E → all green → human review → merge → canary deploy → auto-rollback on regression → promote`

**Branch protection (non-negotiable):** no direct push to `main` · all checks required green · ≥1 review · signed commits · linear history · every capability change updates its manifest + golden tests.

**Tooling map (from our own repos):** ast-grep = static rules · claude-code-security-review = AI diff review · harbor = eval/fidelity/regression scoring · strix/hexstrike = dynamic security · codesandbox = ephemeral test envs · coolify = preview deploys · gitnexus = PR impact analysis · git-worktree-runner = parallel isolated test runs.

---

*This file is the single source of truth for the build. If a decision here conflicts with an old plan, this wins. Update it as fates change.*
