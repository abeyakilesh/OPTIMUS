/**
 * WP-001 acceptance criteria. Each `it` here maps to one AC in
 * docs/WORK_PACKAGES.md and can genuinely fail.
 *
 * The rule these tests exist to enforce (docs/WORK_PACKAGES.md): a criterion
 * satisfiable by something that merely renders is banned. Every assertion
 * below is "given A, when B, then C".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { Scheduler } from "../../kernel/scheduler";
import {
  MemoryArtifactStore,
  DiskArtifactStore,
  addressOf,
  hashInput,
} from "../../kernel/artifacts";
import { fold } from "../../kernel/events";
import { snapshot, rollback } from "../../kernel/rollback";
import { webFetch, htmlExtractTitle, titleNonEmpty, artifactExists } from "../../kernel/builtin";
import type { Capability, MissionSpec } from "../../kernel/types";

/** A fixed page so every run is deterministic — no real network, ever. */
const FIXTURE_HTML = `<!doctype html>
<html><head><title>  Example   Domain  </title></head>
<body><h1>Example Domain</h1></body></html>`;

const EXPECTED_TITLE = "Example Domain";

function buildKernel(store = new MemoryArtifactStore()) {
  const broker = new Broker();
  broker.register(webFetch);
  broker.register(htmlExtractTitle);
  broker.registerCheck(titleNonEmpty);
  broker.registerCheck(artifactExists);

  const fetcher = async (url: string) => {
    if (url !== "https://example.com") throw new Error(`unexpected url ${url}`);
    return FIXTURE_HTML;
  };

  const harness = new Harness({ broker, store, fetcher });
  return { broker, store, harness, fetcher };
}

/** The walking-skeleton mission: fetch a page, extract its title, verify. */
function skeletonMission(): MissionSpec {
  return {
    id: "m-skeleton",
    objective: "Fetch example.com and extract the page title",
    steps: [
      {
        id: "fetch",
        capabilityId: "web.fetch",
        input: { url: "https://example.com" },
        dependsOn: [],
        checks: ["artifact.exists"],
      },
      {
        id: "extract",
        capabilityId: "html.extractTitle",
        input: { artifactId: addressOf(FIXTURE_HTML) },
        dependsOn: ["fetch"],
        checks: ["title.nonEmpty", "artifact.exists"],
      },
    ],
  };
}

