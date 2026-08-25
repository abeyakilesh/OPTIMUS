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

## Applying it is not verifying it

A session that runs the command and closes the issue has repeated the original
mistake one level up — intent, recorded, unverified. Work the checklist:

- [ ] `gh api -X PUT ... --input .github/branch-protection.json` succeeds
- [ ] `gh api repos/abeyakilesh/OPTIMUS/branches/main/protection` returns the
      config, not a 404
- [ ] An open PR with everything green still reports `mergeStateStatus: CLEAN`
      — i.e. the required-contexts list names checks that **actually report**.
      A typo'd context name blocks every PR forever and looks identical to
      "the gate is working"
- [ ] A direct `git push origin main` is **refused**
- [ ] A deliberately-red PR is **refused** — the only test that proves the
      required checks are load-bearing rather than decorative
- [ ] `e2e` / `perf`, which skip via change detection, do not leave a PR
      pending. Only then consider adding them to the required list

Until the red-PR check is done, this is applied-but-unproven, which is a better
state than 404 and not the same as done.

## Non-negotiables (from CLAUDE.md)

| Setting | Value | Why |
|---|---|---|
| Direct push to `main` | blocked | every change goes through the gauntlet |
| Required checks | all Gauntlet jobs | nothing merges red |
| Required reviews | ≥ 1 | Directive 6 — one repo, one reviewed PR |
| Dismiss stale reviews | on | approval must apply to the code that merges |
| Linear history | required | absorption history stays readable |
| Signed commits | required | provenance |
| Force push / deletion | blocked | |
| Enforce for admins | on | the rules apply to you too |

## Still to do

- **Pin actions to commit SHAs.** They currently use version tags. Dependabot
  is configured to rewrite them to SHAs. Until that lands, a compromised tag
  on a third-party action could run in CI.
- **`ANTHROPIC_API_KEY`** — gate 4 fails every PR until this secret exists.
  That is deliberate; do not remove the gate to make CI green.
- **Flip `harden-runner` from `audit` to `block`** once the audit logs show
  the real egress allow-list.
