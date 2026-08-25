import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — plain .mjs script, no types, intentionally shared with CI
import { absentGates, renderSummary } from "../../scripts/gate-coverage.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/gauntlet.yml"), "utf8");

/**
 * One fact, one place.
 *
 * The absent-gates list lived in CI_STATUS.md AND inline in gauntlet.yml. The
 * copy went stale: for a day after K4 landed, every run printed "gate 10 ·
 * isolation invariants | no sandbox" while 24 assertions enforced it. That was
 * the second time a fact existed twice here and the duplicate was the one that
 * lied. These tests make the third time fail loudly instead.
 */

describe("the gauntlet's coverage summary has exactly one source", () => {
  it("parses the absent-gates table out of CI_STATUS.md", () => {
    const gates = absentGates();
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(g.gate, "every row needs a gate number").toMatch(/^\d+$/);
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.blockedOn.length, `gate ${g.gate} must say what blocks it`).toBeGreaterThan(0);
    }
  });

  it("does NOT list a gate that is already enforced", () => {
    const numbers = absentGates().map((g) => g.gate);
    // K4 shipped; gate 10 runs inside `unit`. This is the exact row that lied.
    expect(numbers, "gate 10 is enforced — it must not appear as absent").not.toContain("10");
  });

  it("keeps no second copy of the list inside the workflow", () => {
    // A hardcoded row looks like: | 7 · verification self-eval | ... |
    const inlineRows = WORKFLOW.match(/\|\s*\d+\s*·[^|]+\|/g) ?? [];
    expect(
      inlineRows,
      `gauntlet.yml restates the gate list (${inlineRows.join(", ")}). It must call ` +
        "scripts/gate-coverage.mjs so CI_STATUS.md stays the only source.",
    ).toEqual([]);
  });

  it("the workflow actually invokes the generator", () => {
    expect(WORKFLOW).toContain("scripts/gate-coverage.mjs");
  });

  it("renders every absent gate into the summary it publishes", () => {
    const summary = renderSummary(false);
    for (const g of absentGates()) expect(summary).toContain(g.name);
    expect(summary).toContain("Generated from `CI_STATUS.md`");
  });

  it("reports gate 4 honestly when the AI review was skipped", () => {
    expect(renderSummary(true)).toContain("Gate 4 (ai-review) was **skipped**");
    expect(renderSummary(false)).not.toContain("was **skipped**");
  });
});
