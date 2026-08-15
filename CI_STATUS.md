# CI status — the honest ledger

`CLAUDE.md` specifies a 12-check gauntlet. **7 of the 12 are live and can fail
your PR today. 5 are not implemented**, because there is nothing real for them
to test yet.

They are deliberately *absent* from the workflow rather than stubbed green.
A gate that always passes is worse than no gate: it manufactures confidence.
This is Prime Directive #4 applied to CI — if a check isn't really running,
never render it as passing.

## Live gates — these block a merge

| # | Gate | Tool | Fails when |
|---|---|---|---|
| 1 | Build · typecheck · lint | `next build`, `tsc --noEmit`, `eslint` | compile error, type error, lint error |
| 2 | Unit + contract tests | `vitest` | any test fails |
| 3 | Static security | `gitleaks` · `npm audit` · `ast-grep` | a secret, a high/critical CVE, or any of the 554 structural rules matching |
| 4 | AI security review | `claude-code-security-review` | a finding on the diff — **or if `ANTHROPIC_API_KEY` is unset** |
| 5 | Licenses + SBOM | `license-checker` · `cyclonedx` | an AGPL/GPL/SSPL/BUSL/Elastic dep enters the tree |
| 8 | Performance budgets | Lighthouse CI | a budget in `lighthouserc.json` regresses |
| 11 | End-to-end | Playwright | the landing page fails its smoke assertions |

## Not implemented — absent, not passing

| # | Gate | Blocked on | Unblocks when |
|---|---|---|---|
| 6 | Fidelity vs parent repo | No capability has been absorbed yet, so there is no parent behaviour to diff against | first repo completes Phase B of the onboarding pipeline |
| 7 | Verification self-eval | `harbor` is not integrated | K5 (verification spine) exists |
| 9 | Scalability smoke | Nothing to load-test — the app is a static landing page | first real service surface ships |
| 10 | Isolation invariants | No sandbox to escape | K4 (execution scheduler) + codesandbox microVM land |
| 12 | Dynamic security | No deployed preview to attack | ephemeral preview deploys exist (coolify/codesandbox) |

Each one becomes a required check the moment its blocker clears. Do not mark a
capability AVAILABLE while a gate it depends on is on this list.

## Setup still required by a human

These cannot be done from the repo and need you in the GitHub UI:

1. **`ANTHROPIC_API_KEY` secret** — Settings → Secrets and variables → Actions.
   Until it's set, gate 4 fails every PR **on purpose**.
2. **Branch protection on `main`** — see `.github/branch-protection.md`.
   Cannot be enabled until `main` exists on the remote with at least one run of
   the gauntlet, so GitHub knows the check names.

## Absorption score

No repo has been absorbed. Every repo on the list is at **0/100** — which is a
valid, honest score meaning "issue not opened yet", per the rubric in
`CLAUDE.md`. The first score above zero requires a merged PR with fidelity
evidence.
