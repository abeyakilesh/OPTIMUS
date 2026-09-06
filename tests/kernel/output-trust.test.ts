import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Broker } from "../../kernel/broker";
import { webFetch, htmlExtractTitle } from "../../kernel/builtin";
import { ALL_CAPABILITIES } from "../../kernel/registry";
import {
  OUTPUT_TRUST_LEVELS,
  OUTPUT_TRUST_REFUSED,
  assertOutputTrust,
  trustOfOutput,
} from "../../kernel/outputContract";
import { REFERENCE_KEY, TRUST_KEY, PlanReferenceError, referencesIn, validateReferences } from "../../kernel/references";
import type { Capability, CapabilityManifest, MissionSpec } from "../../kernel/types";

/**
 * #70 — the fifth manifest leg, and the plan-time check it exists to feed.
 *
 * TWO DOORS, TESTED SEPARATELY because they fail for different reasons and a
 * session weakening one should not be able to hide behind the other:
 *
 *   · REGISTRATION — a capability must classify every field it returns.
 *   · PLAN VALIDATION — a reference to an untrusted field may not be carried
 *     under a better trust tag than it deserves.
 *
 * The refusal tests are weighted toward the LAUNDERING direction on purpose.
 * Over-tagging is allowed and has its own test saying so, because a check that
 * refused caution would push plan authors toward the weaker tag.
 */

const budget = { maxAttempts: 1, maxWallTimeMs: 2_000, maxCost: 5 };

/**
 * A capability that accepts the kernel's provenance shape. It stands in for
 * `llm.chat` deliberately: the check keys off the SHAPE, not off a capability
 * id, so a fixture that has never heard of OmniRoute must trigger it. If this
 * suite ever needs the real `llm.chat` to go red, the check has quietly become
 * a special case.
 */
const sink: Capability = {
  manifest: {
    id: "test.sink",
    version: "1.0.0",
    permissions: [],
    inputConstraints: {
      messages: {
        kind: "array",
        required: true,
        of: {
          kind: "object",
          fields: {
            role: { kind: "string", required: true },
            content: { kind: "string", required: true },
            trust: { kind: "string", required: true, enum: [...OUTPUT_TRUST_LEVELS, "kernel", "operator"] },
          },
        },
      },
    },
    outputs: { echoed: { kind: "number", required: true, integer: true, min: 0 } },
    outputTrust: { echoed: "capability" },
    defaultBudget: budget,
    description: "accepts provenance-shaped messages; stands in for any model-facing capability",
  },
  async run(input) {
    return { echoed: (input as { messages: unknown[] }).messages.length };
  },
};

function kernelWithSink() {
  const broker = new Broker();
  broker.register(webFetch);
  broker.register(htmlExtractTitle);
  broker.register(sink);
  return broker;
}

/**
 * fetch -> extract -> sink. `html.extractTitle` declares `title` UNTRUSTED, so
 * the third step is where the check bites. Everything upstream is real, which
 * matters: a fixture producing a fake "untrusted" field would prove the check
 * reads a manifest, not that the manifests are right.
 */
function planCarrying(trust: unknown): MissionSpec {
  return {
    id: "m-trust",
    objective: "carry an extracted page title into a model-facing capability",
    steps: [
      {
        id: "fetch",
        capabilityId: "web.fetch",
        input: { url: "https://example.com/" },
        dependsOn: [],
        checks: [],
      },
      {
        id: "extract",
        capabilityId: "html.extractTitle",
        input: { artifactId: { [REFERENCE_KEY]: "fetch.artifactId" } },
        dependsOn: ["fetch"],
        checks: [],
      },
      {
        id: "ask",
        capabilityId: "test.sink",
        input: {
          messages: [
            { role: "user", content: { [REFERENCE_KEY]: "extract.title" }, [TRUST_KEY]: trust },
          ],
        },
        dependsOn: ["extract"],
        checks: [],
      },
    ],
  };
}

/* ══ registration — every returned field is classified ═════════════════════ */

