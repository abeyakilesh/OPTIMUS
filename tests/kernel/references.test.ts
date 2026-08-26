import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { Scheduler } from "../../kernel/scheduler";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { webFetch, htmlExtractTitle, titleNonEmpty, artifactIntact } from "../../kernel/builtin";
import {
  REFERENCE_KEY,
  PlanReferenceError,
  holdsReferenceKey,
  parseReference,
  referencesIn,
  resolveInput,
  validateReferences,
} from "../../kernel/references";
import type { MissionSpec } from "../../kernel/types";

/**
 * `$from` — the edge that carries data.
 *
 * The tests are weighted toward REFUSALS on purpose. What this syntax declines
 * to do is what keeps a mission plan from becoming a programming language
 * nobody designed, and a reference that resolves to `undefined` inside a
 * running mission is the failure mode the whole feature exists to prevent.
 */

const PAGE_A = `<html><head><title>Page A</title></head><body>a</body></html>`;
const PAGE_B = `<html><head><title>Page B</title></head><body>b</body></html>`;

function kernel(html = PAGE_A) {
  const broker = new Broker();
  broker.register(webFetch);
  broker.register(htmlExtractTitle);
  broker.registerCheck(titleNonEmpty);
  broker.registerCheck(artifactIntact);
  const harness = new Harness({ broker, store: new MemoryArtifactStore(), fetcher: async () => html });
  return { broker, harness };
}

function pipeline(over: Partial<MissionSpec> = {}): MissionSpec {
  return {
    id: "m-pipe",
    objective: "fetch a page, then extract its title from what the fetch produced",
    steps: [
      {
        id: "fetch",
        capabilityId: "web.fetch",
        input: { url: "https://example.com/" },
        dependsOn: [],
        checks: ["artifact.intact"],
      },
      {
        id: "extract",
        capabilityId: "html.extractTitle",
        input: { artifactId: { [REFERENCE_KEY]: "fetch.artifactId" } },
        dependsOn: ["fetch"],
        checks: ["title.nonEmpty"],
      },
    ],
    ...over,
  };
}

/* ══ parsing — malformed is an error, never a literal ══════════════════════ */

describe("a reference is recognised by its key and validated separately", () => {
  it("recognises the key without asserting anything about the value", () => {
    // holdsReferenceKey is deliberately NOT a type predicate. #65 and #66 both
    // found a `v is T` that checked less than it asserted; this splits the two
    // questions so neither half is an unchecked claim.
    expect(holdsReferenceKey({ [REFERENCE_KEY]: "a.b" })).toBe(true);
    expect(holdsReferenceKey({ [REFERENCE_KEY]: 42 })).toBe(true); // intended, and malformed
    expect(holdsReferenceKey({ other: "a.b" })).toBe(false);
    expect(holdsReferenceKey("a.b")).toBe(false);
    expect(holdsReferenceKey(null)).toBe(false);
    expect(holdsReferenceKey([{ [REFERENCE_KEY]: "a.b" }])).toBe(false);
  });

  it.each([
    [{ [REFERENCE_KEY]: "fetch" }, /exactly one dot/],
    [{ [REFERENCE_KEY]: "fetch.matches.first" }, /exactly one dot/],
    [{ [REFERENCE_KEY]: ".artifactId" }, /both sides non-empty/],
    [{ [REFERENCE_KEY]: "fetch." }, /both sides non-empty/],
    [{ [REFERENCE_KEY]: 42 }, /must be a string/],
    [{ [REFERENCE_KEY]: "fetch.artifactId", also: 1 }, /and nothing else/],
  ])("refuses %j", (value, pattern) => {
    expect(() => parseReference(value, "input.x")).toThrow(pattern);
  });

  it("never treats a malformed reference as an ordinary value", () => {
    // The property that matters. If a typo'd reference were passed through as
    // a literal object, it would reach the capability as `{ $from: "fetch" }`
    // and be refused as a type error somewhere far from the mistake.
    expect(() => referencesIn({ artifactId: { [REFERENCE_KEY]: "fetch" } })).toThrow(PlanReferenceError);
  });

  it("finds references at any depth, and reports where each one is", () => {
    // Nested placement is required by llm.chat, whose messages are objects
    // inside an array. "No nesting" is a rule about the REFERENCE, not about
    // where it may sit.
    const found = referencesIn({
      model: "x",
      messages: [{ role: "user", content: { [REFERENCE_KEY]: "extract.title" } }],
    });
    expect(found).toEqual([
      { at: "input.messages[0].content", ref: { stepId: "extract", field: "title" } },
    ]);
  });
});

/* ══ plan time ═════════════════════════════════════════════════════════════ */

