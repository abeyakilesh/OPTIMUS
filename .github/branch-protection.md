# Branch protection — `main`

Cannot be set from the repo; it needs the GitHub API or UI. Run this **after**
the first Gauntlet run on `main`, so GitHub knows the check names.

```bash
gh api -X PUT repos/abeyakilesh/OPTIMUS/branches/main/protection \
  --input .github/branch-protection.json
```

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
