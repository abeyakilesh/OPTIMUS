# CI status — the honest ledger

`CLAUDE.md` specifies a 12-check gauntlet. **7 are live and can fail your PR
today. 4 are not implemented**, because there is nothing real for them to test
yet — and one gate exists that the build bible didn't ask for.

The four missing gates are deliberately *absent* from the pipeline rather than
stubbed green. A gate that always passes is worse than no gate: it manufactures
confidence. That is Prime Directive #4 applied to CI.

## Structure

Modelled on the deepest pipelines in the workspace (n8n · 85 workflows,
langflow · 49, supabase · 47, Stirling-PDF · 42):

```
.github/
  actions/
    setup/         composite — harden runner, Node, caches, npm ci
    ci-filter/     composite — change detection (dorny/paths-filter)
  workflows/
    gauntlet.yml            orchestrator · the one required check
    _build.yml              ┐
    _unit.yml               │
    _static-security.yml    │ reusable (workflow_call), each independently
    _supply-chain.yml       │ runnable and testable
    _e2e.yml                │
    _perf.yml               │
    _ai-review.yml          │
    _absorption-guard.yml   ┘ OPTIMUS-specific
    nightly.yml             scheduled deep scans
    scorecard.yml           OSSF supply-chain posture
scripts/absorption-guard.mjs
```

Techniques adopted from those repos: **reusable workflows** (117 of the 927
workflows on disk use `workflow_call`), **composite actions** (104),
**`step-security/harden-runner`** egress control, **change detection**,
**`merge_group`** for merge queues, per-job least-privilege `permissions:`,
and `timeout-minutes` on every job.

## Live gates — these block a merge

| # | Gate | Tool | Fails when | Verified? |
|---|---|---|---|---|
| 1 | Build · typecheck · lint | `next build`, `tsc --noEmit`, `eslint` | compile/type/lint error | ✅ runs clean locally |
| 2 | Unit + contract | `vitest` | any test fails | ✅ passing — the count lives in the job output, not here (see note below) |
| 3 | Static security | `gitleaks` · `npm audit` · `ast-grep` · CodeQL | secret, high CVE, rule match | ✅ **proved it fires** — planted a weak RSA key, exit 1; clean tree, exit 0 |
| 4 | AI security review | `claude-code-security-review` | finding on the diff, **or key unset** | ⚠️ needs `ANTHROPIC_API_KEY` |
| 5 | Licenses + SBOM | `cyclonedx` + `scripts/license-gate.mjs` | AGPL/GPL/SSPL/BUSL/Elastic enters the tree | ✅ **proved it fires** — 5 scenarios, incl. LGPL-3.0 correctly *allowed* and `MIT OR GPL-3.0-or-later` correctly blocked |
| 8 | Performance budgets | Lighthouse CI | a budget in `lighthouserc.json` regresses | ✅ **caught a real defect** — a11y was 0.92 vs the 0.95 budget; fixed to 1.00 |
| 11 | End-to-end | Playwright | landing page smoke fails, **or any kernel change breaks the real surface** | ✅ passing — first real run caught a test that had rotted against rewritten copy |
| — | **Absorption guard** | `scripts/absorption-guard.mjs` | inflated score, missing breakdown, 2 repos in 1 PR, silently weakened gauntlet | ✅ **proved it fires** — 5 scenarios tested |

### Why there are no test counts in that table

There were: "7 tests passing" and "6 tests passing". By the time anyone read
them they said 213 and 19. Nobody edited them wrong — they were right when
written and rotted in place.

This is the corollary in CLAUDE.md's SELF-DESCRIPTION RULE: single-sourcing
stops two copies diverging from each other, and does nothing about the one
remaining copy going stale against reality. Gate 6's blocker had gone stale the
same way, inside this same file, and was found only because the gate list was
being consolidated *into* it.

A number that is recomputed on every run belongs where it is computed. The job
output has it; this table says whether the gate is live.

## Correction: the rule count is 184, not 554