describe("a plan's references are checked before any step runs", () => {
  const check = (spec: MissionSpec) => () => validateReferences(spec, kernel().broker);

  it("accepts a reference to a declared output of a step it depends on", () => {
    expect(check(pipeline())).not.toThrow();
  });

  it("refuses a field the producing capability does not declare — the point of #66", () => {
    // web.fetch returns { artifactId, bytes }. Before manifests declared their
    // outputs this was unanswerable at plan time and would have surfaced as an
    // `undefined` three steps into a running mission.
    const spec = pipeline();
    spec.steps[1].input = { artifactId: { [REFERENCE_KEY]: "fetch.title" } };
    expect(check(spec)).toThrow(/declares no output "title"/);
    expect(check(spec)).toThrow(/It returns: artifactId, bytes/);
  });

  it("refuses a reference to a step that is not in dependsOn", () => {
    // The structural kill of facade #2: without the edge the scheduler may run
    // both steps at once, so the value is a race rather than a data flow.
    const spec = pipeline();
    spec.steps[1].dependsOn = [];
    expect(check(spec)).toThrow(/does not depend on it/);
  });

  it("refuses a reference to a step that does not exist", () => {
    const spec = pipeline();
    spec.steps[1].input = { artifactId: { [REFERENCE_KEY]: "typo.artifactId" } };
    spec.steps[1].dependsOn = ["typo"];
    expect(check(spec)).toThrow(/no step "typo"/);
  });

  it("refuses a step referencing its own output", () => {
    const spec = pipeline();
    spec.steps[1].input = { artifactId: { [REFERENCE_KEY]: "extract.artifactId" } };
    spec.steps[1].dependsOn = ["extract", "fetch"];
    expect(check(spec)).toThrow(/cannot reference its own output/);
  });

  it("refuses the whole mission at Scheduler.run, not partway through it", async () => {
    const { harness } = kernel();
    const spec = pipeline();
    spec.steps[1].input = { artifactId: { [REFERENCE_KEY]: "fetch.title" } };
    await expect(new Scheduler({ harness }).run(spec)).rejects.toThrow(PlanReferenceError);
  });
});

/* ══ run time ══════════════════════════════════════════════════════════════ */

describe("resolution moves the real value along the edge", () => {
  it("runs the pipeline with no constant anywhere in the plan", async () => {
    const { harness } = kernel();
    const result = await new Scheduler({ harness }).run(pipeline());
    expect(result.green).toBe(true);
    expect(result.state.steps.extract.status).toBe("passed");
  });

  /**
   * THE ANTI-DECORATIVE TEST. Facade #2 was a hardcoded `addressOf(FIXTURE_HTML)`
   * that happened to equal what `fetch` produced, so `dependsOn` carried
   * nothing and AC-1 passed for the wrong reason. The only assertion that can
   * tell the difference is this one: change what the FIRST step returns and
   * require the SECOND step's result to change with it.
   */
  it("changes downstream when upstream changes — a constant could not do this", async () => {
    const a = await new Scheduler({ harness: kernel(PAGE_A).harness }).run(pipeline());
    const b = await new Scheduler({ harness: kernel(PAGE_B).harness }).run(pipeline());

    const titleOf = (r: typeof a) =>
      r.state.steps.extract.evidence?.checks.find((c) => c.checkId === "title.nonEmpty")?.detail
        ?.title;

    expect(titleOf(a)).toBe("Page A");
    expect(titleOf(b)).toBe("Page B");
    // And the upstream artifacts genuinely differ, so the two runs are not the
    // same run twice.
    expect(a.state.steps.fetch.evidence?.outputArtifactId).not.toBe(
      b.state.steps.fetch.evidence?.outputArtifactId,
    );
  });

  it("records what each reference pointed at, in the log", async () => {
    const { harness } = kernel();
    const result = await new Scheduler({ harness }).run(pipeline());
    const resolved = result.log.all().find((e) => e.type === "step.resolved");
    expect(resolved, "a mission with a reference must say what it resolved to").toBeDefined();
    expect(resolved).toMatchObject({
      stepId: "extract",
      resolved: [{ at: "extract.input.artifactId", from: "fetch.artifactId" }],
    });
  });

  it("reads the value from the artifact store, via the id in evidence", async () => {
    // D3, asserted rather than assumed: the value travels through a durable
    // address, not through a map in the scheduler. Everything needed to resolve
    // the reference a second time is in the log plus the store.
    const store = new MemoryArtifactStore();
    const broker = new Broker();
    broker.register(webFetch);
    broker.register(htmlExtractTitle);
    broker.registerCheck(titleNonEmpty);
    broker.registerCheck(artifactIntact);
    const harness = new Harness({ broker, store, fetcher: async () => PAGE_A });

    const result = await new Scheduler({ harness }).run(pipeline());
    const sealed = result.state.steps.fetch.evidence!.outputArtifactId!;

    const replayed = JSON.parse(await store.get(sealed)) as { artifactId: string };
    const consumed = (
      result.log.all().find((e) => e.type === "step.resolved") as {
        resolved: Array<{ outputArtifactId: string }>;
      }
    ).resolved[0].outputArtifactId;

    expect(consumed).toBe(sealed);
    // The bytes behind that address really are what `extract` was handed.
    expect(replayed.artifactId).toBe(
      result.state.steps.fetch.evidence!.artifactIds[0],
    );
  });

  it("refuses at run time when the manifest and the implementation disagree", async () => {
    // Plan validation proved the capability DECLARES the field. If it then
    // does not return it, that is a contract break and must say so — not hand
    // back `undefined` and let it surface as a confusing refusal a layer down.
    const missing = async () => ({ bytes: 0 }) as unknown;
    await expect(
      resolveInput({ x: { [REFERENCE_KEY]: "fetch.artifactId" } }, missing),
    ).rejects.toThrow(/manifest and the implementation disagree/);
  });

  it("returns the input by identity when there is nothing to resolve", async () => {
    const input = { url: "https://example.com/" };
    await expect(resolveInput(input, async () => ({}))).resolves.toBe(input);
  });
});

