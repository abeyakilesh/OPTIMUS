# Branch protection — `main`

Cannot be set from the repo; it needs the GitHub API or UI.

```bash
gh api -X PUT repos/abeyakilesh/OPTIMUS/branches/main/protection \
  --input .github/branch-protection.json
```

> ## ⚠️ This file was written, and then nobody ran the command
>
> For **38 pull requests**, `GET /branches/main/protection` returned **404** and
> `/rulesets` returned `[]`. Everything below was true, clearly written, believed
> to be in force, and enforcing nothing. Merges were gated by discipline.
>
> Nothing bad happened — every merged PR was green — which is exactly why it is
> worth naming rather than quietly fixing. It is the first of the three cases
> behind **THE ENFORCEMENT RULE** in `CLAUDE.md`: *a rule that isn't executed by
> something is a comment.*

## Repository visibility is part of this config

> **This repository must stay PUBLIC, and that is a security decision, not a
> default.** Making it private silently deletes the protection described in
> this file.

On 2026-08-25 the repo was switched to private. Nothing announced a change.
Nothing turned red. The Actions gauntlet kept running and kept passing. What
actually happened, measured the same day:

| | Private (GitHub Free) | Public |
|---|---|---|
| Branch protection | ❌ `403 Upgrade to GitHub Pro or make this repository public` | ✅ applied |
| Rulesets (the documented alternative) | ❌ same 403 | ✅ available |
| `git push origin main` | ❌ **succeeded** | ✅ `GH006 ... hook declined` |
| CodeQL | ❌ `Code scanning is not enabled for this repository` | ✅ passes |
| Actions minutes | 2,000/month | unlimited |

Two things make this worse than an ordinary misconfiguration:

1. **It reads as a security improvement.** "Make the repo private" is the
   intuitive hardening step, and it is the one that removed the gate.
2. **The workflows still ran and still went green**, so every surface a person
   checks kept saying the gauntlet was working. The only way to see it was to
   ask the API, or to push to `main` and watch it land.

GitHub Pro (~$4/mo) restores branch protection on a private repo. It does
**not** restore CodeQL — code scanning on private repos needs Advanced
Security, which Pro does not include. So public is currently the only
configuration in which every gate in `gauntlet.yml` is load-bearing.

**enforced by:** `.github/workflows/gauntlet.yml` → the `gate coverage (read me)`
job, step *"Repository must be public, or the gauntlet is advisory"*. It reads
`repos/{owner}/{repo}.private` with the default `GITHUB_TOKEN` and fails the
build if it is not `false`. That job is one of the 11 required contexts, so a
private repo now blocks every PR instead of quietly un-arming the gate.

It checks the **cause** (visibility), not the symptom (a 404 from the
protection endpoint), because reading branch protection needs admin scope and
`GITHUB_TOKEN` does not have it. Two honest limits: it cannot fire on the
settings change itself, only on the next PR; and it cannot detect protection
being deleted directly while the repo stays public. Both are narrower gaps
than the one that let a push to `main` land unnoticed.

## Applying it is not verifying it

A session that runs the command and closes the issue has repeated the original
mistake one level up — intent, recorded, unverified. Work the checklist:

- [x] `gh api -X PUT ... --input .github/branch-protection.json` succeeds
- [x] `gh api repos/abeyakilesh/OPTIMUS/branches/main/protection` returns the
      config, not a 404
- [x] An open PR with everything green still reports `mergeStateStatus: CLEAN`
      — i.e. the required-contexts list names checks that **actually report**.
      A typo'd context name blocks every PR forever and looks identical to
      "the gate is working". *(#47, 2026-08-25: `CLEAN`, merged.)*
- [x] A direct `git push origin main` is **refused**
      *(`GH006: Protected branch update failed` · `11 of 11 required status
      checks are expected` — 2026-08-25, re-verified after the rebuild below.)*
- [x] A deliberately-red PR is **refused** — the only test that proves the
      required checks are load-bearing rather than decorative *(#42, `BLOCKED`.)*
- [x] `e2e` / `perf`, which skip via change detection, do not leave a PR
      pending. *(Both reported `SKIPPED` on #47 and it still merged. They stay
      OUT of the required list regardless — a skipped job satisfying a required
      check is a behaviour, not a guarantee we want to lean on.)*

All six are now ticked, and every one of them was re-verified on 2026-08-25
**after** the protection was destroyed and rebuilt (see below). A tick that
predates a teardown is not evidence about what exists now.

## Non-negotiables (from CLAUDE.md)

The **Live** column is the value `GET /branches/main/protection` actually
returns. Two rows used to state an intent in the Value column and read as
though it were in force; per THE ENFORCEMENT RULE they now say what is true.

| Setting | Intended | Live | Why |
|---|---|---|---|
| Direct push to `main` | blocked | ✅ blocked | every change goes through the gauntlet |
| Required checks | all Gauntlet jobs | ✅ 11 contexts | nothing merges red |
| Required reviews | ≥ 1 | ⚠️ **0 — UNENFORCED** | unsatisfiable solo: GitHub forbids approving your own PR, so requiring 1 makes every PR admin-bypass-only. Raise to 1 the day a second person gets write access |
| Dismiss stale reviews | on | ✅ on | approval must apply to the code that merges |
| Linear history | required | ✅ required | absorption history stays readable |
| Signed commits | required | ⚠️ **false — UNENFORCED, blocked on #39** | enabling it before `commit.gpgsign` is configured rejects every push including the fix |
| Force push / deletion | blocked | ✅ blocked | |
| Enforce for admins | on | ✅ on | the rules apply to you too |
| Conversation resolution | required | ✅ required | review threads close before merge |

## Still to do

- **Pin actions to commit SHAs.** They currently use version tags. Dependabot
  is configured to rewrite them to SHAs. Until that lands, a compromised tag
  on a third-party action could run in CI.
- **`ANTHROPIC_API_KEY`** — gate 4 fails every PR until this secret exists.
  That is deliberate; do not remove the gate to make CI green.
- **Flip `harden-runner` from `audit` to `block`** once the audit logs show
  the real egress allow-list.