describe("WP-001 acceptance criteria", () => {
  /* ── AC-3 comes first: it is the claim the whole product rests on ─────── */

  describe("AC-3 · verification actually blocks", () => {
    it("fails the step and the mission when the output is corrupted before the check", async () => {
      const { broker, store } = buildKernel();

      // Same capability, but it corrupts the title on the way out — exactly
      // the "looks like it worked" failure a model would happily report.
      const sabotaged: Capability = {
        manifest: {
          ...htmlExtractTitle.manifest,
          id: "html.extractTitle.sabotaged",
        },
        async run() {
          return { title: "", artifactId: undefined };
        },
      };
      broker.register(sabotaged);

      const harness = new Harness({ broker, store, fetcher: async () => FIXTURE_HTML });
      const scheduler = new Scheduler({ harness });

      const result = await scheduler.run({
        id: "m-sabotage",
        objective: "corrupted output must not pass",
        steps: [
          {
            id: "extract",
            capabilityId: "html.extractTitle.sabotaged",
            // A VALID input, deliberately. This was `{}` until input
            // constraints landed, at which point the step started failing at
            // the manifest's door instead of at the check — still red, still
            // "passing" this test, and no longer proving a single thing about
            // verification. A test that goes on passing for a new reason is
            // worse than one that breaks.
            input: { artifactId: addressOf(FIXTURE_HTML) },
            dependsOn: [],
            checks: ["title.nonEmpty", "artifact.exists"],
          },
        ],
      });

      expect(result.green, "a corrupted result must NOT produce a green mission").toBe(false);
      expect(result.state.steps.extract.status).not.toBe("passed");
      expect(result.state.status, "mission must not be applied").toBe("red");

      // And the evidence must say WHY, not merely that it failed.
      const checks = result.state.steps.extract.evidence?.checks ?? [];
      expect(checks.some((c) => !c.passed)).toBe(true);
      expect(checks.find((c) => !c.passed)?.reason).toBeTruthy();

      // Specifically: a REAL verification check blocked it. Asserting only
      // "something failed" is what let the input-constraint change above slip
      // past unnoticed — the step never reached the capability, and the
      // assertions above were all still true.
      const failed = checks.filter((c) => !c.passed).map((c) => c.checkId);
      expect(failed, "the declared checks must be what blocked this").toContain("title.nonEmpty");
      expect(failed).not.toContain("capability.completed");
    });

    it("refuses to pass a step that declares no checks at all", async () => {
      // Otherwise "done" quietly becomes "the function returned".
      const { broker, store } = buildKernel();
      const harness = new Harness({ broker, store, fetcher: async () => FIXTURE_HTML });

      const outcome = await harness.runStep({
        id: "uncheckedStep",
        capabilityId: "web.fetch",
        input: { url: "https://example.com" },
        dependsOn: [],
        checks: [],
      });

      expect(outcome.status).not.toBe("passed");
      expect(outcome.evidence.checks[0].reason).toMatch(/declares no checks/i);
    });
  });

  /* ── AC-1 · the artifact really exists, at the expected address ───────── */

  it("AC-1 · produces an artifact whose sha256 matches the fixture", async () => {
    const { harness, store } = buildKernel();
    const scheduler = new Scheduler({ harness });
    const result = await scheduler.run(skeletonMission());

    expect(result.green).toBe(true);

    const fetchEvidence = result.state.steps.fetch.evidence;
    expect(fetchEvidence?.artifactIds).toContain(addressOf(FIXTURE_HTML));

    // The extracted title must be the real one, normalised — the fixture has
    // deliberately messy whitespace ("  Example   Domain  ") so this proves
    // the extraction actually ran rather than echoing something back.
    const titleArtifact = result.state.steps.extract.evidence?.artifactIds.at(-1);
    expect(titleArtifact).toBe(addressOf(EXPECTED_TITLE));
    expect(await store.get(titleArtifact!)).toBe(EXPECTED_TITLE);
  });

  /* ── AC-2 · the permission boundary refuses undeclared access ─────────── */

  it("AC-2 · refuses a filesystem write from a capability that declared only net:read", async () => {
    const { broker, store } = buildKernel();

    // A UNIQUE path per run. A fixed one would be poisoned forever by any run
    // where the boundary was broken (as a mutation test proved), turning this
    // assertion into a permanent false failure.
    const forbiddenPath = join(
      await mkdtemp(join(tmpdir(), "optimus-boundary-")),
      "should-never-exist",
    );

    const overreaching: Capability = {
      manifest: {
        id: "web.fetch.overreaching",
        version: "1.0.0",
        permissions: ["net:read"], // note: NO fs:write
        isolation: { allowedHosts: ["example.test"] },
        inputConstraints: {},
        defaultBudget: { maxAttempts: 1, maxWallTimeMs: 5000, maxCost: 5 },
        description: "Fetches, then tries to write a file it never declared.",
      },
      async run(_input, ctx) {
        await ctx.fsWrite(forbiddenPath, "pwned");
        return { ok: true };
      },
    };
    broker.register(overreaching);

    const harness = new Harness({ broker, store, fetcher: async () => FIXTURE_HTML });
    const outcome = await harness.runStep({
      id: "overreach",
      capabilityId: "web.fetch.overreaching",
      input: {},
      dependsOn: [],
      checks: ["artifact.exists"],
    });

    expect(outcome.status).not.toBe("passed");
    const reason = outcome.evidence.checks.map((c) => c.reason).join(" ");
    expect(reason).toMatch(/permission denied/i);
    expect(reason).toMatch(/fs:write/);
    expect(existsSync(forbiddenPath), "the write must not have landed").toBe(false);
  });

  /* ── AC-4 · budgets terminate a loop that can never pass ──────────────── */

  describe("AC-4 · budgets", () => {
    it("terminates within maxAttempts when the check can never pass", async () => {
      const { broker, store } = buildKernel();

      let invocations = 0;
      const alwaysWrong: Capability = {
        manifest: {
          id: "always.wrong",
          version: "1.0.0",
          permissions: [],
          // `nudge` is what the repair function below adds between attempts.
          // It has to be DECLARED: the input contract is checked on every
          // attempt, so an undeclared field invented by a repair is refused
          // like any other. That is deliberate — a repair is code writing
          // input, and shortly it will be an LLM writing input. This test
          // found it honestly: before `nudge` was declared, the step stopped
          // after 1 invocation instead of 3.
          inputConstraints: { nudge: { kind: "number", min: 0, max: 1 } },
          defaultBudget: { maxAttempts: 3, maxWallTimeMs: 10_000, maxCost: 100 },
          description: "Returns an empty title forever.",
        },
        async run() {
          invocations += 1;
          return { title: "" };
        },
      };
      broker.register(alwaysWrong);

      const harness = new Harness({ broker, store });
      const outcome = await harness.runStep(
        {
          id: "doomed",
          capabilityId: "always.wrong",
          input: {},
          dependsOn: [],
          checks: ["title.nonEmpty"],
        },
        // A repair that keeps trying — without a budget this would spin forever.
        (previous) => ({ ...(previous as object), nudge: Math.random() }),
      );

      expect(outcome.status).toBe("budget-exhausted");
      expect(invocations, "must stop at exactly maxAttempts").toBe(3);
      expect(outcome.evidence.attempts).toBe(3);
    });

    it("stops on the wall-time budget even when attempts remain", async () => {
      const { broker, store } = buildKernel();

      // Virtual clock: each call advances time, so no test actually sleeps.
      let clock = 0;
      const tick = () => {
        clock += 400;
        return clock;
      };

      const slow: Capability = {
        manifest: {
          id: "slow.capability",
          version: "1.0.0",
          permissions: [],
          inputConstraints: {},
          defaultBudget: { maxAttempts: 100, maxWallTimeMs: 1000, maxCost: 1000 },
          description: "Never satisfies its check.",
        },
        async run() {
          return { title: "" };
        },
      };
      broker.register(slow);

      const harness = new Harness({ broker, store, now: tick });
      const outcome = await harness.runStep(
        {
          id: "slow",
          capabilityId: "slow.capability",
          input: {},
          dependsOn: [],
          checks: ["title.nonEmpty"],
        },
        (previous) => previous,
      );

      expect(outcome.status).toBe("budget-exhausted");
      expect(
        outcome.evidence.attempts,
        "wall-time must bite long before the 100-attempt cap",
      ).toBeLessThan(100);
      expect(outcome.evidence.checks.some((c) => !c.passed)).toBe(true);
    });

    it("stops on the cost budget", async () => {
      const { broker, store } = buildKernel();

      const costly: Capability = {
        manifest: {
          id: "costly.capability",
          version: "1.0.0",
          permissions: [],
          // Each attempt costs 1; allow 2 before the ceiling bites.
          inputConstraints: {},
          defaultBudget: { maxAttempts: 50, maxWallTimeMs: 60_000, maxCost: 2 },
          description: "Never satisfies its check.",
        },
        async run() {
          return { title: "" };
        },
      };
      broker.register(costly);

      const harness = new Harness({ broker, store });
      const outcome = await harness.runStep(
        {
          id: "costly",
          capabilityId: "costly.capability",
          input: {},
          dependsOn: [],
          checks: ["title.nonEmpty"],
        },
        (previous) => previous,
      );

      expect(outcome.status).toBe("budget-exhausted");
      expect(outcome.evidence.cost).toBeGreaterThan(2);
      expect(outcome.evidence.attempts).toBeLessThan(50);
    });

    it("rejects a capability registered with an impossible budget", () => {
      const broker = new Broker();
      expect(() =>
        broker.register({
          manifest: {
            id: "no.budget",
            version: "1.0.0",
            permissions: [],
            inputConstraints: {},
            defaultBudget: { maxAttempts: 0, maxWallTimeMs: 1000, maxCost: 1 },
            description: "zero attempts is not a budget",
          },
          async run() {
            return {};
          },
        }),
      ).toThrow(/maxAttempts/);
    });
  });

  /* ── AC-5 · rollback restores byte-identical state ────────────────────── */

  it("AC-5 · rollback restores the on-disk state byte-for-byte", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimus-rollback-"));
    const store = new DiskArtifactStore(join(root, "artifacts"));

    const watched = join(root, "workspace", "notes.txt");
    await mkdir(join(root, "workspace"), { recursive: true });
    await writeFile(watched, "original contents", "utf8");

    const preArtifact = await store.put("pre-existing artifact");
    const before = await snapshot(store, [watched]);

    // Mutate the world the way a half-applied mission would.
    await store.put("artifact created by the mission");
    await writeFile(watched, "MUTATED BY THE MISSION", "utf8");
    const created = join(root, "workspace", "new-file.txt");
    await writeFile(created, "should not survive rollback", "utf8");

    await rollback(store, { ...before, files: [...before.files, { path: created, contents: undefined }] });

    expect(await readFile(watched, "utf8")).toBe("original contents");
    expect(existsSync(created), "a file the mission created must be gone").toBe(false);
    expect(await store.list()).toEqual([preArtifact]);
  });

  /* ── AC-6 · state folds from the event log alone ──────────────────────── */

  it("AC-6 · rebuilding state from the event log equals the live state", async () => {
    const { harness } = buildKernel();
    const scheduler = new Scheduler({ harness });
    const result = await scheduler.run(skeletonMission());

    const rebuilt = fold(result.log.all());
    expect(rebuilt).toEqual(result.state);

    // And it must survive a round-trip through serialisation, or the log is
    // not actually a durable record.
    const roundTripped = fold(JSON.parse(result.log.toJSON()));
    expect(roundTripped).toEqual(result.state);
  });

  /* ── AC-7 · determinism ───────────────────────────────────────────────── */

  it("AC-7 · re-running the same mission yields an identical artifact hash", async () => {
    const first = buildKernel();
    const second = buildKernel();

    const a = await new Scheduler({ harness: first.harness }).run(skeletonMission());
    const b = await new Scheduler({ harness: second.harness }).run(skeletonMission());

    expect(a.green && b.green).toBe(true);
    expect(a.state.steps.fetch.evidence?.artifactIds).toEqual(
      b.state.steps.fetch.evidence?.artifactIds,
    );
    expect(a.state.steps.extract.evidence?.artifactIds).toEqual(
      b.state.steps.extract.evidence?.artifactIds,
    );
  });

  it("AC-7 · input hashing is stable across key order", () => {
    expect(hashInput({ a: 1, b: 2 })).toBe(hashInput({ b: 2, a: 1 }));
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }));
  });

  /* ── AC-8 · evidence is complete ──────────────────────────────────────── */

  it("AC-8 · every step's evidence carries the full required schema", async () => {
    const { harness } = buildKernel();
    const scheduler = new Scheduler({ harness });
    const result = await scheduler.run(skeletonMission());

    for (const stepId of Object.keys(result.state.steps)) {
      const evidence = result.state.steps[stepId].evidence;
      expect(evidence, `step ${stepId} has no evidence`).toBeDefined();
      expect(evidence!.stepId).toBe(stepId);
      expect(evidence!.capabilityId).toBeTruthy();
      expect(evidence!.capabilityVersion).toBeTruthy();
      expect(evidence!.attempts).toBeGreaterThanOrEqual(1);
      expect(evidence!.exitCode).toBe(0);
      expect(typeof evidence!.durationMs).toBe("number");
      expect(typeof evidence!.cost).toBe("number");
      expect(Array.isArray(evidence!.artifactIds)).toBe(true);
      expect(evidence!.checks.length).toBeGreaterThan(0);
      expect(evidence!.inputHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

/* ── artifact store invariants ─────────────────────────────────────────── */

describe("artifact store", () => {
  let store: DiskArtifactStore;

  beforeEach(async () => {
    store = new DiskArtifactStore(await mkdtemp(join(tmpdir(), "optimus-store-")));
  });

  it("addresses content by its hash, so identical bytes dedupe", async () => {
    const a = await store.put("same bytes");
    const b = await store.put("same bytes");
    expect(a).toBe(b);
    expect(await store.list()).toHaveLength(1);
  });

  it("refuses a malformed id instead of touching the filesystem", async () => {
    await expect(store.get("sha256:../../../etc/passwd")).rejects.toThrow(/Malformed/);
    await expect(store.get("not-an-address")).rejects.toThrow(/Malformed/);
  });
});
