import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventLog } from "../../kernel/events";
import { MemoryMissionStore, DiskMissionStore, type MissionStore } from "../../kernel/missionStore";
import type { MissionSpec } from "../../kernel/types";

function fakeSpec(id: string, objective: string): MissionSpec {
  return {
    id,
    objective,
    steps: [{ id: "s1", capabilityId: "test.cap", input: {}, dependsOn: [], checks: [] }],
  };
}

/** A real, minimal event log for one mission — mirrors what Scheduler.run actually emits. */
function fakeLog(spec: MissionSpec, status: "green" | "red", startedAt: number): EventLog {
  const log = new EventLog();
  log.append({ type: "mission.proposed", at: startedAt, spec });
  log.append({ type: "mission.started", at: startedAt, missionId: spec.id });
  log.append({
    type: "step.finished",
    at: startedAt + 1,
    stepId: "s1",
    status: status === "green" ? "passed" : "failed",
    evidence: {
      stepId: "s1",
      capabilityId: "test.cap",
      capabilityVersion: "1.0.0",
      attempts: 1,
      exitCode: status === "green" ? 0 : 1,
      durationMs: 5,
      cost: 1,
      artifactIds: [],
      checks: [],
      inputHash: "x",
    },
  });
  log.append({ type: "mission.finished", at: startedAt + 2, missionId: spec.id, status });
  return log;
}

function sharedContract(makeStore: () => MissionStore) {
  it("round-trips a saved mission — load returns what was saved", async () => {
    const store = makeStore();
    const spec = fakeSpec("m1", "say hello");
    await store.save(fakeLog(spec, "green", 1000));

    const loaded = await store.load("m1");
    expect(loaded?.spec.objective).toBe("say hello");
    expect(loaded?.status).toBe("green");
    expect(loaded?.steps.s1.status).toBe("passed");
  });

  it("load returns undefined for a mission that was never saved", async () => {
    const store = makeStore();
    expect(await store.load("never-saved")).toBeUndefined();
  });

  it("list returns every saved mission, most recent first", async () => {
    const store = makeStore();
    await store.save(fakeLog(fakeSpec("older", "first question"), "green", 1000));
    await store.save(fakeLog(fakeSpec("newer", "second question"), "red", 2000));

    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(["newer", "older"]);
    expect(list[0].status).toBe("red");
    expect(list[1].objective).toBe("first question");
  });

  it("list returns an empty array, not an error, when nothing has been saved", async () => {
    const store = makeStore();
    expect(await store.list()).toEqual([]);
  });

  it("rejects a malformed id instead of touching storage", async () => {
    const store = makeStore();
    await expect(store.load("../../etc/passwd")).rejects.toThrow(/Malformed mission id/);
  });
}

describe("MemoryMissionStore", () => {
  sharedContract(() => new MemoryMissionStore());
});

describe("DiskMissionStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "optimus-mission-store-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  sharedContract(() => new DiskMissionStore(dir));

  it("actually persists to disk — a new store instance over the same root sees it", async () => {
    const spec = fakeSpec("persisted", "does this survive a restart");
    await new DiskMissionStore(dir).save(fakeLog(spec, "green", 1000));

    const reopened = await new DiskMissionStore(dir).load("persisted");
    expect(reopened?.spec.objective).toBe("does this survive a restart");
  });
});
