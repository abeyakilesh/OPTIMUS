import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { reposExtract, reposFound, extractRepoRefs } from "../../kernel/capabilities/tasklist";
import { artifactIntact } from "../../kernel/builtin";
import type { Capability } from "../../kernel/types";

/**
 * #84, first slice — OPTIMUS reads its own task list.
 *
 * The acceptance mission is "download the ~215 repos named in the missing-
 * domains document". This is the half that needs no network: read the file,
 * parse the list, and refuse to call an empty parse a success.
 *
 * `fs.readFile` is the FIRST capability in the kernel to use `fs:read` at all.
 * The boundary has existed since the beginning and nothing had ever crossed
 * it, so these tests are the first time it runs outside its own unit tests.
 */

/** A root with a task list in it, plus a secret OUTSIDE it to escape toward. */
function sandboxRoot(): { root: string; outside: string } {
  const base = mkdtempSync(join(tmpdir(), "optimus-tasklist-"));
  const root = join(base, "allowed");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "list.md"), "see `prisma/prisma` and https://github.com/honojs/hono\n");
  const outside = join(base, "secret.txt");
  writeFileSync(outside, "SHOULD NEVER BE READ");
  return { root, outside };
}

/** `fs.readFile` bound to a specific root, built the way the real one is. */
function readFileBoundTo(root: string): Capability {
  return {
    manifest: {
      id: "fs.readFile",
      version: "1.0.0",
      permissions: ["fs:read"],
      isolation: { readRoots: [root] },
      inputConstraints: { path: { kind: "string", required: true, minLength: 1, maxLength: 4096 } },
      outputs: {
        text: { kind: "string", required: true },
        bytes: { kind: "number", required: true, integer: true, min: 0 },
        artifactId: { kind: "string", required: true, minLength: 71, maxLength: 71 },
      },
      outputTrust: { text: "untrusted", bytes: "capability", artifactId: "capability" },
      defaultBudget: { maxAttempts: 1, maxWallTimeMs: 5_000, maxCost: 1 },
      description: "test-bound reader",
    },
    async run(input, ctx) {
      const { path } = input as { path: string };
      const text = await ctx.fsRead(path);
      return { text, bytes: text.length, artifactId: await ctx.putArtifact(text) };
    },
  };
}

function kernel(root: string) {
  const broker = new Broker();
  broker.register(readFileBoundTo(root));
  broker.register(reposExtract);
  broker.registerCheck(reposFound);
  // Every step needs at least one check — the harness refuses a step that
  // declares none, which is the rule "a step is done only when a check passes".
  broker.registerCheck(artifactIntact);
  const store = new MemoryArtifactStore();
  return { broker, harness: new Harness({ broker, store }), store };
}

/* ══ the fs:read boundary, crossed for the first time ══════════════════════ */

describe("fs.readFile stays inside the operator-declared root", () => {
  it("reads a file inside the root", async () => {
    const { root } = sandboxRoot();
    const { harness } = kernel(root);
    const outcome = await harness.runStep({
      id: "read",
      capabilityId: "fs.readFile",
      input: { path: join(root, "list.md") },
      dependsOn: [],
      checks: ["artifact.intact"],
    });
    expect(outcome.status, JSON.stringify(outcome.evidence.checks)).toBe("passed");
  });

  it("REFUSES a path that climbs out with ..", async () => {
    const { root } = sandboxRoot();
    const { harness } = kernel(root);
    const outcome = await harness.runStep({
      id: "escape",
      capabilityId: "fs.readFile",
      input: { path: join(root, "..", "secret.txt") },
      dependsOn: [],
      checks: ["artifact.intact"],
    });
    expect(outcome.status).not.toBe("passed");
    expect(JSON.stringify(outcome.evidence)).not.toContain("SHOULD NEVER BE READ");
  });

  it("REFUSES a SYMLINK inside the root pointing out of it", async () => {
    // The case a string comparison gets wrong: the path IS under the root
    // until it is resolved. `requirePathWithin` resolves before comparing, so
    // this is refused by the boundary rather than by luck.
    const { root, outside } = sandboxRoot();
    symlinkSync(outside, join(root, "innocent.md"));
    const { harness } = kernel(root);
    const outcome = await harness.runStep({
      id: "symlink",
      capabilityId: "fs.readFile",
      input: { path: join(root, "innocent.md") },
      dependsOn: [],
      checks: ["artifact.intact"],
    });
    expect(outcome.status).not.toBe("passed");
    expect(JSON.stringify(outcome.evidence)).not.toContain("SHOULD NEVER BE READ");
  });

  it("declares the file's contents UNTRUSTED", () => {
    // Same reasoning as html.extractTitle.title: the FUNCTION is a read, the
    // VALUE is whatever someone put in the file. A task list is precisely the
    // kind of document that gets pasted into from the internet.
    expect(readFileBoundTo("/tmp").manifest.outputTrust.text).toBe("untrusted");
  });
});

