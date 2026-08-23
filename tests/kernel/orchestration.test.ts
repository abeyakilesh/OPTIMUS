/**
 * Multi-agent orchestration — the K4 scheduler.
 *
 * WP-001's scope listed parallelism as OUT. It is in, because a single-agent
 * loop is not the product: the thing being built runs several agents at once
 * against one goal. These tests hold that to the same standard as the ACs —
 * each asserts observable behaviour, not that a class exists.
 */

import { describe, it, expect } from "vitest";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { Scheduler, validateGraph, SchedulerError } from "../../kernel/scheduler";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import type { Capability, Check, MissionSpec, StepSpec } from "../../kernel/types";

/** Records the exact interleaving of every step so parallelism is provable. */
class Timeline {
  readonly entries: { stepId: string; phase: "enter" | "exit"; at: number }[] = [];
  private seq = 0;

  mark(stepId: string, phase: "enter" | "exit"): void {
    this.entries.push({ stepId, phase, at: this.seq++ });
  }

  /** True if the two steps' [enter, exit] windows overlap at all. */
  overlapped(a: string, b: string): boolean {
    const win = (id: string) => {
      const enter = this.entries.find((e) => e.stepId === id && e.phase === "enter")?.at;
      const exit = this.entries.find((e) => e.stepId === id && e.phase === "exit")?.at;
      return enter !== undefined && exit !== undefined ? ([enter, exit] as const) : undefined;
    };
    const wa = win(a);
    const wb = win(b);
    if (!wa || !wb) return false;
    return wa[0] < wb[1] && wb[0] < wa[1];
  }

  /** Peak number of steps inside their window simultaneously. */
  peakConcurrency(): number {
    let live = 0;
    let peak = 0;
    for (const e of [...this.entries].sort((x, y) => x.at - y.at)) {
      live += e.phase === "enter" ? 1 : -1;
      peak = Math.max(peak, live);
    }
    return peak;
  }
}

const alwaysPasses: Check = {
  id: "always.passes",
  async run() {
    return { checkId: "always.passes", passed: true, reason: "ok" };
  },
};

const alwaysFails: Check = {
  id: "always.fails",
  async run() {
    return { checkId: "always.fails", passed: false, reason: "designed to fail" };
  },
};

/**
 * A capability that yields to the event loop, so genuinely-parallel steps
 * interleave and serialised ones cannot.
 */
function tracked(id: string, timeline: Timeline, ticks = 3): Capability {
  return {
    manifest: {
      id,
      version: "1.0.0",
      permissions: [],
      defaultBudget: { maxAttempts: 1, maxWallTimeMs: 10_000, maxCost: 10 },
      description: `tracked capability ${id}`,
    },
    async run(input) {
      const stepId = (input as { stepId: string }).stepId;
      timeline.mark(stepId, "enter");
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      timeline.mark(stepId, "exit");
      return { stepId };
    },
  };
}

function step(id: string, over: Partial<StepSpec> = {}): StepSpec {
  return {
    id,
    capabilityId: "work",
    input: { stepId: id },
    dependsOn: [],
    checks: ["always.passes"],
    ...over,
  };
}

function buildScheduler(timeline: Timeline) {
  const broker = new Broker();
  broker.register(tracked("work", timeline));
  broker.registerCheck(alwaysPasses);
  broker.registerCheck(alwaysFails);
  const harness = new Harness({ broker, store: new MemoryArtifactStore() });
  return { broker, scheduler: new Scheduler({ harness }), harness };
}