describe("a capability must say who authored each field it returns", () => {
  const base: CapabilityManifest = {
    id: "test.cap",
    version: "1.0.0",
    permissions: [],
    inputConstraints: {},
    outputs: { title: { kind: "string", required: true } },
    outputTrust: { title: "untrusted" },
    defaultBudget: budget,
    description: "fixture",
  };
  const register = (over: Partial<CapabilityManifest>) =>
    new Broker().register({ manifest: { ...base, ...over }, async run() { return { title: "x" } } });

  it("refuses a manifest with a declared output and no trust for it", () => {
    expect(() => register({ outputTrust: {} })).toThrow(/output "title" has no outputTrust/);
  });

  it("refuses a manifest with no outputTrust at all — absent is not a default", () => {
    const noTrust = { ...base } as Partial<CapabilityManifest>;
    delete noTrust.outputTrust;
    expect(() =>
      new Broker().register({ manifest: noTrust as CapabilityManifest, async run() { return {} } }),
    ).toThrow(/declares no outputTrust/);
  });

  it("refuses a trust entry naming a field the capability does not return", () => {
    expect(() => register({ outputTrust: { title: "untrusted", ghost: "capability" } })).toThrow(
      /outputTrust names "ghost", which is not a declared output/,
    );
  });

  it.each(OUTPUT_TRUST_REFUSED)("refuses %s as an output level, and says why", (level) => {
    expect(() =>
      register({ outputTrust: { title: level as never } }),
    ).toThrow(/is not legal for an output/);
  });

  it('refusing "kernel" names the escalation, not just the rule', () => {
    expect(() => register({ outputTrust: { title: "kernel" as never } })).toThrow(
      /would mint instructions by returning them/,
    );
  });

  it("accepts a capability that returns nothing, declaring {} for both", () => {
    expect(() => register({ outputs: {}, outputTrust: {} })).not.toThrow();
  });

  it("every REGISTERED capability classifies every field it returns", () => {
    for (const cap of ALL_CAPABILITIES) {
      const { id, outputs, outputTrust } = cap.manifest;
      expect(() => assertOutputTrust(outputs, outputTrust, id), id).not.toThrow();
      // Not just "it parses" — the two key sets are the same set.
      expect(Object.keys(outputTrust).sort(), id).toEqual(Object.keys(outputs).sort());
    }
  });

  it("at least one real capability declares an untrusted field, or this leg proves nothing", () => {
    const untrusted = ALL_CAPABILITIES.flatMap((c) =>
      Object.entries(c.manifest.outputTrust)
        .filter(([, level]) => level === "untrusted")
        .map(([field]) => `${c.manifest.id}.${field}`),
    );
    // An anti-rot guard, not a metric. If a refactor ever left every field
    // `capability`, every refusal test below would still pass while checking
    // nothing — the same shape of hole THE MUTATION RULE is written against.
    expect(untrusted.length).toBeGreaterThan(0);
    expect(untrusted).toContain("html.extractTitle.title");
  });

  it("an unknown field reads as untrusted, not as trusted", () => {
    // Unreachable through the broker — registration proves completeness. It is
    // the answer given to a caller asking about a field nobody declared, and
    // fail-closed is the only safe direction for that question.
    expect(trustOfOutput({ title: "capability" }, "nonexistent")).toBe("untrusted");
  });
});

/* ══ plan validation — a tag that outranks its source is refused ═══════════ */

