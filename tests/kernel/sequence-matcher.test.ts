/**
 * Direct fidelity proof for the SequenceMatcher port, independent of the
 * Scrapling composition — including the autojunk path (elements occupying
 * >1% of a 200+ length sequence get purged from matching), which none of
 * the Scrapling golden fixtures happen to be long enough to exercise.
 * Golden values are real `difflib.SequenceMatcher(None, a, b).ratio()`
 * output from CPython, not a re-derivation of the port's own logic.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stringRatio, sequenceRatio, SequenceMatcher } from "../../kernel/sequence-matcher";

interface GoldenCase {
  name: string;
  a: string;
  b: string;
  expected: number;
}

const golden: GoldenCase[] = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "kernel", "fixtures", "sequence-matcher-golden.json"), "utf8"),
);

describe("SequenceMatcher port fidelity vs CPython difflib", () => {
  for (const { name, a, b, expected } of golden) {
    it(`${name} — ratio matches difflib exactly`, () => {
      // Python floats print with full precision; JS float arithmetic on the
      // same rational values is bit-identical for these cases, so an exact
      // equality check is the right bar, not a tolerance.
      expect(stringRatio(a, b)).toBe(expected);
    });
  }

  it("covers the autojunk path — a case under 200 elements and a case at/over it", () => {
    expect(golden.some((c) => c.name.includes("autojunk-trigger"))).toBe(true);
    expect(golden.some((c) => c.name.includes("not-triggered"))).toBe(true);
  });
});

describe("SequenceMatcher — element-level sequences (tuples), not just characters", () => {
  it("scores tag-name paths the way Scrapling calls it: SequenceMatcher(None, path_a, path_b)", () => {
    const a = ["html", "body", "div", "span"];
    const b = ["html", "body", "section", "p"];
    // 2 of 4 elements unchanged in a run of 2 -> 2*2 / (4+4) = 0.5
    expect(sequenceRatio(a, b)).toBe(0.5);
  });

  it("is symmetric-length-normalised: identical arrays score 1", () => {
    expect(sequenceRatio(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("scores two empty sequences as 1 (matches CPython's ratio() on length 0)", () => {
    expect(sequenceRatio([], [])).toBe(1);
  });
});

describe("SequenceMatcher class — matching blocks", () => {
  it("finds the true longest common run, not just any common subsequence", () => {
    // "abcXYZdef" vs "123XYZ789": the only real overlap is "XYZ".
    const matcher = new SequenceMatcher(Array.from("abcXYZdef"), Array.from("123XYZ789"));
    // ratio must reflect exactly 3 matched chars out of 9+9.
    expect(matcher.ratio()).toBeCloseTo((2 * 3) / 18, 10);
  });
});
