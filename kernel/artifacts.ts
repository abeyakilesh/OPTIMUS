/**
 * K3b — the artifact store. Content-addressed, so an artifact can never
 * silently change: the id IS the hash of the bytes.
 *
 * Two implementations share one interface (ADR-0003, ports and adapters):
 * an in-memory store for tests, and a disk store for real runs. Swapping to
 * Postgres/S3 later is another adapter, not a rewrite.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactId } from "./types";

export function hash(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function addressOf(data: string): ArtifactId {
  return `sha256:${hash(data)}`;
}

export interface ArtifactStore {
  put(data: string): Promise<ArtifactId>;
  get(id: ArtifactId): Promise<string>;
  has(id: ArtifactId): Promise<boolean>;
  list(): Promise<ArtifactId[]>;
}

export class MemoryArtifactStore implements ArtifactStore {
  private readonly blobs = new Map<ArtifactId, string>();

  async put(data: string): Promise<ArtifactId> {
    const id = addressOf(data);
    this.blobs.set(id, data);
    return id;
  }

  async get(id: ArtifactId): Promise<string> {
    const found = this.blobs.get(id);
    if (found === undefined) throw new Error(`No such artifact: ${id}`);
    return found;
  }

  async has(id: ArtifactId): Promise<boolean> {
    return this.blobs.has(id);
  }

  async list(): Promise<ArtifactId[]> {
    return [...this.blobs.keys()].sort();
  }
}

export class DiskArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  private pathFor(id: ArtifactId): string {
    // Reject anything that is not a well-formed content address before it
    // reaches the filesystem — otherwise "sha256:../../etc/passwd" escapes
    // the store. The id is attacker-influenced whenever a capability picks it.
    const match = /^sha256:([0-9a-f]{64})$/.exec(id);
    if (!match) throw new Error(`Malformed artifact id: ${id}`);
    return join(this.root, match[1]);
  }

  async put(data: string): Promise<ArtifactId> {
    const id = addressOf(data);
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(id), data, "utf8");
    return id;
  }

  async get(id: ArtifactId): Promise<string> {
    const path = this.pathFor(id);
    if (!existsSync(path)) throw new Error(`No such artifact: ${id}`);
    return readFile(path, "utf8");
  }

  async has(id: ArtifactId): Promise<boolean> {
    return existsSync(this.pathFor(id));
  }

  async list(): Promise<ArtifactId[]> {
    if (!existsSync(this.root)) return [];
    const names = await readdir(this.root);
    return names.map((n) => `sha256:${n}`).sort();
  }

  /** Used by rollback to restore the store to a previous set of ids. */
  async removeAllExcept(keep: ReadonlySet<ArtifactId>): Promise<void> {
    for (const id of await this.list()) {
      if (!keep.has(id)) await rm(this.pathFor(id), { force: true });
    }
  }
}

/**
 * Stable hash of arbitrary input, used for memoisation (`paths-filter` in the
 * CLAUDE.md mapping). Object keys are sorted so that `{a,b}` and `{b,a}` —
 * the same input written two ways — produce the same hash.
 */
export function hashInput(input: unknown): string {
  return hash(stableStringify(input));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