/* ══ the parser ════════════════════════════════════════════════════════════ */

describe("extractRepoRefs finds repos and not path-shaped noise", () => {
  it("reads both forms the document actually uses", () => {
    const md = "Use `prisma/prisma` or https://github.com/honojs/hono for this.";
    expect(extractRepoRefs(md)).toEqual(["honojs/hono", "prisma/prisma"]);
  });

  it("does NOT match slug-shaped prose that is not a repo", () => {
    // `docs/adr` and `kernel/models` are slug-shaped. A general "looks like a
    // path" match would swallow them and inflate the count with things that
    // cannot be downloaded — a number that fails on first use.
    const md = "See docs/adr and kernel/models for details, plus src/index.ts.";
    expect(extractRepoRefs(md)).toEqual([]);
  });

  it("deduplicates, because the document names some repos twice", () => {
    const md = "`prisma/prisma` … later https://github.com/prisma/prisma again";
    expect(extractRepoRefs(md)).toEqual(["prisma/prisma"]);
  });

  it("strips .git and trailing punctuation the prose leaves behind", () => {
    expect(extractRepoRefs("clone https://github.com/honojs/hono.git.")).toEqual(["honojs/hono"]);
    expect(extractRepoRefs("see https://github.com/vercel/turborepo), next")).toEqual([
      "vercel/turborepo",
    ]);
  });

  it("handles owners and repos with dots, dashes and underscores", () => {
    const md = "`chartjs/Chart.js` `hello-pangea/dnd` `The-Z-Labs/linux-exploit-suggester`";
    expect(extractRepoRefs(md)).toEqual([
      "chartjs/Chart.js",
      "hello-pangea/dnd",
      "The-Z-Labs/linux-exploit-suggester",
    ]);
  });
});

/* ══ the check refuses an empty parse ══════════════════════════════════════ */

describe("repos.found refuses a parse that matched nothing", () => {
  const run = (output: unknown) =>
    reposFound.run(output, { readArtifact: async () => "" });

  it("passes a real list", async () => {
    const r = await run({ repos: ["a/b", "c/d"], count: 2 });
    expect(r.passed, r.reason).toBe(true);
  });

  it("FAILS on an empty list — the failure this check exists for", async () => {
    // A parser that matches nothing looks identical to a document with
    // nothing in it. `Array.isArray(repos)` would pass here, which is why the
    // check asserts meaning rather than shape.
    const r = await run({ repos: [], count: 0 });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/no repos at all/);
  });

  it("FAILS when the count disagrees with the list — THE COUNTING RULE, small", async () => {
    const r = await run({ repos: ["a/b"], count: 215 });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/count says 215 but the list holds 1/);
  });

  it("FAILS on entries that are not owner/repo", async () => {
    const r = await run({ repos: ["a/b", "just-a-word"], count: 2 });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/not owner\/repo/);
  });
});

/* ══ the two chained, as the mission will chain them ═══════════════════════ */

describe("read then parse, as one data flow", () => {
  it("runs fs.readFile -> repos.extract and the check passes", async () => {
    const { root } = sandboxRoot();
    const { broker, harness, store } = kernel(root);
    expect(broker.hasCheck("repos.found")).toBe(true);

    const read = await harness.runStep({
      id: "read",
      capabilityId: "fs.readFile",
      input: { path: join(root, "list.md") },
      dependsOn: [],
      checks: ["artifact.intact"],
    });
    expect(read.status, JSON.stringify(read.evidence.checks)).toBe("passed");
    const artifactId = (read.evidence.producedArtifactIds ?? [])[0];
    expect(artifactId, "the read stored the document").toBeTruthy();

    const parse = await harness.runStep({
      id: "parse",
      capabilityId: "repos.extract",
      input: { artifactId },
      dependsOn: ["read"],
      checks: ["repos.found"],
    });
    expect(parse.status, JSON.stringify(parse.evidence.checks)).toBe("passed");

    const found = parse.evidence.checks.find((c) => c.checkId === "repos.found");
    expect(found?.verification).toBe("reasoned");
    expect(found?.detail?.count).toBe(2);
    expect(store).toBeTruthy();
  });
});
