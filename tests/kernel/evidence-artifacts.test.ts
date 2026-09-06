import { describe, it, expect } from "vitest";
import { Broker } from "../../kernel/broker";
import { ARTIFACT_ID_OUTPUT } from "../../kernel/outputContract";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import type { Capability, Check, StepSpec } from "../../kernel/types";

/**
 * The evidence gap Validation Round 1 surfaced.
 *
 * Artifacts are content-addressed, so a step producing bytes identical to an
 * artifact already in the store writes nothing new. The harness credits a step
 * only with artifacts it NEWLY created, so the second run's evidence pointed at
 * nothing at all — a step that genuinely produced output looked, in the audit
 * trail, like a step that produced none.
 *
 * The fix is not to weaken content-addressing. It is to record that the step
 * produced that content regardless of whether the write was new.
 */

const CONSTANT_BODY = "identical output on every single run";

/** Returns the same bytes every time, so the second run always deduplicates. */
const repeater: Capability = {
  manifest: {
    id: "test.repeater",
    version: "1.0.0",
    permissions: [],
    isolation: {},
    inputConstraints: {},
    outputs: { artifactId: ARTIFACT_ID_OUTPUT },
    defaultBudget: { maxAttempts: 1, maxWallTimeMs: 2_000, maxCost: 5 },
    description: "stores a constant body and returns its artifact id",
  },
  async run(_input, ctx) {
    return { artifactId: await ctx.putArtifact(CONSTANT_BODY) };
  },
};

const passes: Check = {
  id: "always.passes",
  async run() {
    return { checkId: "always.passes", passed: true, reason: "ok" };
  },
};

function step(id: string): StepSpec {
  return { id, capabilityId: "test.repeater", input: {}, dependsOn: [], checks: ["always.passes"] };
}

describe("evidence records what a step produced, not only what it newly wrote", () => {
  it("keeps the artifact in evidence on a repeat run, when nothing new was written", async () => {
    const broker = new Broker();
    broker.register(repeater);
    broker.registerCheck(passes);
    // ONE store across both runs — that is what makes the second deduplicate.
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });

    const first = await harness.runStep(step("first"));
    const second = await harness.runStep(step("second"));

    expect(first.status).toBe("passed");
    expect(second.status).toBe("passed");

    const id = (first.output as { artifactId: string }).artifactId;
    // The step's own output, sealed into the store so a later `$from` can read
    // it back (#68). It is a second artifact, produced by the kernel on the
    // step's behalf rather than written by the capability — which is exactly
    // the distinction `artifactIds` and `producedArtifactIds` already draw.
    const sealed = first.evidence.outputArtifactId!;
    expect(sealed).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sealed).not.toBe(id);

    // First run genuinely created the capability's artifact.
    expect(first.evidence.artifactIds).toEqual([id]);
    expect(first.evidence.producedArtifactIds).toEqual([id, sealed]);

    // Second run wrote nothing new — and that is correct, not a bug. Both
    // artifacts dedupe: identical output means an identical seal.
    expect(second.evidence.artifactIds).toEqual([]);
    expect(second.evidence.outputArtifactId).toBe(sealed);
    // But its evidence must still point at what it produced. This is the
    // assertion that was failing in production before the fix.
    expect(second.evidence.producedArtifactIds).toEqual([id, sealed]);
  });

  it("finds an artifact id nested anywhere in the output, not just at the top level", async () => {
    const nested: Capability = {
      manifest: {
        ...repeater.manifest,
        id: "test.nested",
        // Its own declaration, not the repeater's. Inheriting one that
        // promised a top-level `artifactId` made this step FAIL at the output
        // door (#66) while the test went on passing, because the capability
        // had already written its artifact by then and the only assertion was
        // about the id list. See the status assertion below.
        outputs: {
          result: {
            kind: "object",
            fields: {
              pages: {
                kind: "array",
                of: { kind: "object", fields: { meta: { kind: "object", fields: { artifactId: { kind: "string" } } } } },
              },
            },
          },
        },
      },
      async run(_input, ctx) {
        const id = await ctx.putArtifact("nested payload");
        return { result: { pages: [{ meta: { artifactId: id } }] } };
      },
    };
    const broker = new Broker();
    broker.register(nested);
    broker.registerCheck(passes);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });

    const outcome = await harness.runStep({
      id: "s",
      capabilityId: "test.nested",
      input: {},
      dependsOn: [],
      checks: ["always.passes"],
    });

    // The step must actually have RUN. Without this the assertions below are
    // satisfied by a step that failed before producing anything.
    expect(outcome.status).toBe("passed");
    // The capability's own nested artifact, plus the sealed output.
    expect(outcome.evidence.producedArtifactIds).toHaveLength(2);
    expect(outcome.evidence.producedArtifactIds).toContain(outcome.evidence.outputArtifactId);
    expect(outcome.evidence.artifactIds).toHaveLength(1);
    expect(outcome.evidence.artifactIds[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("does not mistake ordinary strings for artifact ids", async () => {
    const noisy: Capability = {
      manifest: {
        ...repeater.manifest,
        id: "test.noisy",
        // Same correction as test.nested: this returns three strings and no
        // artifact id, so it says so. Inheriting the repeater's declaration
        // made the step fail at the output door and produce nothing — which
        // satisfies `toEqual([])` perfectly. An assertion that a result is
        // EMPTY cannot tell "correctly nothing" from "nothing ran".
        outputs: {
          note: { kind: "string" },
          other: { kind: "string" },
          text: { kind: "string" },
        },
      },
      async run() {
        return {
          note: "sha256:not-a-real-id",
          other: "sha256:" + "z".repeat(64),
          text: "a perfectly ordinary sentence",
        };
      },
    };
    const broker = new Broker();
    broker.register(noisy);
    broker.registerCheck(passes);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });

    const outcome = await harness.runStep({
      id: "s",
      capabilityId: "test.noisy",
      input: {},
      dependsOn: [],
      checks: ["always.passes"],
    });

    expect(outcome.status, "the step must have RUN for the emptiness below to mean anything").toBe("passed");
    // The capability wrote nothing, so the ONLY produced artifact is the
    // sealed output. None of the three lookalike strings was collected — which
    // is the subject, and it is now asserted positively rather than as an
    // empty list that a failed step would also satisfy.
    expect(outcome.evidence.artifactIds).toEqual([]);
    expect(outcome.evidence.producedArtifactIds).toEqual([outcome.evidence.outputArtifactId]);
  });

  it("records produced artifacts even when the step FAILS its checks", async () => {
    const fails: Check = {
      id: "always.fails",
      async run() {
        return { checkId: "always.fails", passed: false, reason: "red on purpose" };
      },
    };
    const broker = new Broker();
    broker.register(repeater);
    broker.registerCheck(fails);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });

    const outcome = await harness.runStep({
      id: "s",
      capabilityId: "test.repeater",
      input: {},
      dependsOn: [],
      checks: ["always.fails"],
    });

    expect(outcome.status).toBe("failed");
    // A failed step's evidence is the most important kind to be complete.
    expect(outcome.evidence.producedArtifactIds).toHaveLength(1);
  });
});
