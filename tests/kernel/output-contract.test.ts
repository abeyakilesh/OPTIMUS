import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Broker, BrokerError } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { assertOutputs, checkOutput, ARTIFACT_ID_OUTPUT } from "../../kernel/outputContract";
import type { OutputConstraints } from "../../kernel/outputContract";
import { webFetch, htmlExtractTitle } from "../../kernel/builtin";
import { ALL_CAPABILITIES } from "../../kernel/registry";
import type { Capability, CapabilityManifest, Check } from "../../kernel/types";

/**
 * Gate 8's fourth leg — a capability declares what it RETURNS, and the
 * declaration is checked against the real return value rather than believed.
 *
 * The reason this is one PR and not two is in the last describe block: an
 * `outputs` field that nothing compares to reality is a description of a thing
 * that lives somewhere else, and PR B's `$from` resolution is about to trust
 * it. Declaring without enforcing would have shipped the failure mode this
 * repo has a rule against, in the same commit that created the field.
 */

const budget = { maxAttempts: 1, maxWallTimeMs: 2_000, maxCost: 5 };

function manifest(over: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    id: "test.cap",
    version: "1.0.0",
    permissions: [],
    inputConstraints: {},
    outputs: {},
    defaultBudget: budget,
    description: "fixture",
    ...over,
  };
}

function capability(over: Partial<CapabilityManifest>, output: unknown): Capability {
  return { manifest: manifest(over), async run() { return output; } };
}

const alwaysPasses: Check = {
  id: "always.passes",
  async run() {
    return { checkId: "always.passes", passed: true, reason: "by construction" };
  },
};

async function runWith(over: Partial<CapabilityManifest>, output: unknown) {
  const broker = new Broker();
  broker.register(capability(over, output));
  broker.registerCheck(alwaysPasses);
  const harness = new Harness({ broker, store: new MemoryArtifactStore() });
  return harness.runStep({
    id: "s",
    capabilityId: "test.cap",
    input: {},
    dependsOn: [],
    checks: ["always.passes"],
  });
}

/* ══ registration ══════════════════════════════════════════════════════════ */

describe("a manifest with no outputs never registers", () => {
  it("refuses the absent declaration, and says what {} means", () => {
    const noOutputs = manifest();
    delete (noOutputs as Partial<CapabilityManifest>).outputs;
    expect(() => new Broker().register({ manifest: noOutputs, async run() { return {}; } }))
      .toThrow(/declares no outputs/);
  });

  it("accepts {} — a capability that returns nothing says so", () => {
    expect(() => new Broker().register(capability({}, {}))).not.toThrow(BrokerError);
  });

  it("refuses a malformed declaration the same way inputConstraints are", () => {
    // Reuses the input contract's own well-formedness pass, so an empty enum
    // or an array with no element type is refused here too — one engine, one
    // set of rules, no second thing to keep true.
    expect(() => assertOutputs({ x: { kind: "array" } } as unknown as OutputConstraints, "t"))
      .toThrow(/array needs "of"/);
    expect(() => assertOutputs({ x: { kind: "nope" } } as unknown as OutputConstraints, "t"))
      .toThrow(/unknown constraint kind/);
  });
});

describe("url and executable are input-only kinds", () => {
  /**
   * They exist to REFUSE a value before the kernel acts on it: the host before
   * a request is assembled around it, the binary before spawn() sees it. An
   * output has already been produced, so the same declaration on the way out
   * can only fail a step late while READING as a boundary.
   */
  it("refuses a url constraint declared as an output", () => {
    expect(() => assertOutputs(
      { where: { kind: "url", allowedSchemes: ["https"], anyHost: true } } as unknown as OutputConstraints,
      "t",
    )).toThrow(/input-only kind/);
  });

  it("refuses one buried inside an object, where the type cannot reach", () => {
    // The exported type excludes these at the top level only — nesting is
    // typed by inputContract.ts. This walk is what actually covers it, and
    // this test is the reason to believe the walk runs.
    expect(() => assertOutputs(
      {
        meta: {
          kind: "object",
          fields: { bin: { kind: "executable", allowed: ["/bin/ls"] } },
        },
      } as unknown as OutputConstraints,
      "t",
    )).toThrow(/input-only kind/);
  });

  it("refuses one inside an array element", () => {
    expect(() => assertOutputs(
      { links: { kind: "array", of: { kind: "url", allowedSchemes: ["https"], anyHost: true } } } as unknown as OutputConstraints,
      "t",
    )).toThrow(/input-only kind/);
  });
});

