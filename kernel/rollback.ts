/**
 * K2b — rollback.
 *
 * CLAUDE.md maps this to "revert a merge — including the parts that
 * succeeded". A mission that half-applied and then failed must be able to put
 * the world back exactly as it was; AC-5 asserts byte-identical restoration.
 *
 * Scope for WP-001: the artifact store and a declared set of files. Anything
 * a capability changes outside those must be registered here, or it is not
 * rollback-safe — and a capability that is not rollback-safe should not be
 * granted fs:write.
 */

import { readFile, writeFile, rm, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ArtifactId } from "./types";
import type { ArtifactStore } from "./artifacts";
import { DiskArtifactStore } from "./artifacts";

interface FileSnapshot {
  path: string;
  /** undefined means "did not exist" — restoring deletes it again. */
  contents: string | undefined;
}

export interface Snapshot {
  artifactIds: ReadonlySet<ArtifactId>;
  files: FileSnapshot[];
}

/**
 * Capture enough state to undo a mission. Take this BEFORE the mission runs.
 */
export async function snapshot(
  store: ArtifactStore,
  watchedFiles: readonly string[] = [],
): Promise<Snapshot> {
  const artifactIds = new Set(await store.list());

  const files: FileSnapshot[] = [];
  for (const path of watchedFiles) {
    files.push({
      path,
      contents: existsSync(path) ? await readFile(path, "utf8") : undefined,
    });
  }

  return { artifactIds, files };
}

/**
 * Restore to a snapshot. Artifacts created since the snapshot are removed;
 * watched files are returned to their exact previous bytes, including being
 * deleted again if they did not exist before.
 */
export async function rollback(store: ArtifactStore, snap: Snapshot): Promise<void> {
  if (store instanceof DiskArtifactStore) {
    await store.removeAllExcept(snap.artifactIds);
  }

  for (const file of snap.files) {
    if (file.contents === undefined) {
      await rm(file.path, { force: true });
    } else {
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(file.path, file.contents, "utf8");
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Tree snapshots — what makes rollback usable in production.
 *
 * `snapshot()` above takes an explicit list of files to watch. That is why it
 * has never had a production caller: in a real run, nobody knows which files a
 * capability is about to touch. AC-5 only passes because the test hands the
 * rollback the very file the "mission" created — information the kernel does
 * not have at snapshot time.
 *
 * K4 changed that. A capability's manifest now DECLARES where it may mutate:
 * `isolation.writeRoots` for its own writes, `isolation.cwd` for anything a
 * spawned child leaves behind. That declaration is the missing scope, so the
 * kernel can snapshot a whole radius up front without guessing.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Refuse rather than silently truncate. A snapshot that quietly skipped files
 * would restore a *partial* world and report success — a timebomb that reads
 * green while doing nothing, which is the exact class of defect this codebase
 * is built against.
 */
const MAX_SNAPSHOT_FILES = 5_000;

export interface TreeSnapshot {
  roots: readonly string[];
  /** Absolute path → contents at snapshot time. Absent path = did not exist. */
  files: ReadonlyMap<string, string>;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // root does not exist yet — nothing to capture, nothing to restore
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    // Symlinks are recorded as leaves, never followed: following one would
    // pull files outside the declared radius into the snapshot, and restoring
    // them would write outside the radius K4 just established.
    if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(full, out);
    else out.push(full);
  }
}

/** Capture every file beneath `roots`. Take this BEFORE the step runs. */
export async function snapshotTree(roots: readonly string[]): Promise<TreeSnapshot> {
  const paths: string[] = [];
  for (const root of roots) await walk(root, paths);

  if (paths.length > MAX_SNAPSHOT_FILES) {
    throw new Error(
      `Rollback snapshot refused: ${paths.length} files beneath ${roots.join(", ")} exceeds ` +
        `${MAX_SNAPSHOT_FILES}. Narrow the capability's writeRoots/cwd rather than rolling back blind.`,
    );
  }

  const files = new Map<string, string>();
  for (const path of paths) {
    try {
      files.set(path, await readFile(path, "utf8"));
    } catch {
      // Unreadable (a socket, a permission wall, a race with deletion). Left
      // out of the snapshot, so restore will not claim to have replaced it.
    }
  }
  return { roots, files };
}

/**
 * Put the declared radius back exactly as it was: files created since the
 * snapshot are deleted, changed files are rewritten byte-for-byte, and files
 * the step deleted are recreated. Returns true when anything actually changed,
 * so the caller can record the rollback in evidence instead of hiding it.
 */
export async function restoreTree(snap: TreeSnapshot): Promise<boolean> {
  const now: string[] = [];
  for (const root of snap.roots) await walk(root, now);
  let changed = false;

  for (const path of now) {
    if (!snap.files.has(path)) {
      await rm(path, { force: true });
      changed = true;
    }
  }

  for (const [path, contents] of snap.files) {
    let current: string | undefined;
    try {
      current = await readFile(path, "utf8");
    } catch {
      current = undefined;
    }
    if (current !== contents) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, "utf8");
      changed = true;
    }
  }
  return changed;
}

/**
 * The radius a step can dirty, straight from its manifest. `writeRoots` covers
 * the capability's own fsWrite calls; `cwd` covers whatever a spawned child
 * leaves behind — browser-use's Python bridge and the browser it drives both
 * write into their working directory, and before K4 pinned that directory the
 * kernel had no idea where "there" even was.
 */
export function rollbackScope(isolation: { writeRoots?: readonly string[]; cwd?: string } | undefined): string[] {
  if (!isolation) return [];
  const roots = [...(isolation.writeRoots ?? [])];
  if (isolation.cwd) roots.push(isolation.cwd);
  return roots;
}
