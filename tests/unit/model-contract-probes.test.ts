import { describe, it, expect } from "vitest";
import { PROBES } from "../../kernel/models/contract";
import { parseStrictObject, trailingAfterFirstObject } from "../../kernel/strictJson";

/**
 * #72 — the probes must exercise the task they certify for.
 *
 * `strict-json` asked for a ~40-token answer and recorded "this model emits
 * strict JSON". On a plan-sized output llama3.2:3b behaves differently and
 * reliably so — **measured 7/10**, with trailing text the dominant failure.
 * The plans were correct; what failed was *stopping*.
 *
 * So the grading here is asserted against the RAW OUTPUTS that issue recorded,
 * not against invented ones. A probe that would have passed those outputs is a
 * probe that certifies a model for behaviour the compiler rejects.
 */

const probe = (id: string) => {
  const found = PROBES.find((p) => p.id === id);
  expect(found, `probe "${id}" is gone`).toBeTruthy();
  return found!;
};

/** A well-formed answer to `plan-shaped-json`, used as the control. */
const GOOD_PLAN = JSON.stringify({
  steps: [
    { id: "get", tool: "http.get", input: { url: "https://example.org/" }, needs: [] },
    { id: "title", tool: "html.title", input: { url: "https://example.org/" }, needs: ["get"] },
  ],
});

describe("plan-shaped-json exercises the size of task it certifies for", () => {
  it("accepts a correct, linked, plan-shaped answer", () => {
    const r = probe("plan-shaped-json").grade(GOOD_PLAN);
    expect(r.passed, r.reason).toBe(true);
  });

  it("REJECTS run 0 — a correct plan followed by commentary", () => {
    // Verbatim shape of the observed failure: the plan was right, the model
    // kept talking. The old probe never saw an output long enough for this.
    const raw =
      GOOD_PLAN +
      '\nNote that the url is incorrect, it should be "https://example.org" instead of https://example.org/.';
    const r = probe("plan-shaped-json").grade(raw);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/more characters/);
  });

  it("REJECTS run 1 — a correct plan followed by a SECOND object", () => {
    // The dangerous one. The trailing object was a REFUSAL:
    //   {"refuse": "Output format is incorrect, missing 'refuse' key."}
    // Taking the first object would convert an admitted refusal into a plan.
    const raw = GOOD_PLAN + '\n{"refuse": "Output format is incorrect, missing \'refuse\' key."}';
    const r = probe("plan-shaped-json").grade(raw);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/more characters/);
    // And the refusal must still be legible in the failure, not swallowed.
    expect(r.reason).toMatch(/refuse/);
  });

  it("REJECTS a markdown fence, because the consumer does too", () => {
    const r = probe("plan-shaped-json").grade("```json\n" + GOOD_PLAN + "\n```");
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/fence/);
  });

  it("REJECTS two steps that do not depend on each other — a shape, not a plan", () => {
    // Meaning over shape. Well-formed, complete, and useless: the edge is the
    // thing the compiler actually needs.
    const unlinked = JSON.stringify({
      steps: [
        { id: "get", tool: "http.get", input: { url: "https://example.org/" }, needs: [] },
        { id: "title", tool: "html.title", input: { url: "https://example.org/" }, needs: [] },
      ],
    });
    const r = probe("plan-shaped-json").grade(unlinked);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/does not depend on/);
  });

  it("REJECTS a single step — the ~40-token answer the old probe accepted", () => {
    const tiny = JSON.stringify({
      steps: [{ id: "get", tool: "http.get", input: { url: "https://example.org/" }, needs: [] }],
    });
    expect(probe("plan-shaped-json").grade(tiny).passed).toBe(false);
  });

  it("REJECTS the wrong tools, however well-formed", () => {
    const wrong = JSON.stringify({
      steps: [
        { id: "a", tool: "shell.exec", input: { url: "https://example.org/" }, needs: [] },
        { id: "b", tool: "shell.exec", input: { url: "https://example.org/" }, needs: ["a"] },
      ],
    });
    const r = probe("plan-shaped-json").grade(wrong);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/http\.get and html\.title/);
  });

  it("asks for a genuinely plan-sized answer, not a token one", () => {
    // The defect was a probe SMALLER than its use. Asserted so a later
    // "simplification" of the prompt cannot quietly restore it.
    const p = probe("plan-shaped-json");
    expect(p.prompt.length).toBeGreaterThan(300);
    expect(p.prompt).toMatch(/nothing at all following the closing brace/i);
    // A worked example is included on purpose: measured 7/10 with one and
    // 0/6 without, so a probe lacking one would be HARDER than the consumer.
    expect(p.prompt).toMatch(/Worked example/);
  });
});

describe("refuses-without-capability grades a missing TOOL, not a missing fact", () => {
  it("accepts the exact refusal asked for", () => {
    const r = probe("refuses-without-capability").grade("CANNOT");
    expect(r.passed, r.reason).toBe(true);
  });

  it("REJECTS a model that claims a fetcher can send email", () => {
    // The dangerous failure: inventing a route out of the tools it was given.
    // Downstream this becomes a plan that runs and cannot possibly work.
    const r = probe("refuses-without-capability").grade("http.get, html.title");
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/claimed its tools could send email/);
  });

  it("distinguishes a wrongly-worded refusal from an off-topic answer", () => {
    // Three outcomes, not two — the same distinction `refuses-to-fabricate`
    // draws, because they name different repairs.
    const misworded = probe("refuses-without-capability").grade("I cannot do that with these tools.");
    expect(misworded.passed).toBe(false);
    expect(misworded.reason).toMatch(/not in the exact form asked/);

    const offTopic = probe("refuses-without-capability").grade("Sure, here is a poem about email.");
    expect(offTopic.passed).toBe(false);
    expect(offTopic.reason).toMatch(/neither CANNOT nor a refusal/);
  });

  it("is about capability, not facts — otherwise it duplicates the older probe", () => {
    const p = probe("refuses-without-capability");
    expect(p.prompt).toMatch(/ONLY these tools/);
    expect(p.why).toMatch(/capability/i);
  });
});

describe("the probe and its consumer read output the same way", () => {
  it("the strict parse is SHARED, not reimplemented per caller", () => {
    // The defect #72 names in one line: a probe lenient where the consumer is
    // strict certifies behaviour the consumer will reject. Both now call
    // kernel/strictJson.ts.
    const trailing = trailingAfterFirstObject(GOOD_PLAN + " and then some words");
    expect(trailing).toBe("and then some words");
    expect(parseStrictObject(GOOD_PLAN + " trailing").ok).toBe(false);
    expect(parseStrictObject(GOOD_PLAN).ok).toBe(true);
  });

  it("never takes the first object and discards the rest", () => {
    // Asserted as behaviour, not as a comment. This is the leniency that
    // would have turned an observed refusal into a plan.
    const parsed = parseStrictObject(GOOD_PLAN + '{"refuse":"no"}');
    expect(parsed.ok).toBe(false);
  });
});

describe("the contract still gates on ALL probes", () => {
  it("every probe explains what breaks without it", () => {
    for (const p of PROBES) {
      expect(p.why.length, p.id).toBeGreaterThan(20);
      expect(p.prompt.length, p.id).toBeGreaterThan(20);
    }
  });

  it("carries the two probes #72 added, alongside the original three", () => {
    expect(PROBES.map((p) => p.id)).toEqual([
      "strict-json",
      "exact-format",
      "refuses-to-fabricate",
      "plan-shaped-json",
      "refuses-without-capability",
    ]);
  });
});
