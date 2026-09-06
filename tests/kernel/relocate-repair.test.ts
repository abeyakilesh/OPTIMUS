import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  relocateRepair,
  relocateFoundMatch,
  relocateContractHonored,
  scraplingRelocate,
  MIN_PERCENTAGE,
  MAX_RELAXATION,
  type RelocateInput,
} from "../../kernel/capabilities/scrapling-relocate";
import type { Observation, CheckResult, CheckContext } from "../../kernel/types";

/** Checks here are pure over their output; none reads the context. */
const noCtx = {} as CheckContext;

/**
 * The repair arc for scrapling.relocate. Mostly REFUSALS — what a repair
 * declines to do is what keeps it from turning a real defect into a green
 * step, and per THE MUTATION RULE each of these was run against a repair with
 * the relevant guard removed and observed to fail.
 */

const golden = JSON.parse(
  readFileSync(join("kernel", "fixtures", "scrapling-golden.json"), "utf8"),
) as { cases: Array<{ name: string; originalFingerprint: Record<string, unknown>; candidateHtml: string; expectedScore: number }> };

const caseNamed = (n: string) => {
  const c = golden.cases.find((x) => x.name === n);
  if (!c) throw new Error(`golden case "${n}" is gone — this test is no longer testing what it says`);
  return c;
};

function obs(output: unknown, ok = true): Observation {
  return { ok, output, durationMs: 1, cost: 1 };
}
const passed = (id: string): CheckResult => ({ checkId: id, passed: true, reason: "ok" });
const failed = (id: string, reason: string): CheckResult => ({ checkId: id, passed: false, reason });

const input = (percentage: number): RelocateInput => ({
  fingerprint: { tag: "div", attributes: { class: "price" }, text: "$899", path: ["html", "body", "div"] } as never,
  pageHtml: "<div class='cost'>$899</div>",
  percentage,
});

describe("relocate.foundMatch — the mission's question, not the contract's", () => {
  it("fails when nothing was located, even though the capability was honest", async () => {
    // This is the whole reason the check exists. contractHonored PASSES here:
    // reporting found=false with a sub-threshold score is truthful. Without a
    // separate goal check, a missed relocation never fails, and a repair
    // attached to it would never run.
    const out = { found: false, score: 66.5, percentage: 80, matches: [], artifactId: "sha256:x" };
    const contract = await relocateContractHonored.run(out, noCtx);
    const goal = await relocateFoundMatch.run(out, noCtx);
    expect(contract.passed).toBe(true);
    expect(goal.passed).toBe(false);
    expect(goal.reason).toMatch(/best candidate was 66.5/);
  });

  it("names the threshold ACTUALLY APPLIED on success, so a relaxed find stays visible", async () => {
    const out = { found: true, score: 66.5, percentage: 66.5, matches: [{}], artifactId: "sha256:x" };
    const r = await relocateFoundMatch.run(out, noCtx);
    expect(r.passed).toBe(true);
    expect(r.reason).toMatch(/threshold applied: 66\.5/);
    // It must NOT be possible to read this as having cleared the original 80.
    expect(r.reason).not.toMatch(/\b80\b/);
  });
});

describe("relocateRepair refuses the dangerous cases", () => {
  it("never yields a repair when the contract check failed — the capability lied", () => {
    // BEHAVIOURAL assertion, deliberately not a claim about which guard does
    // it. Mutation-testing showed the explicit contract branch is unreachable:
    // this case is caught by the found-guard, and the found=false form of a
    // contract violation (score >= percentage) forces next >= current and
    // declines there. The invariant that matters is that no contract violation
    // is ever "repaired" into a green step — that holds, and this test pins
    // the behaviour rather than crediting a branch it does not exercise.
    const out = { found: true, score: 55, percentage: 80, matches: [{}], artifactId: "x" };
    const r = relocateRepair(input(80), obs(out), [
      failed("relocate.contractHonored", "claimed found=true at score 55, below its own threshold 80"),
      failed("relocate.foundMatch", "irrelevant"),
    ]);
    expect(r).toBeUndefined();
  });

  it("refuses when the element was already found", () => {
    const out = { found: true, score: 90, percentage: 80, matches: [{}], artifactId: "x" };
    expect(relocateRepair(input(80), obs(out), [passed("relocate.contractHonored")])).toBeUndefined();
  });

  it("refuses to descend below the measured noise floor", () => {
    // The golden fixture's unrelated-element scores 49.63, so anything at or
    // under ~50 is indistinguishable from a wrong answer.
    const out = { found: false, score: 45, percentage: 60, matches: [], artifactId: "x" };
    expect(relocateRepair(input(60), obs(out), [passed("relocate.contractHonored")])).toBeUndefined();
  });

  it("refuses to relax further than MAX_RELAXATION in one step", () => {
    // Asked for 95, best candidate 70. The bounded floor is 80, which 70
    // cannot reach, so the honest answer is to fail rather than hand back a
    // match 25 points below what was asked for.
    const out = { found: false, score: 70, percentage: 95, matches: [], artifactId: "x" };
    expect(relocateRepair(input(95), obs(out), [passed("relocate.contractHonored")])).toBeUndefined();
  });

  it("gives the DEFAULT threshold no repair at all — 40 is already under the floor", () => {
    // A deliberate, uncomfortable consequence: Scrapling's own default of 40
    // sits below the noise level its fixtures demonstrate, so there is nothing
    // safe to relax to and the step fails honestly instead.
    const out = { found: false, score: 38, percentage: 40, matches: [], artifactId: "x" };
    expect(relocateRepair(input(40), obs(out), [passed("relocate.contractHonored")])).toBeUndefined();
  });

  it("refuses when the attempt did not even run", () => {
    expect(relocateRepair(input(80), obs(undefined, false), [])).toBeUndefined();
  });

  it("refuses when it would make no progress", () => {
    // score equals the current threshold, so the "relaxed" value is the same
    // number — retrying would re-derive an identical result and burn budget.
    const out = { found: false, score: 80, percentage: 80, matches: [], artifactId: "x" };
    expect(relocateRepair(input(80), obs(out), [passed("relocate.contractHonored")])).toBeUndefined();
  });
});

