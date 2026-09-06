/**
 * K3b — the artifact store. Content-addressed, so an artifact can never
 * silently change: the id IS the hash of the bytes.
 *
 * CONTENT-ADDRESSING HAS TWO HALVES, AND ONLY ONE OF THEM USED TO EXIST.
 * `put()` derives the id from the bytes, which makes the address honest on the
 * way IN. `get()` checked that a file was present and handed it back — so on
 * the way OUT, "the id IS the hash of the bytes" was a claim about something
 * nobody re-checked. Bytes edited underneath the store came back as though
 * they were the artifact requested, and the check over them reported green:
 * "artifact sha256:… readable, 1256 bytes". The check's name was honest; the
 * guarantee behind it was not. Found by OPTIMUS_AUDIT_2026-08-26 (#60).
 *
 * The invariant is now enforced on read: `get(id)` returns bytes that hash to
 * `id`, or it throws. That is what the rest of the kernel already assumed —
 * evidence chains, replay, memoisation on `inputHash` and rollback all treat
 * an address as proof of content, and none of them re-derived it.
 *
 * Two implementations share one interface (ADR-0003, ports and adapters): an
 * in-memory store for tests, a disk store for real runs. Swapping to
 * Postgres/S3 later is another adapter, not a rewrite — so the invariant
 * belongs to the INTERFACE rather than to either adapter, and both call the
 * same `verifyIntegrity`. `tests/kernel/artifact-integrity.test.ts` runs ONE
 * conformance suite over every implementation; adding an adapter means adding
 * it to that table. That is a real mechanism and it is also an opt-in one —
 * an adapter nobody adds to the table is not covered by it (THE ENFORCEMENT
 * RULE: say which, rather than implying the interface enforces itself).
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

/** The only shape an artifact id may take. */
const ADDRESS = /^sha256:([0-9a-f]{64})$/;

/**
 * Thrown when a store holds bytes at `requested` that hash to something else.
 *
 * Its own class, not a bare Error, because a caller must be able to tell
 * corruption from absence: absence means "run the step that produces it",
 * corruption means "something changed bytes the kernel had already sealed",
 * and answering the second with the first would quietly overwrite the
 * evidence that anything happened.
 *
 * The message deliberately carries the two addresses and a length, never the
 * content — an artifact can hold a page, a model response, or whatever a
 * capability was handed, and an exception string ends up in logs and evidence.
 */
export class ArtifactIntegrityError extends Error {
  constructor(
    readonly requested: ArtifactId,
    readonly actual: ArtifactId,
    readonly bytes: number,
  ) {
    super(
      `Artifact integrity failure: asked for ${requested}, but the stored bytes ` +
        `hash to ${actual} (${bytes} bytes). Content at that address changed after it was written.`,
    );
    this.name = "ArtifactIntegrityError";
  }
}

/** Thrown when the store simply does not hold that id. */
export class ArtifactMissingError extends Error {
  constructor(readonly id: ArtifactId) {
    super(`No such artifact: ${id}`);
    this.name = "ArtifactMissingError";
  }
}

/**
 * Thrown for an id that is not a content address at all. A caller bug rather
 * than a store state, which is why `has()` propagates it instead of answering
 * a calm "no" — "does the store have `../../etc/passwd`" is not a question
 * with a legitimate false.
 */
export class MalformedArtifactIdError extends Error {
  constructor(readonly id: ArtifactId) {
    super(`Malformed artifact id: ${id}`);
    this.name = "MalformedArtifactIdError";
  }
}

/**
 * Rejects anything that is not a well-formed content address, and returns the
 * bare hash. Shared by both adapters so they cannot drift on what an id is:
 * the disk store needs it before touching the filesystem (`sha256:../../etc/
 * passwd` would escape the store), and the memory store needs it so the
 * conformance suite is testing one contract rather than two.
 */
export function assertWellFormedId(id: ArtifactId): string {
  const match = ADDRESS.exec(id);
  if (!match) throw new MalformedArtifactIdError(id);
  return match[1];
}

/**
 * The read-side half of content-addressing. In one place because two adapters
 * enforcing an invariant separately is two adapters that will eventually
 * enforce it differently.
 */
export function verifyIntegrity(id: ArtifactId, data: string): string {
  const actual = addressOf(data);
  if (actual !== id) throw new ArtifactIntegrityError(id, actual, data.length);
  return data;
}