describe("multi-agent orchestration", () => {
  it("runs independent steps in parallel, not one after another", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    const mission: MissionSpec = {
      id: "m-parallel",
      objective: "three independent agents work at once",
      steps: [
        step("researcher", { agent: "researcher" }),
        step("coder", { agent: "coder" }),
        step("reviewer", { agent: "reviewer" }),
      ],
    };

    const result = await scheduler.run(mission);

    expect(result.green).toBe(true);
    expect(
      timeline.peakConcurrency(),
      "three independent steps must be in flight together",
    ).toBe(3);
    expect(timeline.overlapped("researcher", "coder")).toBe(true);
  });

  it("respects maxParallel", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    const result = await scheduler.run({
      id: "m-capped",
      objective: "four steps, cap of two",
      maxParallel: 2,
      steps: [step("a"), step("b"), step("c"), step("d")],
    });

    expect(result.green).toBe(true);
    expect(timeline.peakConcurrency()).toBeLessThanOrEqual(2);
  });

  it("serialises steps that share a resource lock", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    // Both need the same browser profile. They are otherwise independent, so
    // without locks they WOULD overlap — which is what makes this falsifiable.
    const result = await scheduler.run({
      id: "m-locks",
      objective: "two agents contend for one browser profile",
      steps: [
        step("agentA", { locks: ["browser:default"] }),
        step("agentB", { locks: ["browser:default"] }),
        step("agentC"), // no lock — free to overlap
      ],
    });

    expect(result.green).toBe(true);
    expect(
      timeline.overlapped("agentA", "agentB"),
      "steps holding the same lock must never overlap",
    ).toBe(false);
  });

  it("lets unrelated steps overlap even while a lock is held", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    await scheduler.run({
      id: "m-locks-2",
      objective: "a lock must not stall the whole graph",
      steps: [
        step("locked1", { locks: ["repo:worktree"] }),
        step("locked2", { locks: ["repo:worktree"] }),
        step("free1"),
        step("free2"),
      ],
    });

    expect(timeline.overlapped("locked1", "locked2")).toBe(false);
    expect(timeline.peakConcurrency()).toBeGreaterThan(1);
  });

  it("blocks dependents when a step fails, and says why", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    const result = await scheduler.run({
      id: "m-failure",
      objective: "a failed plan must not be built on",
      steps: [
        step("plan", { checks: ["always.fails"] }),
        step("build", { dependsOn: ["plan"] }),
        step("ship", { dependsOn: ["build"] }),
      ],
    });

    expect(result.green).toBe(false);
    expect(result.state.steps.plan.status).toBe("failed");
    expect(result.state.steps.build.status).toBe("blocked");
    expect(result.state.steps.ship.status, "failure must propagate transitively").toBe("blocked");

    // The blocked steps must never have executed.
    expect(timeline.entries.some((e) => e.stepId === "build")).toBe(false);

    const blocked = result.log
      .all()
      .filter((e) => e.type === "step.blocked")
      .map((e) => (e as { because: string }).because);
    expect(blocked.join(" ")).toMatch(/did not pass/);
  });

  it("continues past a failure only when continue-on-error is declared, and records it", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    const result = await scheduler.run({
      id: "m-continue",
      objective: "an optional step may fail without stopping the graph",
      steps: [
        step("optional", { checks: ["always.fails"] }),
        step("carryOn", { dependsOn: ["optional"], continueOnError: true }),
      ],
    });

    expect(result.state.steps.optional.status).toBe("failed");
    expect(result.state.steps.carryOn.status).toBe("passed");

    // Never silent: the trace must carry the reason it ran anyway. This is a
    // `step.continued` event, distinct from `step.blocked` — folding a blocked
    // event would mark the step blocked, the opposite of what happened.
    const continued = result.log.all().filter((e) => e.type === "step.continued");
    expect(continued).toHaveLength(1);
    expect((continued[0] as { because: string }).because).toMatch(/continue-on-error/i);

    // And it must NOT have been recorded as blocked.
    expect(result.log.all().some((e) => e.type === "step.blocked")).toBe(false);

    // The mission is still NOT green — something in it failed.
    expect(result.green).toBe(false);
  });

  it("resolves a diamond dependency in the right order", async () => {
    const timeline = new Timeline();
    const { scheduler } = buildScheduler(timeline);

    const result = await scheduler.run({
      id: "m-diamond",
      objective: "prd -> (backend, frontend) -> integrate",
      steps: [
        step("prd", { agent: "planner" }),
        step("backend", { dependsOn: ["prd"], agent: "coder-1" }),
        step("frontend", { dependsOn: ["prd"], agent: "coder-2" }),
        step("integrate", { dependsOn: ["backend", "frontend"], agent: "integrator" }),
      ],
    });

    expect(result.green).toBe(true);

    const enter = (id: string) =>
      timeline.entries.find((e) => e.stepId === id && e.phase === "enter")!.at;
    const exit = (id: string) =>
      timeline.entries.find((e) => e.stepId === id && e.phase === "exit")!.at;

    expect(exit("prd")).toBeLessThan(enter("backend"));
    expect(exit("prd")).toBeLessThan(enter("frontend"));
    expect(exit("backend")).toBeLessThan(enter("integrate"));
    expect(exit("frontend")).toBeLessThan(enter("integrate"));

    // The two middle steps are independent — they must actually run together.
    expect(timeline.overlapped("backend", "frontend")).toBe(true);
  });

  it("gives each agent its own repair strategy", async () => {
    const timeline = new Timeline();
    const broker = new Broker();

    // Passes only once its input has been repaired twice.
    const needsRepair: Capability = {
      manifest: {
        id: "work",
        version: "1.0.0",
        permissions: [],
        defaultBudget: { maxAttempts: 5, maxWallTimeMs: 10_000, maxCost: 50 },
        description: "succeeds only after repair",
      },
      async run(input) {
        const { stepId, fixes = 0 } = input as { stepId: string; fixes?: number };
        timeline.mark(stepId, "enter");
        timeline.mark(stepId, "exit");
        return { stepId, title: fixes >= 2 ? "repaired" : "" };
      },
    };
    broker.register(needsRepair);
    broker.registerCheck({
      id: "title.nonEmpty",
      async run(output) {
        const title = (output as { title?: string }).title;
        return {
          checkId: "title.nonEmpty",
          passed: Boolean(title),
          reason: title ? "has a title" : "empty title",
        };
      },
    });

    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    let repairCalls = 0;

    const scheduler = new Scheduler({
      harness,
      repairs: {
        // Keyed by AGENT, so it applies to every step that agent owns.
        fixer: (previous) => {
          repairCalls += 1;
          const p = previous as { stepId: string; fixes?: number };
          return { ...p, fixes: (p.fixes ?? 0) + 1 };
        },
      },
    });

    const result = await scheduler.run({
      id: "m-repair",
      objective: "an agent repairs its own failing step",
      steps: [
        {
          id: "repairable",
          capabilityId: "work",
          input: { stepId: "repairable" },
          dependsOn: [],
          checks: ["title.nonEmpty"],
          agent: "fixer",
        },
      ],
    });

    expect(result.green, "the agent should have repaired its way to green").toBe(true);
    expect(repairCalls).toBe(2);
    expect(result.state.steps.repairable.evidence?.attempts).toBe(3);
  });
});

describe("graph validation", () => {
  it("rejects a cycle rather than half-executing it", () => {
    expect(() =>
      validateGraph({
        id: "m-cycle",
        objective: "a depends on b depends on a",
        steps: [
          { ...step("a"), dependsOn: ["b"] },
          { ...step("b"), dependsOn: ["a"] },
        ],
      }),
    ).toThrow(SchedulerError);
  });

  it("rejects a dependency on a step that does not exist", () => {
    expect(() =>
      validateGraph({
        id: "m-missing",
        objective: "depends on a ghost",
        steps: [{ ...step("a"), dependsOn: ["ghost"] }],
      }),
    ).toThrow(/unknown step ghost/);
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      validateGraph({
        id: "m-dupe",
        objective: "two steps called a",
        steps: [step("a"), step("a")],
      }),
    ).toThrow(/Duplicate/);
  });

  it("accepts a valid graph", () => {
    expect(() =>
      validateGraph({
        id: "m-ok",
        objective: "fine",
        steps: [step("a"), { ...step("b"), dependsOn: ["a"] }],
      }),
    ).not.toThrow();
  });
});