`CLAUDE.md` says ast-grep-essentials provides "554 structural code rules". That
figure counts every `.yml` in the repo — rules **plus their test fixtures plus
config**. The real numbers:

| | Count |
|---|---|
| `.yml` files in the upstream repo | 554 |
| **Actual rules** (`rules/`) | **184** |
| Rules that apply to this repo today (JS/TS/HTML) | **14** |
| Staged for later (`.rules-staged/`) — python, java, go, ruby, c/cpp, rust, c#, swift, kotlin, php, scala | 170 |

The staged rules activate as engines in those languages get bundled. They are
not deleted, just not scanned, because scanning rules for languages the repo
doesn't contain is noise that trains people to ignore the gate.

**87 of the vendored rules also had to be repaired**: they used utility ids
containing reserved characters (`PATTERN_require("crypto")`), which the current
ast-grep CLI rejects outright — the scanner refused to start. Ids were
sanitized to valid identifiers; rule logic is unchanged.

## Not implemented — absent, not passing

| # | Gate | Blocked on | Unblocks when |
|---|---|---|---|
| 6 | Fidelity vs parent | No golden-output diff harness — the 3 absorbed repos assert fidelity inside the unit suite, per capability, not as a CI gate | a diff harness exists that can fail a PR on drift |
| 7 | Verification self-eval | `harbor` not integrated | K5 exists |
| 9 | Scalability smoke | Nothing to load-test — static landing page | first real service surface |
| 12 | Dynamic security | No deployed preview to attack | ephemeral previews (coolify) |

Do not mark a capability AVAILABLE while a gate it depends on is on this list.

### Gate 10 · isolation invariants — implemented 2026-08-24

Was listed here as *"blocked on K4 + codesandbox microVM."* The microVM half is
gone: codesandbox-client is GPL and is now a read-only FIXTURE (see CLAUDE.md's
RE-FATED table), so K4 was built local-first instead — a declared blast radius
per capability, enforced at the one door K2 already owned.

It runs inside `unit / unit + contract` (`tests/kernel/sandbox.test.ts`, 22
assertions) rather than as its own pipeline job, because it is in-process and
needs no environment. **Scoped honestly** — what it does and does not prove:

| Enforced and tested | Not enforced |
|---|---|
| filesystem read/write confined to declared roots, symlinks resolved first | a child process's own syscalls, once spawned |
| network host allow-list, exact match, no wildcards, `file://` refused | a child process's own network egress |
| child environment stripped to a neutral base + explicit allow-list | |
| child working directory pinned | |
| broker refuses any permission whose radius is unbounded | |

The right-hand column is why `browser.navigate` declares
`unconfinedChildEgress: true` and scores **3/5**, not 5/5, on sandbox. An
admitted gap the broker can see beats a silent one.

All four guards were mutation-tested: re-opening the environment leak, dropping
symlink resolution, removing the host check, and loosening the broker rule each
made the suite fail, and each file was restored byte-identical afterward.

## Operating note · `gh run rerun` replays a STALE payload

`gh run rerun --failed` re-runs the jobs against the **original webhook
payload**, not the PR's current state. Editing a PR body and re-running does
not re-evaluate the new body — the absorption guard kept failing on a blank
template that had already been replaced, and passed locally the whole time.

Only a fresh `pull_request` event (a push) re-reads the PR. Recorded here
because it costs an hour to rediscover and looks exactly like a broken gate.

## Gate 4 · scoped away from dependency bots

Gate 4 does **not** run on PRs opened by `dependabot[bot]`. Recorded here so it
is a decision, not a surprise:

- A bot PR's diff is a **lockfile**. The two risks it can carry are a known CVE
  and a forbidden licence. Both already have dedicated, deterministic, free
  gates that *do* run on those PRs — `dependency CVEs` (gate 3) and
  `licenses + SBOM` (gate 5). An LLM reading a version number proves nothing
  those two haven't already proven.
- GitHub deliberately withholds Actions secrets from Dependabot. Running the
  gate there would mean copying a model key into the Dependabot secret scope
  and spending quota to re-check an already-proven diff. That quota is the same
  free-tier budget the product itself runs on (ADR-0002, BYOK).