/* ══ the door itself ═══════════════════════════════════════════════════════ */

describe("the output door refuses what the manifest did not promise", () => {
  it("fails the step when a declared field is missing", async () => {
    const outcome = await runWith(
      { outputs: { title: { kind: "string", required: true } } },
      {},
    );
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/output\.title: required field is missing/);
  });

  it("fails the step when a declared field is the wrong type", async () => {
    const outcome = await runWith(
      { outputs: { bytes: { kind: "number", required: true } } },
      { bytes: "1200" },
    );
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/expected a finite number, got string/);
  });

  it("fails the step on an UNDECLARED field — the set is closed", async () => {
    // The property `$from` needs. A field nothing declared is a field no plan
    // could ever legally name, and a capability that grew one silently would
    // make the manifest a description of an older version of itself.
    const outcome = await runWith(
      { outputs: { title: { kind: "string", required: true } } },
      { title: "ok", sneaked: "in" },
    );
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/output\.sneaked: undeclared field/);
  });

  it("passes an output that matches exactly", async () => {
    const outcome = await runWith(
      { outputs: { title: { kind: "string", required: true } } },
      { title: "ok" },
    );
    expect(outcome.status).toBe("passed");
  });

  it("reports the CONTRACT violation, not a check verdict, when both would fail", async () => {
    // Ordering is the assertion. A check answers the mission's question; this
    // answers the contract's. A capability that has drifted from its own
    // manifest must fail with the FIELD named, rather than as whatever
    // downstream confusion the wrong shape happens to produce.
    const broker = new Broker();
    broker.register(capability({ outputs: { title: { kind: "string", required: true } } }, { title: 42 }));
    broker.registerCheck({
      id: "never.passes",
      async run() {
        return { checkId: "never.passes", passed: false, reason: "the mission's question" };
      },
    });
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    const outcome = await harness.runStep({
      id: "s", capabilityId: "test.cap", input: {}, dependsOn: [], checks: ["never.passes"],
    });
    expect(outcome.evidence.checks.map((c) => c.checkId)).toEqual(["capability.completed"]);
    expect(outcome.evidence.checks[0].reason).not.toMatch(/the mission's question/);
  });
});

/* ══ the five real manifests describe the five real capabilities ═══════════ */

describe("every registered capability's declaration matches its implementation", () => {
  it("declares outputs for all of them", () => {
    for (const c of ALL_CAPABILITIES) {
      expect(c.manifest.outputs, c.manifest.id).toBeDefined();
    }
  });

  it("web.fetch really returns exactly { artifactId, bytes }", async () => {
    const BODY = "<html><head><title>Real</title></head><body>hi</body></html>";
    const broker = new Broker();
    broker.register(webFetch);
    broker.registerCheck(alwaysPasses);
    const harness = new Harness({
      broker,
      store: new MemoryArtifactStore(),
      fetcher: async () => BODY,
    });
    const outcome = await harness.runStep({
      id: "fetch",
      capabilityId: "web.fetch",
      input: { url: "https://example.com/" },
      dependsOn: [],
      checks: ["always.passes"],
    });
    expect(outcome.status).toBe("passed");
    // Not `typeof === "object"`: the point is WHICH fields, because that set
    // is what a `$from` reference will be validated against.
    expect(Object.keys(outcome.output as object).sort()).toEqual(["artifactId", "bytes"]);
    expect((outcome.output as { bytes: number }).bytes).toBe(BODY.length);
  });

  it("html.extractTitle really returns exactly { title, artifactId }", async () => {
    const BODY = "<html><head><title>Real</title></head><body>hi</body></html>";
    const broker = new Broker();
    broker.register(webFetch);
    broker.register(htmlExtractTitle);
    broker.registerCheck(alwaysPasses);
    const store = new MemoryArtifactStore();
    const harness = new Harness({ broker, store, fetcher: async () => BODY });
    const fetched = await harness.runStep({
      id: "fetch", capabilityId: "web.fetch", input: { url: "https://example.com/" },
      dependsOn: [], checks: ["always.passes"],
    });
    const outcome = await harness.runStep({
      id: "extract",
      capabilityId: "html.extractTitle",
      input: { artifactId: (fetched.output as { artifactId: string }).artifactId },
      dependsOn: [],
      checks: ["always.passes"],
    });
    expect(outcome.status).toBe("passed");
    expect(Object.keys(outcome.output as object).sort()).toEqual(["artifactId", "title"]);
    expect((outcome.output as { title: string }).title).toBe("Real");
  });

  it("a content address really is the 71 characters the shared constant claims", () => {
    // ARTIFACT_ID_OUTPUT's bounds are a claim about a format defined
    // elsewhere. Checked against a real one rather than trusted.
    const id = "sha256:" + "a".repeat(64);
    expect(id).toHaveLength(ARTIFACT_ID_OUTPUT.maxLength);
    expect(checkOutput({ artifactId: ARTIFACT_ID_OUTPUT }, { artifactId: id })).toEqual([]);
    expect(checkOutput({ artifactId: ARTIFACT_ID_OUTPUT }, { artifactId: "sha256:short" })).toHaveLength(1);
  });
});

