/**
 * The process-spawning primitive that SERVICE-fate capabilities need
 * (browser-use, n8n, harbor, ...): run the real engine as its own process,
 * never rewrite its logic. These tests use Node spawning Node — no Python,
 * no Chrome — so they run in CI with zero extra environment setup.
 * kernel/capabilities/browser-use/ is what actually exercises this against
 * a real external engine; that lives outside the CI-required suite because
 * it needs Python + a real browser (see that directory's README).
 */

import { describe, it, expect } from "vitest";

import { createContext, PermissionDenied } from "../../kernel/permissions";
import { MemoryArtifactStore } from "../../kernel/artifacts";

function ctx(granted: readonly ("proc:spawn")[] = []) {
  return createContext({
    capabilityId: "test.capability",
    granted,
    store: new MemoryArtifactStore(),
  });
}

describe("spawnProcess — permission boundary", () => {
  it("refuses to spawn without proc:spawn granted", async () => {
    await expect(
      ctx([]).spawnProcess({ command: "node", args: ["-e", "1"], timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(PermissionDenied);
  });

  it("spawns once proc:spawn is granted", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "console.log('hello from a real child process')"],
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello from a real child process");
    expect(result.timedOut).toBe(false);
  });
});

describe("spawnProcess — real process I/O", () => {
  it("writes input to stdin and captures it back out", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "process.stdin.on('data', d => process.stdout.write('echo:' + d))"],
      input: "round trip through a real pipe",
      timeoutMs: 5000,
    });
    expect(result.stdout).toBe("echo:round trip through a real pipe");
  });

  it("captures stderr separately from stdout", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "console.log('out'); console.error('err')"],
      timeoutMs: 5000,
    });
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
  });

  it("reports a non-zero exit code without throwing", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "process.exit(7)"],
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(7);
  });

  it("passes through extra environment variables", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "process.stdout.write(process.env.OPTIMUS_TEST_VAR ?? '')"],
      env: { OPTIMUS_TEST_VAR: "visible-to-the-child" },
      timeoutMs: 5000,
    });
    expect(result.stdout).toBe("visible-to-the-child");
  });
});

describe("spawnProcess — timeout kills a hung process (independent of the harness budget clock)", () => {
  it("kills the process and reports timedOut instead of hanging forever", async () => {
    const started = Date.now();
    const result = await ctx(["proc:spawn"]).spawnProcess({
      // A process that would otherwise run for 60s — the timeout must cut
      // this off, proving the kill is enforced HERE, not by the caller
      // remembering to check a budget between attempts.
      command: "node",
      args: ["-e", "setTimeout(() => {}, 60000)"],
      timeoutMs: 300,
    });
    const elapsed = Date.now() - started;

    expect(result.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });

  it("does not report timedOut for a process that finishes in time", async () => {
    const result = await ctx(["proc:spawn"]).spawnProcess({
      command: "node",
      args: ["-e", "1"],
      timeoutMs: 5000,
    });
    expect(result.timedOut).toBe(false);
  });
});

describe("spawnProcess — a nonexistent command fails honestly", () => {
  it("rejects rather than hanging when the command cannot be found", async () => {
    await expect(
      ctx(["proc:spawn"]).spawnProcess({
        command: "optimus-command-that-does-not-exist-xyz",
        timeoutMs: 5000,
      }),
    ).rejects.toThrow();
  });
});
