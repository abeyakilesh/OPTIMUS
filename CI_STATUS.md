# CI status — the honest ledger

`CLAUDE.md` specifies a 12-check gauntlet. **7 are live and can fail your PR
today. 5 are not implemented**, because there is nothing real for them to test
yet — and one gate exists that the build bible didn't ask for.

The five missing gates are deliberately *absent* from the pipeline rather than
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
| 2 | Unit + contract | `vitest` | any test fails | ✅ 7 tests passing |
| 3 | Static security | `gitleaks` · `npm audit` · `ast-grep` · CodeQL | secret, high CVE, rule match | ✅ **proved it fires** — planted a weak RSA key, exit 1; clean tree, exit 0 |
| 4 | AI security review | `claude-code-security-review` | finding on the diff, **or key unset** | ⚠️ needs `ANTHROPIC_API_KEY` |
| 5 | Licenses + SBOM | `cyclonedx` + `scripts/license-gate.mjs` | AGPL/GPL/SSPL/BUSL/Elastic enters the tree | ✅ **proved it fires** — 5 scenarios, incl. LGPL-3.0 correctly *allowed* and `MIT OR GPL-3.0-or-later` correctly blocked |
| 8 | Performance budgets | Lighthouse CI | a budget in `lighthouserc.json` regresses | ✅ **caught a real defect** — a11y was 0.92 vs the 0.95 budget; fixed to 1.00 |
| 11 | End-to-end | Playwright | landing page smoke fails | ✅ 6 tests passing — first real run caught a test that had rotted against rewritten copy |
| — | **Absorption guard** | `scripts/absorption-guard.mjs` | inflated score, missing breakdown, 2 repos in 1 PR, silently weakened gauntlet | ✅ **proved it fires** — 5 scenarios tested |

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
| 6 | Fidelity vs parent | Nothing absorbed yet, so no parent behaviour to diff | first repo clears Phase B |
| 7 | Verification self-eval | `harbor` not integrated | K5 exists |
| 9 | Scalability smoke | Nothing to load-test — static landing page | first real service surface |
| 10 | Isolation invariants | No sandbox to escape | K4 + codesandbox microVM |
| 12 | Dynamic security | No deployed preview to attack | ephemeral previews (coolify) |

Do not mark a capability AVAILABLE while a gate it depends on is on this list.

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

No repo absorbed. Every repo sits at **0/100** — valid and honest, meaning
"issue not opened". The first non-zero score requires a merged PR with real
fidelity evidence, and `absorption-guard.mjs` will reject the PR if the
arithmetic doesn't add up or Safety is claimed as partial credit.
