import { describe, it, expect } from "vitest";
import { gitClone, repoIntact, downloadRoot } from "../../kernel/gitClone";
import type { CheckContext, ProcessResult, ProcessSpec } from "../../kernel/types";

/**
 * #84, steps 2 and 4 — bring the repo down, and prove which commit arrived.
 *
 * RUN FOR REAL BEFORE THESE WERE WRITTEN, end to end, and cross-checked:
 *
 *   github.resolve  octocat/Hello-World  -> 7fd1a60b01f9
 *   git.clone       (on disk)            -> 7fd1a60b01f9
 *   git ls-remote   (different protocol) -> 7fd1a60b01f9
 *
 *   repo.intact(correct sha) -> PASS [observed] — "matches GitHub"
 *   repo.intact(WRONG sha)   -> FAIL — "commit mismatch"
 *
 * The fourth line is the one that matters: the check bites. A verification
 * that only ever passes is a green light, not a check.
 *
 * These tests are hermetic — `spawnProcess` is faked. CI must not clone from
 * GitHub, and #84 will do that 244 times without help from the test suite.
 */

const SHA = "7fd1a60b01f9d3904e94eab77b9db292f375aa9c";

/** A fake git that records its argv, so the commands can be asserted. */
function fakeGit(plan: Array<Partial<ProcessResult>>) {
  const seen: ProcessSpec[] = [];
  let i = 0;
  const spawnProcess = async (spec: ProcessSpec): Promise<ProcessResult> => {
    seen.push(spec);
    const r = plan[Math.min(i++, plan.length - 1)];
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1, ...r } as ProcessResult;
  };
  return { seen, spawnProcess };
}

const CLONE_OK: Array<Partial<ProcessResult>> = [
  { exitCode: 0 }, // clone
  { exitCode: 0, stdout: `${SHA}\n` }, // rev-parse HEAD
  { exitCode: 0, stdout: "README\nsrc/index.ts\npackage.json\n" }, // ls-files
];

const ctx = (git: ReturnType<typeof fakeGit>) =>
  ({
    spawnProcess: git.spawnProcess,
    putArtifact: async () => "sha256:" + "0".repeat(64),
    readArtifact: async () => "",
  }) as never;

const run = (git: ReturnType<typeof fakeGit>, input: unknown) =>
  gitClone.run(input, ctx(git)) as Promise<{ repo: string; path: string; sha: string; files: number }>;

/* ══ the contract ══════════════════════════════════════════════════════════ */

describe("git.clone declares what it really is", () => {
  it("admits its network access is unpoliced, rather than claiming a boundary", () => {
    // The clone's traffic happens inside a child the kernel cannot sandbox.
    // Declaring it is what lets the broker see the gap — and it is why the
    // plan compiler refuses to select this capability.
    expect(gitClone.manifest.isolation?.unconfinedChildEgress).toBe(true);
    expect(gitClone.manifest.permissions).toEqual(["proc:spawn", "fs:write"]);
  });

  it("writes only inside the download root, never the workspace", () => {
    const root = downloadRoot();
    expect(gitClone.manifest.isolation?.writeRoots).toEqual([root]);
    expect(gitClone.manifest.isolation?.cwd).toBe(root);
    expect(root).not.toContain("Claude AI SKIlls");
  });

  it("strips the environment down to what git needs", () => {
    // Every provider key and session secret in process.env is withheld from
    // the child. Named list, not a denylist.
    const env = gitClone.manifest.isolation?.env ?? [];
    expect(env).toContain("PATH");
    expect(JSON.stringify(env)).not.toMatch(/TOKEN|KEY|SECRET/i);
  });

  it("measures its own outputs, so they are capability-trust not untrusted", () => {
    // The whole comparison depends on these coming from a DIFFERENT source
    // than github.resolve's. These are measured on our disk.
    expect(gitClone.manifest.outputTrust.sha).toBe("capability");
    expect(gitClone.manifest.outputTrust.files).toBe("capability");
  });
});

/* ══ cloning ═══════════════════════════════════════════════════════════════ */

