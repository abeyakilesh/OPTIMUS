import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * The build bible is deliberately NOT tracked in this repo.
 *
 * It was tracked from PR #35 — so that changing a rule cost the same review as
 * changing code — and untracked again on 2026-08-25 at the owner's decision,
 * to keep it out of the repository. Both directions were deliberate; this file
 * asserts whichever one is current, and right now that is "absent".
 *
 * These tests replace an earlier set that asserted the OPPOSITE (that the file
 * was present and held the bible). Those tests are gone rather than skipped,
 * because a skipped test asserting a reversed decision is a trap for whoever
 * reads it next.
 */

function tracked(path: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("the build bible stays out of this repository", () => {
  it("is not tracked by git", () => {
    // The check that actually matters. `git rm --cached` without a .gitignore
    // entry leaves the file untracked in the working tree, where the next
    // `git add -A` commits it straight back.
    expect(tracked("CLAUDE.md"), "CLAUDE.md must not be tracked — see .gitignore").toBe(false);
  });

  it("is ignored, not merely untracked", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    const entries = gitignore
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(entries, ".gitignore needs a CLAUDE.md entry, or an `add -A` re-commits it").toContain("CLAUDE.md");
  });

  it("keeps AGENTS.md tracked — it is generated tooling, not the bible", () => {
    // AGENTS.md is written by `next dev` and carries no project decisions.
    // Sweeping it out alongside CLAUDE.md would lose real, regenerating rules.
    expect(tracked("AGENTS.md")).toBe(true);
  });
});