/* ══ THE MUTATION RULE ═════════════════════════════════════════════════════ */

describe("mutation: the tests above fail when the feature is removed", () => {
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

  it("PLAN TIME: without validateReferences, a bad field reaches the runtime", async () => {
    await withMutant(
      join("kernel", "scheduler.ts"),
      [[/^\s*validateReferences\(spec, this\.deps\.harness\.broker\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Scheduler: typeof Scheduler };
        const spec = pipeline();
        spec.steps[1].input = { artifactId: { [REFERENCE_KEY]: "fetch.title" } };
        // THE ASSERTION THAT MAKES THE PLAN-TIME TESTS REAL: with the check
        // gone the mission RUNS. It still goes red, but for a reason discovered
        // halfway through instead of before anything started — and the reason
        // now names a field on a step that already executed.
        const result = await new mutant.Scheduler({ harness: kernel().harness }).run(spec);
        expect(result.green).toBe(false);
        // `fetch` ran. That is the cost of losing plan-time validation: the
        // mission is discovered to be invalid only after work has been done,
        // and the reason names a field on a step that already executed.
        expect(result.state.steps.fetch.status).toBe("passed");
        expect(result.state.steps.extract.evidence?.checks[0]).toMatchObject({
          checkId: "input.unresolvable",
        });
      },
    );
  });

  it("RUN TIME: without resolveInput, the reference arrives at the capability verbatim", async () => {
    await withMutant(
      join("kernel", "scheduler.ts"),
      [[/resolvedInput = await resolveInput\(step\.input, \(id\) => this\.readOutput\(id, log\)\);/, "resolvedInput = step.input;"]],
      async (url) => {
        const mutant = (await import(url)) as { Scheduler: typeof Scheduler };
        const result = await new mutant.Scheduler({ harness: kernel().harness }).run(pipeline());
        // THE ASSERTION THAT MAKES THE RUN-TIME TESTS REAL. Unresolved, the
        // input is an OBJECT where the manifest promised a 71-character string,
        // so the input door refuses it and extract never runs. If this ever
        // reads `true`, resolution is not what is making the pipeline work.
        expect(result.green).toBe(false);
        expect(result.state.steps.extract.evidence?.checks[0].reason).toMatch(
          /input\.artifactId: expected a string, got object/,
        );
      },
    );
  });

  it("SEALING: without the stored output, resolution has nothing to read", async () => {
    await withMutant(
      join("kernel", "harness.ts"),
      [[/const outputArtifactId = await store\.put\(JSON\.stringify\(observation\.output \?\? null\)\);/, "const outputArtifactId = undefined;"]],
      async (url) => {
        const mutant = (await import(url)) as { Harness: typeof Harness };
        const broker = new Broker();
        broker.register(webFetch);
        broker.register(htmlExtractTitle);
        broker.registerCheck(titleNonEmpty);
        broker.registerCheck(artifactIntact);
        const harness = new mutant.Harness({
          broker,
          store: new MemoryArtifactStore(),
          fetcher: async () => PAGE_A,
        });
        // With no sealed output there is no durable place for the value to come
        // from, and the scheduler says so instead of resolving to undefined.
        const result = await new Scheduler({ harness }).run(pipeline());
        expect(result.green).toBe(false);
        expect(result.state.steps.extract.evidence?.checks[0].reason).toMatch(
          /produced no readable output to reference/,
        );
        // And the trace survives: the step that DID pass is still in the log.
        expect(result.state.steps.fetch.status).toBe("passed");
      },
    );
  });
});
