import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MemoryArtifactStore,
  DiskArtifactStore,
  ArtifactIntegrityError,
  ArtifactMissingError,
  MalformedArtifactIdError,
  addressOf,
  type ArtifactStore,
} from "../../kernel/artifacts";
import { artifactIntact } from "../../kernel/builtin";
import type { CheckContext } from "../../kernel/types";

/**
 * #60 — content-addressing enforced on the way OUT.
 *
 * `put()` always derived the id from the bytes. `get()` checked a file was
 * there and returned it, so the address was proof of nothing on read, and the
 * check over it reported "readable, N bytes" on content nobody had verified.
 *
 * ONE suite, run against EVERY implementation. The invariant belongs to the
 * `ArtifactStore` interface, so a per-adapter test would be testing an adapter
 * rather than the contract — and the two would drift, which is the specific
 * thing having one interface is meant to prevent. A new adapter is added to
 * the table below as part of writing it.
 */

const BODY = "the bytes that were actually sealed";
const EVIL = "the bytes somebody put there instead";

const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

interface StoreUnderTest {
  name: string;
  make(): ArtifactStore;
  /** Replace the stored bytes for `id` without going through put(). */
  tamper(store: ArtifactStore, id: string, evil: string): void;
}

const IMPLEMENTATIONS: StoreUnderTest[] = [
  {
    name: "MemoryArtifactStore",
    make: () => new MemoryArtifactStore(),
    // Reaches past the public API on purpose: the point is to simulate bytes
    // changing underneath the store, which is exactly what put() forbids.
    tamper: (store, id, evil) => {
      (store as unknown as { blobs: Map<string, string> }).blobs.set(id, evil);
    },
  },
  {
    name: "DiskArtifactStore",
    make: () => {
      const root = mkdtempSync(join(tmpdir(), "optimus-artifacts-"));
      tempRoots.push(root);
      return new DiskArtifactStore(root);
    },
    tamper: (store, id, evil) => {
      const root = (store as unknown as { root: string }).root;
      writeFileSync(join(root, id.slice("sha256:".length)), evil, "utf8");
    },
  },
];

describe.each(IMPLEMENTATIONS)("$name honours the ArtifactStore contract", (impl) => {
  it("round-trips bytes it stored itself", async () => {
    const store = impl.make();
    const id = await store.put(BODY);
    expect(id).toBe(addressOf(BODY));
    expect(await store.get(id)).toBe(BODY);
    expect(await store.has(id)).toBe(true);
  });

  it("THE TAMPER CASE: get() throws when the stored bytes no longer hash to the id", async () => {
    const store = impl.make();
    const id = await store.put(BODY);
    impl.tamper(store, id, EVIL);

    await expect(store.get(id)).rejects.toThrow(ArtifactIntegrityError);
  });

  it("names both addresses, and never puts the content in the message", async () => {
    const store = impl.make();
    const id = await store.put(BODY);
    impl.tamper(store, id, EVIL);

    const error = await store.get(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArtifactIntegrityError);
    const err = error as ArtifactIntegrityError;
    expect(err.requested).toBe(id);
    expect(err.actual).toBe(addressOf(EVIL));
    // An artifact can hold a model response or a fetched page, and this string
    // reaches logs and evidence. It reports the mismatch, not the bytes.
    expect(err.message).not.toContain(EVIL);
    expect(err.message).not.toContain(BODY);
  });

  it("reports a tampered artifact as ABSENT rather than present", async () => {
    const store = impl.make();
    const id = await store.put(BODY);
    impl.tamper(store, id, EVIL);
    // A store holding the wrong bytes does not have that artifact. Answering
    // has() with `true` here is what made "the file is there" pass for
    // "the artifact is there".
    expect(await store.has(id)).toBe(false);
  });

  it("distinguishes missing from corrupt — they need different responses", async () => {
    const store = impl.make();
    const absent = addressOf("never stored");
    await expect(store.get(absent)).rejects.toThrow(ArtifactMissingError);
    await expect(store.get(absent)).rejects.not.toThrow(ArtifactIntegrityError);
    expect(await store.has(absent)).toBe(false);
  });

  it("refuses an id that is not a content address, on both get and has", async () => {
    const store = impl.make();
    for (const bad of ["sha256:../../etc/passwd", "not-an-id", "sha256:abc", `sha256:${"z".repeat(64)}`]) {
      await expect(store.get(bad)).rejects.toThrow(MalformedArtifactIdError);
      // Propagated, not answered "false": asking whether the store holds
      // `../../etc/passwd` is a caller bug, and a calm no would hide it.
      await expect(store.has(bad)).rejects.toThrow(MalformedArtifactIdError);
    }
  });
});

