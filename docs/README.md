# OPTIMUS docs

Read in this order.

| Doc | Answers |
|---|---|
| [`PRD.md`](PRD.md) | What is OPTIMUS, who is it for, what does v0.1 actually do, what is explicitly out |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Every functional + non-functional requirement, each with its test and CI gate |
| [`COST_MODEL.md`](COST_MODEL.md) | What it costs you at 1 user and at 1,000 — with the arithmetic |
| [`WORK_PACKAGES.md`](WORK_PACKAGES.md) | What gets built next, and the acceptance criteria |
| [`adr/`](adr/) | Decisions that would be expensive to reverse, and their downsides |
| [`../CI_STATUS.md`](../CI_STATUS.md) | Which gates are real today and which are absent |
| `../CLAUDE.md` (workspace root) | The build bible — fates, 16 gates, absorption scoring, execution model |

## The two rules these documents exist to enforce

1. **No criterion may be satisfied by something that renders.** SDE-Atlas
   marked WP-001 done on `[x] Health score ring displays 92/100` while listing
   real analysis as a non-goal. Every requirement here names the test that
   fails when it is violated.

2. **Unverified means unverified.** A requirement whose CI gate is not yet live
   cannot be reported as met. `CI_STATUS.md` is the source of truth, and 5 of
   12 gates are currently absent by design rather than stubbed green.
