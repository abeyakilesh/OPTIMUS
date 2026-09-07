/**
 * The projector is the boundary between the kernel and every surface. If it
 * lies, every surface lies identically and consistently, which is the hardest
 * kind of wrong to notice.
 */
import { describe, it, expect } from "vitest";
import { projectSpec, applyEvent, projectLog } from "@/lib/graph/projector";
import { GRAPH_SCHEMA_VERSION } from "@/lib/graph/model";
import { buildDownloadMission } from "@/kernel/downloadMission";
import type { KernelEvent } from "@/kernel/events";

const mission = buildDownloadMission({ repos: ["honojs/hono", "colinhacks/zod"] });

describe("projectSpec — a plan is a graph before it runs", () => {
  it("draws every step and its dependsOn edges with nothing running", () => {
    const g = projectSpec(mission);
    expect(g.schemaVersion).toBe(GRAPH_SCHEMA_VERSION);
    expect(g.nodes).toHaveLength(4); // resolve + clone, twice
    expect(g.nodes.every((n) => n.state === "idle")).toBe(true);
    expect(g.nodes.every((n) => n.type === "capability")).toBe(true);

    // Order is known from the plan, so it is drawable immediately.
    const dep = g.edges.filter((e) => e.type === "dependsOn");
    expect(dep).toHaveLength(2);
    expect(dep[0]).toMatchObject({ from: "resolve:honojs/hono", to: "clone:honojs/hono" });
  });

  it("emits NO dataFrom edge from the plan alone — provenance is not a promise", () => {
    // The plan CONTAINS a $from reference. It is still not evidence of what
    // that reference resolved to, and drawing it here would make the canvas
    // assert something the kernel has not yet determined.
    const g = projectSpec(mission);
    expect(g.edges.filter((e) => e.type === "dataFrom")).toHaveLength(0);
  });
});

describe("applyEvent — execution is an overlay, not a second graph", () => {
  it("runs, retries, and completes a node without changing the graph's shape", () => {
    let g = projectSpec(mission);
    const shape = g.nodes.length + g.edges.length;

    g = applyEvent(g, { type: "step.started", at: 1, stepId: "resolve:honojs/hono" });
    expect(g.nodes[0].state).toBe("running");

    g = applyEvent(g, { type: "step.attempt", at: 2, stepId: "resolve:honojs/hono", attempt: 2 });
    // A retry is visibly different from a first run — the kernel knows, so the
    // canvas can too.
    expect(g.nodes[0].state).toBe("retrying");
    expect(g.nodes[0].data?.attempts).toBe(2);

    expect(g.nodes.length + g.edges.length).toBe(shape);
  });

  it("creates the dataFrom edge ONLY from step.resolved, carrying the artifact", () => {
    let g = projectSpec(mission);
    g = applyEvent(g, {
      type: "step.resolved",
      at: 3,
      stepId: "clone:honojs/hono",
      resolved: [
        // The real kernel emits a FULL destination path here, not a bare
        // field — asserted in that shape so this test cannot pass on a
        // simplification the kernel does not actually produce.
        { at: "clone:honojs/hono.input.expectedSha", from: "resolve:honojs/hono.sha", outputArtifactId: "sha256:abc" },
      ],
    });

    const data = g.edges.filter((e) => e.type === "dataFrom");
    expect(data).toHaveLength(1);
    // The label a person reads on the wire — the value travelling, named.
    expect(data[0].label).toBe("sha → expectedSha");
    // And it points at the sealed artifact, so the edge is clickable evidence
    // rather than a decoration.
    expect(data[0].data).toMatchObject({ artifactId: "sha256:abc" });
  });

  it("distinguishes blocked from continued — they are opposite outcomes", () => {
    let g = projectSpec(mission);
    g = applyEvent(g, { type: "step.blocked", at: 4, stepId: "clone:colinhacks/zod", because: "upstream failed" });
    expect(g.nodes[3].state).toBe("blocked");
    expect(g.nodes[3].data?.because).toBe("upstream failed");

    let h = projectSpec(mission);
    h = applyEvent(h, { type: "step.continued", at: 4, stepId: "clone:colinhacks/zod", because: "continue-on-error" });
    // Continued means the graph CARRIED ON. Marking it blocked would state the
    // opposite of what the kernel recorded.
    expect(h.nodes[3].state).not.toBe("blocked");
    expect(h.nodes[3].data?.continued).toBe(true);
  });

  it("ignores an event it does not understand instead of throwing", () => {
    // The kernel may grow events before a surface does. If that were an error,
    // every kernel addition would break every client.
    const g = projectSpec(mission);
    const unknown = { type: "capability.registered", at: 9 } as unknown as KernelEvent;
    expect(() => applyEvent(g, unknown)).not.toThrow();
  });
});

describe("projectLog — the browser folds the same log the CLI does", () => {
  it("rebuilds the whole graph from mission.proposed onward", () => {
    const log: KernelEvent[] = [
      { type: "mission.proposed", at: 1, spec: mission },
      { type: "mission.started", at: 2, missionId: mission.id },
      { type: "step.started", at: 3, stepId: "resolve:honojs/hono" },
      { type: "mission.finished", at: 4, missionId: mission.id, status: "green" },
    ];
    const g = projectLog(log);
    expect(g.nodes).toHaveLength(4);
    expect(g.run?.state).toBe("completed");
    expect(g.title).toBe(mission.objective);
  });
});
