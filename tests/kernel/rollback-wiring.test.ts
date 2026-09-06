import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { rollbackScope, snapshotTree, restoreTree } from "../../kernel/rollback";
import { browserNavigate } from "../../kernel/capabilities/browser-use/navigate";
import type { Capability, Check, StepSpec } from "../../kernel/types";

/**
 * K2b · rollback, wired into the real step failure path.
 *
 * Before this, kernel/rollback.ts was imported by nothing but its own test.
 * It passed AC-5 and was load-bearing for zero capabilities — a file that
 * exists, has green tests, and protects nothing. These tests fail if the
 * wiring is removed, which the isolated AC-5 test never would.
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "optimus-rollback-wiring-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A capability that really writes to disk through the real fs boundary. */
function writer(id: string, files: Array<[string, string]>): Capability {
  return {
    manifest: {
      id,
      version: "1.0.0",
      permissions: ["fs:write"],
      isolation: { writeRoots: [root] },
      inputConstraints: {}, // takes no input; {} means "must be empty", not "anything goes"
      outputs: { wrote: { kind: "number", required: true, integer: true, min: 0 } },
      defaultBudget: { maxAttempts: 1, maxWallTimeMs: 5_000, maxCost: 5 },
      description: "writes files, so its failure path has something to undo",
    },
    async run(_input, ctx) {
      for (const [name, contents] of files) await ctx.fsWrite(join(root, name), contents);
      return { wrote: files.length };
    },
  };
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
    return { checkId: "always.fails", passed: false, reason: "deliberately red" };
  },
};

function harnessFor(capability: Capability): Harness {
  const broker = new Broker();
  broker.register(capability);
  broker.registerCheck(alwaysPasses);
  broker.registerCheck(alwaysFails);
  return new Harness({ broker, store: new MemoryArtifactStore() });
}

function step(capabilityId: string, checks: string[]): StepSpec {
  return { id: "s1", capabilityId, input: {}, dependsOn: [], checks };
}

describe("rollback is wired into a real step's failure path", () => {
  it("undoes a failed step's writes — the file it created is gone", async () => {
    const harness = harnessFor(writer("w.fail", [["created.txt", "should not survive"]]));
    const outcome = await harness.runStep(step("w.fail", ["always.fails"]));

    expect(outcome.status).toBe("failed");
    expect(existsSync(join(root, "created.txt"))).toBe(false);
  });

  it("KEEPS a passing step's writes — rollback must not eat successful work", async () => {
    const harness = harnessFor(writer("w.pass", [["kept.txt", "this is real output"]]));
    const outcome = await harness.runStep(step("w.pass", ["always.passes"]));

    expect(outcome.status).toBe("passed");
    expect(await readFile(join(root, "kept.txt"), "utf8")).toBe("this is real output");
  });

  it("restores a file the failed step overwrote, byte for byte", async () => {
    await writeFile(join(root, "existing.txt"), "ORIGINAL", "utf8");
    const harness = harnessFor(writer("w.overwrite", [["existing.txt", "CLOBBERED"]]));

    await harness.runStep(step("w.overwrite", ["always.fails"]));

    expect(await readFile(join(root, "existing.txt"), "utf8")).toBe("ORIGINAL");
  });

  it("records the rollback in evidence — an invisible rollback proves nothing", async () => {
    const harness = harnessFor(writer("w.evidence", [["x.txt", "y"]]));
    const outcome = await harness.runStep(step("w.evidence", ["always.fails"]));

    expect(outcome.evidence.rolledBack).toBe(true);
  });

  it("reports rolledBack:false when a failed step dirtied nothing", async () => {
    const harness = harnessFor(writer("w.clean", []));
    const outcome = await harness.runStep(step("w.clean", ["always.fails"]));

    // The step failed and the radius was snapshotted, but nothing changed —
    // saying "true" here would be a rollback that never happened.
    expect(outcome.evidence.rolledBack).toBe(false);
  });

  it("leaves evidence.rolledBack undefined for a capability with no radius at all", async () => {
    const pure: Capability = {
      manifest: {
        id: "pure.compute",
        version: "1.0.0",
        permissions: [],
        isolation: {},
        inputConstraints: {},
        outputs: {}, // returns {}; the empty declaration is the accurate one
        defaultBudget: { maxAttempts: 1, maxWallTimeMs: 1_000, maxCost: 1 },
        description: "mutates nothing",
      },
      async run() {
        return {};
      },
    };
    const outcome = await harnessFor(pure).runStep(step("pure.compute", ["always.fails"]));

    expect(outcome.status).toBe("failed");
    expect(outcome.evidence.rolledBack).toBeUndefined();
  });
});

describe("rollback scope comes from the manifest, not from a caller's guess", () => {
  /** The real absorbed capability this protects. */
  it("covers browser.navigate's spawn cwd, where its Python child writes", () => {
    const scope = rollbackScope(browserNavigate.manifest.isolation);

    expect(scope).toHaveLength(1);
    expect(scope[0]).toMatch(/browser-use$/);
  });

  it("is empty when a capability declares no writable radius", () => {
    expect(rollbackScope({})).toEqual([]);
    expect(rollbackScope(undefined)).toEqual([]);
  });

  it("covers writeRoots and cwd together", () => {
    expect(rollbackScope({ writeRoots: ["/a", "/b"], cwd: "/c" })).toEqual(["/a", "/b", "/c"]);
  });
});

describe("tree snapshots restore the whole radius, not a hand-listed set", () => {
  it("recreates a file the step deleted", async () => {
    await writeFile(join(root, "deleted-by-step.txt"), "bring me back", "utf8");
    const before = await snapshotTree([root]);

    await rm(join(root, "deleted-by-step.txt"));
    expect(await restoreTree(before)).toBe(true);

    expect(await readFile(join(root, "deleted-by-step.txt"), "utf8")).toBe("bring me back");
  });

  it("reaches files nested several directories deep", async () => {
    await mkdir(join(root, "a", "b", "c"), { recursive: true });
    await writeFile(join(root, "a", "b", "c", "deep.txt"), "original", "utf8");
    const before = await snapshotTree([root]);

    await writeFile(join(root, "a", "b", "c", "deep.txt"), "changed", "utf8");
    await writeFile(join(root, "a", "b", "new.txt"), "added", "utf8");
    await restoreTree(before);

    expect(await readFile(join(root, "a", "b", "c", "deep.txt"), "utf8")).toBe("original");
    expect(existsSync(join(root, "a", "b", "new.txt"))).toBe(false);
  });

  it("reports no change when the step left the radius untouched", async () => {
    await writeFile(join(root, "steady.txt"), "unchanged", "utf8");
    const before = await snapshotTree([root]);

    expect(await restoreTree(before)).toBe(false);
  });

  it("handles a root that does not exist yet without throwing", async () => {
    const missing = join(root, "not-created-yet");
    const before = await snapshotTree([missing]);

    expect(before.files.size).toBe(0);
    expect(await restoreTree(before)).toBe(false);
  });
});