describe("the check over a tampered artifact", () => {
  it("goes RED — this is the green-check-on-unverified-bytes the audit named", async () => {
    const store = new MemoryArtifactStore();
    const id = await store.put(BODY);
    IMPLEMENTATIONS[0].tamper(store, id, EVIL);

    const ctx = { readArtifact: (i: string) => store.get(i) } as CheckContext;
    const result = await artifactIntact.run({ artifactId: id }, ctx);

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/integrity failure/i);
    // The old failure mode, pinned so it cannot come back: it used to pass
    // here and report a byte count for content nobody had checked.
    expect(result.reason).not.toMatch(/readable and intact/);
  });

  it("stays GREEN on an untouched artifact, and says intact", async () => {
    const store = new MemoryArtifactStore();
    const id = await store.put(BODY);
    const ctx = { readArtifact: (i: string) => store.get(i) } as CheckContext;
    const result = await artifactIntact.run({ artifactId: id }, ctx);

    expect(result.passed).toBe(true);
    expect(result.reason).toMatch(/readable and intact/);
  });
});

/**
 * THE MUTATION RULE, automated for this one subject.
 *
 * The tamper tests above are only proof if they FAIL when the verification is
 * removed. Three times in this repo a test has stayed green while its subject
 * was gone, so this asserts the counterfactual directly: compile the real
 * `kernel/artifacts.ts` with the `verifyIntegrity` calls stripped out, run the
 * same scenario, and require that the corrupted read comes back CLEAN.
 *
 * It mutates the real source rather than a copy on purpose. A hand-written
 * "unverified store" would prove that a store I wrote to skip verification
 * skips verification — the exact tautology this rule exists to catch.
 */
describe("mutation: the tamper tests fail when verification is removed", () => {
  const SOURCE = join("kernel", "artifacts.ts");
  const MUTATIONS: Array<[RegExp, string]> = [
    [/return verifyIntegrity\(id, found\);/, "return found;"],
    [/return verifyIntegrity\(id, data\);/, "return data;"],
  ];

  it("a store with the check stripped returns the TAMPERED bytes without complaint", async () => {
    const original = readFileSync(SOURCE, "utf8");
    let mutated = original;
    for (const [pattern, replacement] of MUTATIONS) {
      // Anti-rot: if the call this test removes is no longer there under this
      // name, the test is not mutating anything and must say so loudly rather
      // than quietly proving nothing.
      expect(pattern.test(mutated), `mutation target ${pattern} is gone from ${SOURCE}`).toBe(true);
      mutated = mutated.replace(pattern, replacement);
    }
    expect(mutated).not.toBe(original);

    // Unique name: vitest runs test FILES in parallel, and a fixed path here
    // would race any other suite compiling the same module.
    const mutantPath = join("kernel", `artifacts.mutant-${process.pid}-${Date.now()}.ts`);
    writeFileSync(mutantPath, mutated, "utf8");

    try {
      const mutant = (await import(pathToFileURL(resolve(mutantPath)).href)) as {
        MemoryArtifactStore: new () => ArtifactStore;
      };
      const store = new mutant.MemoryArtifactStore();
      const id = await store.put(BODY);
      (store as unknown as { blobs: Map<string, string> }).blobs.set(id, EVIL);

      // THE ASSERTION THAT MAKES THE TAMPER TESTS REAL. With verification
      // removed the corrupted read succeeds and hands back the wrong bytes —
      // so the tests above are detecting the check, not something else.
      await expect(store.get(id)).resolves.toBe(EVIL);

      // And has() goes blind with it. That is the SINGLE-SOURCING assertion:
      // this line read `.toBe(false)` while Memory's has() compared
      // `addressOf(found) === id` itself, and it kept answering correctly with
      // get()'s verification stripped out — a second copy of the invariant,
      // caught by this very mutation. Now both adapters answer has() through
      // get(), so removing the one check disables both. If this ever reads
      // false again, a copy has grown back.
      await expect(store.has(id)).resolves.toBe(true);
    } finally {
      unlinkSync(mutantPath);
    }
  });
});
