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

import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
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
