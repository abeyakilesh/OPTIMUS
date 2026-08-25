import { describe, it, expect } from "vitest";

/**
 * TEMPORARY. Exists only to prove the branch-protection required checks are
 * load-bearing rather than decorative — the last item on the checklist in
 * .github/branch-protection.md. Deleted as soon as the PR is confirmed BLOCKED.
 */
describe("branch protection probe", () => {
  it("fails on purpose so the unit gate goes red", () => {
    expect("the gauntlet").toBe("actually enforcing");
  });
});
