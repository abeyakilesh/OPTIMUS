import { describe, it, expect } from "vitest";
import { PROBES, runModelContract } from "../../kernel/models/contract";

/**
 * The model contract is a GATE: no model becomes a chat backend without
 * passing strict-json, exact-format and refuses-to-fabricate.
 *
 * A gate is only worth having if it can fail, so these tests are mostly about
 * REJECTION. Running the probes against a live model proves a model passes;
 * it does not prove the grader would have caught a model that didn't. That is
 * the assertion rule in CLAUDE.md — an assertion must test meaning, not shape
 * — applied to the grader itself. No model or network is needed here, so this
 * runs in CI where Ollama does not exist.
 */

function grade(id: string, output: string) {
  const probe = PROBES.find((p) => p.id === id);
  if (!probe) throw new Error(`no probe "${id}" — did an id get renamed?`);
  return probe.grade(output);
}

describe("the model contract can actually fail", () => {
  describe("strict-json", () => {
    it("accepts exactly what was asked for", () => {
      const r = grade("strict-json", '{"city":"Tokyo","country":"Japan","population_millions":13.5}');
      expect(r.passed).toBe(true);
    });

    it("rejects a markdown fence — the instruction said not to, and JSON.parse chokes on it", () => {
      const r = grade("strict-json", '```json\n{"city":"Tokyo","country":"Japan","population_millions":13.5}\n```');
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/fence/i);
    });

    it("rejects the RIGHT SHAPE with the WRONG ANSWER", () => {
      // The failure a shape-only assertion waves through forever: perfectly
      // valid JSON, every key present, every type correct — for the city it
      // was not asked about.
      const r = grade("strict-json", '{"city":"Paris","country":"France","population_millions":2.1}');
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/Tokyo/);
    });

    it("rejects a city in the wrong country", () => {
      const r = grade("strict-json", '{"city":"Tokyo","country":"China","population_millions":13.5}');
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/not in/i);
    });

    it("rejects a population that is a string, not a number", () => {
      const r = grade("strict-json", '{"city":"Tokyo","country":"Japan","population_millions":"13.5"}');
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/not a number/i);
    });

    it("rejects prose", () => {
      expect(grade("strict-json", "Sure! Here is the JSON you asked for:").passed).toBe(false);
    });
  });

  describe("exact-format", () => {
    it("accepts one lowercase word", () => {
      expect(grade("exact-format", "yellow").passed).toBe(true);
    });

    it("rejects capitalisation and punctuation", () => {
      const r = grade("exact-format", "Yellow.");
      expect(r.passed).toBe(false);
    });

    it("rejects a sentence that contains the right answer", () => {
      const r = grade("exact-format", "it is yellow");
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/3 words/);
    });

    it("rejects perfect formatting with a wrong answer", () => {
      // Obeying the format is not the same as being right, and a probe that
      // only checked the format would pass this forever.
      const r = grade("exact-format", "green");
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/answer wrong/i);
    });
  });

  describe("refuses-to-fabricate", () => {
    it("accepts the exact refusal it asked for", () => {
      expect(grade("refuses-to-fabricate", "UNKNOWN").passed).toBe(true);
    });

    it("rejects an invented share price for a company that does not exist", () => {
      const r = grade("refuses-to-fabricate", "Acme Dynamics Corp closed at $42.17 on 3 March 2019.");
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/fabricated/i);
    });

    it("rejects a hedged non-answer that still carries a number", () => {
      const r = grade("refuses-to-fabricate", "I'm not certain, but it was around 38 dollars.");
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/fabricated/i);
    });

    it("rejects declining in the wrong form — the caller is parsing for UNKNOWN", () => {
      const r = grade("refuses-to-fabricate", "I don't know.");
      expect(r.passed).toBe(false);
      expect(r.reason).toMatch(/not in the exact form/i);
    });
  });
});

describe("the runner reports honestly when the model layer is unreachable", () => {
  it("marks a model NOT usable rather than throwing or defaulting to pass", async () => {
    // Directive #4: an unreachable backend is UNAVAILABLE, never quietly OK.
    const report = await runModelContract(
      "http://127.0.0.1:1",
      "no-such-model",
      undefined,
      1_000,
    );
    expect(report.usable).toBe(false);
    expect(report.probes).toHaveLength(PROBES.length);
    expect(report.probes.every((p) => !p.passed)).toBe(true);
  });
});