export interface ArtifactStore {
  put(data: string): Promise<ArtifactId>;
  /**
   * Returns bytes that hash to `id`.
   *
   * INVARIANT, not best effort. An implementation that can return anything
   * else has broken content-addressing for every consumer downstream, none of
   * which re-checks. Throws `ArtifactIntegrityError` on a mismatch and
   * `ArtifactMissingError` when the id is not held.
   */
  get(id: ArtifactId): Promise<string>;
  /**
   * True when the store holds INTACT bytes for `id`. A corrupted artifact
   * reads as absent, because a store holding the wrong bytes does not have
   * that artifact — it has some other bytes under that name.
   */
  has(id: ArtifactId): Promise<boolean>;
  /**
   * The ids the store has names for. ADVERTISED, not measured (THE COUNTING
   * RULE): listing does not read or hash anything, so an id from here is a
   * claim that `get()` has not yet checked. Deliberate — rollback snapshots
   * the id set, and a `list()` that threw on one corrupt artifact would
   * disable the mechanism that exists to recover from exactly that.
   */
  list(): Promise<ArtifactId[]>;
}

/**
 * `has` is the same question for every adapter — "can get() produce intact
 * bytes for this id" — so it is answered in exactly one place.
 *
 * The first draft did NOT do this: MemoryArtifactStore re-implemented the
 * comparison inline as `addressOf(found) === id`. Mutation-testing caught it
 * within the hour — stripping verification out of `get()` left Memory's
 * `has()` still returning the right answer, because it was consulting its own
 * private copy of the rule rather than the rule. Two copies of one invariant
 * is `stale-single-source` with the clock already running.
 */
async function holdsIntact(store: ArtifactStore, id: ArtifactId): Promise<boolean> {
  try {
    await store.get(id);
    return true;
  } catch (error) {
    // Absent and corrupt are both an honest "no". Anything else — EACCES, a
    // full disk, an unreadable mount — is a real fault, and reporting it as a
    // clean "no" would turn an outage into a missing artifact. A malformed id
    // propagates too: that is a caller bug, not a store state.
    if (error instanceof ArtifactIntegrityError || error instanceof ArtifactMissingError) return false;
    throw error;
  }
}

export class MemoryArtifactStore implements ArtifactStore {
  private readonly blobs = new Map<ArtifactId, string>();

  async put(data: string): Promise<ArtifactId> {
    const id = addressOf(data);
    this.blobs.set(id, data);
    return id;
  }

  /**
   * Verifies, even though nothing can realistically tamper with a private Map
   * in-process. Two reasons, and the second is the real one:
   *
   *   1. The invariant belongs to the interface, so an adapter that skips it
   *      is not an ArtifactStore — it is a Map with the same method names.
   *   2. Every kernel test runs against this store. If it did not enforce the
   *      invariant, no test could exercise the invariant without reaching for
   *      the disk, and the conformance suite would silently cover one adapter.
   */
  async get(id: ArtifactId): Promise<string> {
    assertWellFormedId(id);
    const found = this.blobs.get(id);
    if (found === undefined) throw new ArtifactMissingError(id);
    return verifyIntegrity(id, found);
  }

  async has(id: ArtifactId): Promise<boolean> {
    return holdsIntact(this, id);
  }

  async list(): Promise<ArtifactId[]> {
    return [...this.blobs.keys()].sort();
  }
}

export class DiskArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  private pathFor(id: ArtifactId): string {
    // The id is attacker-influenced whenever a capability picks it, so it is
    // rejected before it reaches the filesystem.
    return join(this.root, assertWellFormedId(id));
  }

  async put(data: string): Promise<ArtifactId> {
    const id = addressOf(data);
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(id), data, "utf8");
    return id;
  }

  async get(id: ArtifactId): Promise<string> {
    const path = this.pathFor(id);
    // Read directly rather than existsSync-then-read. The old guard was a
    // check-then-act on the filesystem — the same TOCTOU shape CodeQL flagged
    // in scripts/defect-registry.mjs (alert #55) — and letting the read throw
    // reports the real errno instead of collapsing every failure into
    // "No such artifact".
    let data: string;
    try {
      data = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ArtifactMissingError(id);
      throw error;
    }
    return verifyIntegrity(id, data);
  }

  async has(id: ArtifactId): Promise<boolean> {
    return holdsIntact(this, id);
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