- A permanently red check on every routine bump teaches people to ignore red.
  That is how a gauntlet actually dies.

**Every human- and agent-authored PR still gets the full AI review.** The run
summary prints which gates actually executed, so a skipped gate can never read
as an enforced one.

## Gate 3 · CodeQL

CodeQL's `analyze` step was failing at SARIF upload with *"Code scanning is
not enabled for this repository."* That was never a code defect: code scanning
on a **private** repo requires GitHub Advanced Security, and is free only on
public ones.

**Resolved 2026-08-23 by making the repository public.** Code scanning must
still be switched on once under Settings → Code security → Code scanning; after
that the gate runs on every PR at no cost.

All four static-security layers are then live: CodeQL, ast-grep (14 active
rules), gitleaks, and dependency CVEs.

## Human setup still required

1. **One model key** → Settings → Secrets and variables → Actions. Gate 4
   fails every PR until then, **on purpose**. It does *not* need a paid
   Anthropic key: `GROQ_API_KEY`, `GEMINI_API_KEY` or `MISTRAL_API_KEY` all
   work, routed through the bundled OmniRoute gateway on loopback. Any one
   of the four is enough.
2. **Branch protection** → `.github/branch-protection.md`. Needs one Gauntlet
   run on `main` first so GitHub knows the check names.
3. **Labels** → `npx github-label-sync --labels .github/labels.yml abeyakilesh/OPTIMUS`
4. **Pin actions to SHAs** — currently version tags. Dependabot is configured
   to rewrite them.
5. **Flip `harden-runner` to `block`** once audit logs reveal the real egress
   allow-list.

## Absorption score

> **This paragraph used to read "No repo absorbed. Every repo sits at 0/100."**
> Three were absorbed. It is the second stale claim found in this file (gate 6's
> blocker was the first, #34) and the reason THE SELF-DESCRIPTION RULE exists:
> a single source still needs its own freshness check.

**Rubric changed 2026-08-25 (#40):** Safety is now **30** across six boundaries
— permission · sandbox · **input** · verify · log · rollback — and Integration
is **10**. Gate 8's input contract moved from Integration ("is it declared") to
Safety ("does it hold"). A relocation, not an addition: the total is still 100.
Enforced by `scripts/absorption-guard.mjs` + `tests/unit/absorption-guard.test.ts`.

| Capability | Fate | Last recorded | Where recorded | Input boundary (new) |
|---|---|---|---|---|
| `llm.chat` (OmniRoute) | SERVICE | **51/100** — F 10/35 · S 15/25 · R 7/15 · I 15/15 · P 4/10 | PR #20, reaffirmed #27 | ✅ `baseUrl` is `kind: "url"`, host list identical to its isolation |
| `browser.navigate` (browser-use) | SERVICE | **48/100** (no component breakdown in the PR body) | PR #18 | ✅ `pythonExecutable` + `chromeExecutablePath` are `kind: "executable"` with allow-lists |
| `scrapling.relocate` | PORT | **18/100** (no component breakdown in the PR body) | PR #15, #16 | ✅ parent fingerprint mirrored field-by-field |

**These totals are NOT current, and that is the honest state.** Safety reached
25/25 for all three in #28–#32, and no PR since restated a full breakdown. The
numbers above are the last ones actually *written down*, with their source — not
a recomputation, and not to be quoted as today's score.

**Why they were this hard to find.** Scores live only in merged PR bodies, in
three different formats, several superseded by later PRs. There was no
current-state record anywhere in the repo, which means the bible's rule that *"a
score may go down"* had nowhere to be written. This table is that place; it is
now the single source, and it inherits the corollary above — it needs its own
freshness check, or it becomes the next stale claim in this file.

**Recomputation under the new rubric is outstanding (#52).** A capability with
full Integration marks loses 5 there and earns 5 back under `input` **only if
its contract actually constrains its dangerous field**. All three do (checked in
code, right-hand column), so all three are expected to be net zero — but
"expected" is not "computed", and this file does not get to round that up.