describe("a reference to an untrusted output may not be laundered", () => {
  it('refuses a message tagged "kernel" over an untrusted field', () => {
    expect(() => validateReferences(planCarrying("kernel"), kernelWithSink())).toThrow(
      PlanReferenceError,
    );
  });

  it('refuses a message tagged "operator" over an untrusted field', () => {
    expect(() => validateReferences(planCarrying("operator"), kernelWithSink())).toThrow(
      PlanReferenceError,
    );
  });

  it('refuses "capability" too — the rule is "not weaker", not "not kernel"', () => {
    expect(() => validateReferences(planCarrying("capability"), kernelWithSink())).toThrow(
      PlanReferenceError,
    );
  });

  it("the refusal names the capability, the field AND the path", () => {
    let message = "";
    try {
      validateReferences(planCarrying("kernel"), kernelWithSink());
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("html.extractTitle"); // which capability
    expect(message).toContain("title"); // which field
    expect(message).toContain("ask.input.messages[0].content"); // where, exactly
    expect(message).toContain("kernel"); // what it wrongly claimed
  });

  it('accepts the same plan tagged "untrusted"', () => {
    expect(() => validateReferences(planCarrying("untrusted"), kernelWithSink())).not.toThrow();
  });

  it("accepts OVER-tagging: a capability-level field carried as untrusted", () => {
    // `fetch.bytes` is capability-level. Carrying it as untrusted costs
    // fidelity and nothing else, so refusing it would punish caution.
    const spec = planCarrying("untrusted");
    spec.steps[2].input = {
      messages: [{ role: "user", content: { [REFERENCE_KEY]: "fetch.bytes" }, [TRUST_KEY]: "untrusted" }],
    };
    spec.steps[2].dependsOn = ["fetch"];
    expect(() => validateReferences(spec, kernelWithSink())).not.toThrow();
  });

  it("leaves a reference in an untagged position alone — the stated limit", () => {
    // `extract` pulls an untrusted-adjacent artifactId into a plain input with
    // no `trust` sibling. There is no claim to contradict, so there is no
    // refusal — and that is limit #3, not an oversight.
    const spec = planCarrying("untrusted");
    spec.steps.pop();
    expect(() => validateReferences(spec, kernelWithSink())).not.toThrow();
  });
});

/* ══ the tag's reach — where a trust statement stops applying ══════════════ */

describe("a trust tag speaks for its own object and no further", () => {
  it("attaches the tag of the object a reference sits directly inside", () => {
    const found = referencesIn({ role: "user", content: { [REFERENCE_KEY]: "a.b" }, trust: "kernel" });
    expect(found).toHaveLength(1);
    expect(found[0].declaredTrust).toBe("kernel");
    expect(found[0].at).toBe("input.content");
  });

  it("does not let one array element's tag speak for another", () => {
    const found = referencesIn({
      messages: [
        { content: { [REFERENCE_KEY]: "a.b" }, trust: "untrusted" },
        { content: { [REFERENCE_KEY]: "a.c" }, trust: "kernel" },
      ],
    });
    expect(found.map((f) => f.declaredTrust)).toEqual(["untrusted", "kernel"]);
  });

  it("does not inherit a tag into a nested object that states its own", () => {
    const found = referencesIn({
      trust: "kernel",
      inner: { trust: "untrusted", content: { [REFERENCE_KEY]: "a.b" } },
    });
    expect(found[0].declaredTrust).toBe("untrusted");
  });

  it("reports no tag when the reference sits outside any tagged object", () => {
    const found = referencesIn({ artifactId: { [REFERENCE_KEY]: "a.b" } });
    expect(found[0].declaredTrust).toBeUndefined();
  });

  it("refuses a plan whose SECOND message launders, not just the first", () => {
    // Position-independence, asserted. A walk that only tagged the first
    // element would pass every other test in this file.
    const spec = planCarrying("untrusted");
    spec.steps[2].input = {
      messages: [
        { role: "user", content: "a literal", [TRUST_KEY]: "operator" },
        { role: "user", content: { [REFERENCE_KEY]: "extract.title" }, [TRUST_KEY]: "kernel" },
      ],
    };
    expect(() => validateReferences(spec, kernelWithSink())).toThrow(/messages\[1\]\.content/);
  });
});

/* ══ mutation — remove the check and watch exactly these go red ════════════ */

describe("mutation: the refusals above fail when the check is removed", () => {
  async function withMutant<T>(
    source: string,
    mutations: Array<[RegExp, string]>,
    body: (moduleUrl: string) => Promise<T>,
  ): Promise<T> {
    const original = readFileSync(source, "utf8");
    let mutated = original;
    for (const [pattern, replacement] of mutations) {
      expect(pattern.test(mutated), `mutation target ${pattern} is gone from ${source}`).toBe(true);
      mutated = mutated.replace(pattern, replacement);
    }
    expect(mutated).not.toBe(original);
    const path = source.replace(/\.ts$/, `.mutant-${process.pid}-${Date.now()}.ts`);
    writeFileSync(path, mutated, "utf8");
    try {
      return await body(pathToFileURL(resolve(path)).href);
    } finally {
      unlinkSync(path);
    }
  }

  it("PLAN: without assertTrustNotLaundered, a kernel-tagged untrusted field validates fine", async () => {
    await withMutant(
      join("kernel", "references.ts"),
      [[/^\s*assertTrustNotLaundered\(at, producer\.capabilityId, ref\.field, declaredTrust, producerManifest\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { validateReferences: typeof validateReferences };
        // THE ASSERTION THAT MAKES THE REFUSALS REAL. Same plan, same broker,
        // one line removed — and the plan that must be refused is accepted.
        expect(() => mutant.validateReferences(planCarrying("kernel"), kernelWithSink())).not.toThrow();
      },
    );
  });

  it("REGISTRATION: without assertOutputTrustContract, an unclassified output registers fine", async () => {
    await withMutant(
      join("kernel", "broker.ts"),
      [[/^\s*assertOutputTrustContract\(manifest\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Broker: new () => Broker };
        const unclassified: CapabilityManifest = {
          id: "test.unclassified",
          version: "1.0.0",
          permissions: [],
          inputConstraints: {},
          outputs: { title: { kind: "string", required: true } },
          outputTrust: {}, // says nothing about `title`
          defaultBudget: budget,
          description: "fixture",
        };
        expect(() =>
          new mutant.Broker().register({ manifest: unclassified, async run() { return { title: "x" } } }),
        ).not.toThrow();
      },
    );
  });

  it("the tag walk is load-bearing: without it every reference reads as untagged", async () => {
    await withMutant(
      join("kernel", "references.ts"),
      [[/found\.push\(\{ at, ref: parseReference\(input, at\), declaredTrust: siblingTrust \}\);/, "found.push({ at, ref: parseReference(input, at) });"]],
      async (url) => {
        const mutant = (await import(url)) as { validateReferences: typeof validateReferences };
        // The check survives, the DATA it reads does not — and the refusal
        // disappears just the same. Two ways to break one guarantee, both
        // asserted, because only removing the `if` would have been checked.
        expect(() => mutant.validateReferences(planCarrying("kernel"), kernelWithSink())).not.toThrow();
      },
    );
  });
});