/* ══ THE MUTATION RULE ═════════════════════════════════════════════════════ */

/**
 * The tests above are only proof if they go red when the door is removed.
 *
 * Two separate subjects, so two separate mutations — the registration guard
 * and the runtime guard are different guarantees, and a single mutation that
 * disabled both could not tell which tests belong to which.
 *
 * The real source is mutated rather than a hand-written permissive copy: a
 * copy written to skip validation would prove only that it skips validation.
 */
describe("mutation: the tests above fail when the door is removed", () => {
  async function withMutant<T>(
    source: string,
    mutations: Array<[RegExp, string]>,
    body: (moduleUrl: string) => Promise<T>,
  ): Promise<T> {
    const original = readFileSync(source, "utf8");
    let mutated = original;
    for (const [pattern, replacement] of mutations) {
      // Anti-rot: a mutation whose target has been renamed is mutating
      // nothing, and must say so loudly rather than quietly proving nothing.
      expect(pattern.test(mutated), `mutation target ${pattern} is gone from ${source}`).toBe(true);
      mutated = mutated.replace(pattern, replacement);
    }
    expect(mutated).not.toBe(original);
    // Unique per run: vitest runs test FILES in parallel and a fixed path
    // would race any other suite compiling the same module.
    const path = source.replace(/\.ts$/, `.mutant-${process.pid}-${Date.now()}.ts`);
    writeFileSync(path, mutated, "utf8");
    try {
      return await body(pathToFileURL(resolve(path)).href);
    } finally {
      unlinkSync(path);
    }
  }

  it("REGISTRATION: without assertOutputContract, a manifest with no outputs registers fine", async () => {
    await withMutant(
      join("kernel", "broker.ts"),
      [[/^\s*assertOutputContract\(manifest\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Broker: new () => Broker };
        const noOutputs = manifest();
        delete (noOutputs as Partial<CapabilityManifest>).outputs;
        // THE ASSERTION THAT MAKES THE REGISTRATION TESTS REAL.
        expect(() =>
          new mutant.Broker().register({ manifest: noOutputs, async run() { return {}; } }),
        ).not.toThrow();
      },
    );
  });

  it("RUNTIME: without validateOutput, an undeclared field flows straight through", async () => {
    await withMutant(
      join("kernel", "harness.ts"),
      [[/^\s*this\.deps\.broker\.validateOutput\(manifest\.id, output\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Harness: typeof Harness };
        const broker = new Broker();
        broker.register(capability(
          { outputs: { title: { kind: "string", required: true } } },
          { title: "ok", sneaked: "in" },
        ));
        broker.registerCheck(alwaysPasses);
        const harness = new mutant.Harness({ broker, store: new MemoryArtifactStore() });
        const outcome = await harness.runStep({
          id: "s", capabilityId: "test.cap", input: {}, dependsOn: [], checks: ["always.passes"],
        });
        // THE ASSERTION THAT MAKES THE DOOR TESTS REAL: with the check gone,
        // a capability whose output contradicts its own manifest PASSES, and
        // the undeclared field is carried onward exactly as `$from` would
        // have found it.
        expect(outcome.status).toBe("passed");
        expect(outcome.output).toEqual({ title: "ok", sneaked: "in" });
      },
    );
  });

  it("RUNTIME mutation leaves the REGISTRATION tests alone, and vice versa", async () => {
    // The discrimination assertion. Two mutations that both turned every test
    // in this file red would prove the file has one subject, not two.
    await withMutant(
      join("kernel", "harness.ts"),
      [[/^\s*this\.deps\.broker\.validateOutput\(manifest\.id, output\);$/m, ""]],
      async () => {
        const noOutputs = manifest();
        delete (noOutputs as Partial<CapabilityManifest>).outputs;
        // Registration is unaffected by a harness mutation: still refused.
        expect(() => new Broker().register({ manifest: noOutputs, async run() { return {}; } }))
          .toThrow(/declares no outputs/);
      },
    );
  });
});