describe("relocateRepair adapts where it is safe to", () => {
  it("lowers the threshold to exactly the score observed — informed, not blind", () => {
    const out = { found: false, score: 72.4, percentage: 85, matches: [], artifactId: "x" };
    const r = relocateRepair(input(85), obs(out), [passed("relocate.contractHonored")]) as RelocateInput;
    expect(r).toBeDefined();
    expect(r.percentage).toBe(72.4);
    // It carries the original fingerprint and html through unchanged: the
    // repair changes the question's tolerance, never its subject.
    expect(r.fingerprint).toEqual(input(85).fingerprint);
    expect(r.pageHtml).toBe(input(85).pageHtml);
  });

  it("respects both bounds simultaneously", () => {
    expect(MIN_PERCENTAGE).toBe(50);
    expect(MAX_RELAXATION).toBe(15);
    // 62 is inside MAX_RELAXATION of 70 and above the floor -> allowed.
    const ok = relocateRepair(input(70), obs({ found: false, score: 62, percentage: 70, matches: [], artifactId: "x" }), [
      passed("relocate.contractHonored"),
    ]) as RelocateInput;
    expect(ok.percentage).toBe(62);
  });
});

describe("end to end: a real relocation, repaired", () => {
  it("fails at 80, relaxes to the real score, and reports the RELAXED threshold", async () => {
    // Uses the real ported engine and a real golden fixture — the
    // site-redesign case, which genuinely scores 66.5.
    const c = caseNamed("site-redesign-price-tag");
    // The FULL fingerprint. A first draft passed only tag/attributes/text/path
    // and scored 49.75 instead of 66.5 — parent and sibling context are real
    // contributors, and dropping them quietly changes what is being measured.
    const g = c.originalFingerprint as Record<string, never>;
    const fingerprint = {
      tag: g.tag,
      attributes: g.attributes,
      text: g.text,
      path: g.path,
      parentName: g.parent_name,
      parentAttribs: g.parent_attribs,
      parentText: g.parent_text,
      siblings: g.siblings,
      children: g.children,
    } as never;

    const artifacts: string[] = [];
    const ctx = {
      putArtifact: async (d: string) => { artifacts.push(d); return `sha256:${artifacts.length}`; },
    } as never;

    const first = (await scraplingRelocate.run(
      { fingerprint, pageHtml: c.candidateHtml, percentage: 80 },
      ctx,
    )) as { found: boolean; score: number; percentage: number };

    expect(first.found).toBe(false);
    expect(first.score).toBeCloseTo(c.expectedScore, 1);
    expect((await relocateFoundMatch.run(first, noCtx)).passed).toBe(false);

    const repaired = relocateRepair({ fingerprint, pageHtml: c.candidateHtml, percentage: 80 }, obs(first), [
      passed("relocate.contractHonored"),
    ]) as RelocateInput;
    expect(repaired.percentage).toBeCloseTo(c.expectedScore, 1);

    const second = (await scraplingRelocate.run(repaired, ctx)) as {
      found: boolean; score: number; percentage: number;
    };

    expect(second.found).toBe(true);
    expect((await relocateFoundMatch.run(second, noCtx)).passed).toBe(true);
    // The anti-fake assertion: the successful output must report the RELAXED
    // threshold. If it echoed 80, the evidence would read as though the match
    // cleared the bar the caller actually set.
    expect(second.percentage).toBeCloseTo(c.expectedScore, 1);
    expect(second.percentage).not.toBe(80);
    // And the contract still holds at the relaxed bar.
    expect((await relocateContractHonored.run(second, noCtx)).passed).toBe(true);
  });
});
