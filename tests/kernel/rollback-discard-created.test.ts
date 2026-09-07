/**
 * The second rollback strategy, added because #84's mission could not run
 * without it: snapshot refused on the SECOND repository cloned — 5,470 files
 * past a 5,000 cap — while trying to protect a directory that had not existed
 * before the step.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotCreatedEntries, discardCreatedEntries, snapshotTree } from "@/kernel/rollback";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "rollback-test-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("discard-created — removes what the step made, keeps what it found", () => {
  it("removes a tree created after the snapshot", async () => {
    const before = await snapshotCreatedEntries([root]);
    await mkdir(join(root, "cloned-repo", "src"), { recursive: true });
    await writeFile(join(root, "cloned-repo", "src", "index.ts"), "x");

    expect(await discardCreatedEntries(before)).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });

  it("LEAVES a pre-existing entry alone — this is the strategy's declared limit", async () => {
    await mkdir(join(root, "already-here"), { recursive: true });
    await writeFile(join(root, "already-here", "f.txt"), "original");

    const before = await snapshotCreatedEntries([root]);
    // The step both edits what was there AND creates something new.
    await writeFile(join(root, "already-here", "f.txt"), "MODIFIED");
    await mkdir(join(root, "new-clone"), { recursive: true });

    await discardCreatedEntries(before);

    // New thing gone; pre-existing directory still present.
    expect(await readdir(root)).toEqual(["already-here"]);
    // And its EDIT survives. Asserted rather than left implied, because this
    // is a real weakening versus snapshot rollback and a reader must be able
    // to see it stated in a test rather than only in a docstring.
    expect(await readFile(join(root, "already-here", "f.txt"), "utf8")).toBe("MODIFIED");
  });

  it("treats a root that does not exist yet as wholly new", async () => {
    const absent = join(root, "not-created-yet");
    const before = await snapshotCreatedEntries([absent]);
    await mkdir(join(absent, "repo"), { recursive: true });

    expect(await discardCreatedEntries(before)).toBe(true);
    expect(await readdir(absent)).toEqual([]);
  });

  it("reports false when the step created nothing", async () => {
    await mkdir(join(root, "kept"), { recursive: true });
    const before = await snapshotCreatedEntries([root]);
    expect(await discardCreatedEntries(before)).toBe(false);
    expect(await readdir(root)).toEqual(["kept"]);
  });

  it("SUCCEEDS where snapshot refuses — the reason this strategy exists", async () => {
    // 5,001 files: one past MAX_SNAPSHOT_FILES.
    const big = join(root, "huge-repo");
    await mkdir(big, { recursive: true });
    await Promise.all(
      Array.from({ length: 5_001 }, (_, i) => writeFile(join(big, `f${i}.txt`), "x")),
    );

    // The mechanism that blocked #84, reproduced.
    await expect(snapshotTree([root])).rejects.toThrow(/Rollback snapshot refused: 5001 files/);

    // The one that does not: cost is entries at the root (1), not files (5,001).
    const before = await snapshotCreatedEntries([root]);
    expect(before.entries.get(root)?.size).toBe(1);
  });
});