describe("cloning", () => {
  it("clones shallow and reports the commit that landed", async () => {
    const git = fakeGit(CLONE_OK);
    const out = await run(git, { repo: "octocat/Hello-World", dest: "hello" });
    expect(out.sha).toBe(SHA);
    expect(out.files).toBe(3);
    expect(git.seen[0].args).toContain("--depth");
    expect(git.seen[0].args).toContain("1");
  });

  it("asks the DISK for the sha, not GitHub — a second source, not an echo", async () => {
    // If this read a value handed in from github.resolve, the later
    // comparison would compare a number against itself.
    const git = fakeGit(CLONE_OK);
    await run(git, { repo: "octocat/Hello-World", dest: "hello" });
    const revParse = git.seen.find((s) => s.args?.includes("rev-parse"));
    expect(revParse?.args).toEqual(expect.arrayContaining(["-C", "rev-parse", "HEAD"]));
  });

  it("counts TRACKED files with ls-files, not a filesystem walk", async () => {
    // A walk counts .git internals and anything left behind, which inflates
    // the number that repo.intact leans on.
    const git = fakeGit(CLONE_OK);
    await run(git, { repo: "octocat/Hello-World", dest: "hello" });
    expect(git.seen.some((s) => s.args?.includes("ls-files"))).toBe(true);
  });

  it("REFUSES a dest that is a path rather than a name", async () => {
    const git = fakeGit(CLONE_OK);
    for (const dest of ["../escape", "a/b", "/abs"]) {
      await expect(run(git, { repo: "octocat/Hello-World", dest })).rejects.toThrow(
        /single directory name/,
      );
    }
  });

  it("REFUSES a repo that is not owner/repo", async () => {
    const git = fakeGit(CLONE_OK);
    await expect(run(git, { repo: "not-a-repo", dest: "x" })).rejects.toThrow(/not owner\/repo/);
  });

  it("fails honestly when git fails, carrying git's own words", async () => {
    const git = fakeGit([{ exitCode: 128, stderr: "fatal: repository not found" }]);
    await expect(run(git, { repo: "octocat/Nope", dest: "x" })).rejects.toThrow(
      /repository not found/,
    );
  });

  it("refuses a HEAD that is not a commit id rather than passing it on", async () => {
    const git = fakeGit([{ exitCode: 0 }, { exitCode: 0, stdout: "not-a-sha\n" }]);
    await expect(run(git, { repo: "octocat/Hello-World", dest: "x" })).rejects.toThrow(
      /not a commit id/,
    );
  });
});

/* ══ repo.intact — the check that cannot be faked ══════════════════════════ */

describe("repo.intact compares two independently-sourced answers", () => {
  const checkCtx = { readArtifact: async () => "" } as CheckContext;
  const cloned = { repo: "octocat/Hello-World", path: "/tmp/x", sha: SHA, files: 3 };

  it("PASSES when GitHub's sha and the disk's sha agree", async () => {
    const r = await repoIntact.run({ ...cloned, expectedSha: SHA }, checkCtx);
    expect(r.passed, r.reason).toBe(true);
    expect(r.verification).toBe("observed");
    expect(r.reason).toMatch(/matches GitHub/);
  });

  it("FAILS on a commit mismatch — the assertion the mission rests on", async () => {
    const r = await repoIntact.run({ ...cloned, expectedSha: "b".repeat(40) }, checkCtx);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/commit mismatch/);
  });

  it("FAILS an EMPTY clone, which is exactly how the 12 dead repos looked", async () => {
    // Twelve directories on disk were full trees with zero files. A check that
    // only compared shas would call an empty clone a success.
    const r = await repoIntact.run({ ...cloned, files: 0, expectedSha: SHA }, checkCtx);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/0 tracked files/);
  });

  it("FAILS when no expectedSha was supplied, rather than passing on no comparison", async () => {
    // The dangerous case: without this, a plan that forgot to wire
    // github.resolve's sha through would get a green tick meaning only
    // "something was cloned".
    const r = await repoIntact.run(cloned, checkCtx);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/no expectedSha/);
  });

  it("is `observed` and says so — the conclusion rests on what the clone did", () => {
    expect([...repoIntact.verification]).toEqual(["observed"]);
  });
});
