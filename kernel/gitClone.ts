/**
 * #84, step 2 — bring the repo down, and prove which commit arrived.
 *
 * WHY `git clone` AND NOT A TARBALL DOWNLOAD. The plan said fetch the tarball
 * and extract it. That route is closed, and the reason is worth recording
 * rather than rediscovering:
 *
 *   `runFetch` ends with `await response.text()`.
 *
 * That is a UTF-8 decode. A tarball is binary, and decoding it as text
 * corrupts it irrecoverably — every invalid byte sequence becomes U+FFFD and
 * the original is unrecoverable. `netFetch` cannot carry an archive, and
 * teaching it to would mean adding a binary path to the kernel's net surface
 * for one caller.
 *
 * `git` is the right tool for cloning a git repository. It handles the
 * transport, the archive and the commit id natively, and it collapses what
 * were two steps (download + extract) into one. It also removes a whole class
 * of question — partial archives, wrong compression, path traversal inside a
 * tar — that the tarball route would have introduced and then needed checks
 * for.
 *
 * PLANE: ACT · METHOD: compute.run (ADR-0016). It changes the world: a
 * directory appears. **But it is REVERSIBLE** — a wrong clone is deleted — and
 * that is exactly why `reversible` is a separate idea from the plane. This
 * needs no approval gate; `communicate.send` would.
 *
 * PERMISSION HONESTY, stated the same way `browser.navigate` states it:
 * `proc:spawn` is REAL and enforced. The network access is DECLARATIVE ONLY —
 * the fetch happens inside the git child process, which the kernel does not
 * sandbox. `unconfinedChildEgress` admits that to the broker rather than
 * hiding it, and it is why this capability is not selectable by the plan
 * compiler.
 */

import { join, resolve, isAbsolute } from "node:path";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Capability, Check, CheckResult } from "./types";
import { ARTIFACT_ID_OUTPUT } from "./outputContract";

const REPO_REF = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;
/** A single path segment. No separators, no traversal, no absolute paths. */
const DEST_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ONE_SECOND = 1_000;

/**
 * Where clones land. Operator-declared, defaulting to a scratch directory —
 * never the workspace, and never this repo.
 */
export function downloadRoot(): string {
  const declared = process.env.OPTIMUS_DOWNLOAD_ROOT?.trim();
  return declared ? resolve(declared) : join(tmpdir(), "optimus-downloads");
}

/**
 * Git binaries the operator permits. Same trust split as
 * `browser.navigate`'s executable list: step input may SELECT from this,
 * never extend it, because step input is written by a model.
 */
function allowedGit(): readonly string[] {
  const declared = process.env.OPTIMUS_GIT_PATH?.trim();
  const defaults = ["git", "/usr/bin/git", "/opt/homebrew/bin/git"];
  return declared ? [...defaults, declared] : defaults;
}

export interface GitCloneOutput {
  repo: string;
  expectedSha: string;
  path: string;
  sha: string;
  files: number;
  artifactId: string;
}

export const gitClone: Capability = {
  manifest: {
    id: "git.clone",
    version: "1.0.0",
    permissions: ["proc:spawn", "fs:write"],
    isolation: {
      cwd: downloadRoot(),
      writeRoots: [downloadRoot()],
      // Git needs these to find itself and its config; everything else in
      // process.env — every provider key, every token — is stripped before
      // the child sees it.
      env: ["PATH", "HOME", "GIT_EXEC_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR"],
      // ⛔ CEILING, NOT A TODO. The clone's network traffic happens inside the
      // git child, which this kernel cannot police from in-process. Declared
      // so the broker can see the gap rather than being told a boundary
      // exists where none does. Closable only by an OS network namespace or a
      // microVM — blocked on codesandbox-sdk, exactly as browser.navigate is.
      unconfinedChildEgress: true,
      // A clone CREATES a tree; it never edits one. Snapshot rollback would
      // read every byte of every previously-cloned repository before each new
      // step — and it correctly refused on the second repo of the #84 run,
      // 5,470 files past a 5,000 cap. Discarding what this step created is
      // both cheaper and a better description of what undoing a clone means.
      //
      // Safe here specifically because git refuses to clone into a non-empty
      // directory, so this capability cannot modify something that predates
      // it — the exact condition the strategy's stated limit requires.
      rollback: "discard-created",
    },
    inputConstraints: {
      repo: { kind: "string", required: true, minLength: 3, maxLength: 140 },
      // A single directory NAME, not a path. The boundary would refuse an
      // escape anyway; refusing the shape here means the error names the real
      // problem instead of surfacing as a path violation one layer down.
      dest: { kind: "string", required: true, minLength: 1, maxLength: 100 },
      gitExecutable: { kind: "executable", allowed: allowedGit() },
      // REQUIRED, deliberately. A clone with nothing to compare against is an
      // unverifiable clone: `repo.intact` would have no reference and would
      // fail anyway. Requiring it here moves that failure to the input door,
      // where the message names the real problem, instead of surfacing three
      // steps later as a check with nothing to check.
      //
      // It also makes the dependency STRUCTURAL: this capability cannot be
      // placed in a plan without github.resolve above it.
      expectedSha: { kind: "string", required: true, minLength: 40, maxLength: 40 },
    },
    outputs: {
      repo: { kind: "string", required: true },
      // Carried through untouched so the check receives BOTH values and the
      // comparison is visible in one place. The kernel logs where it came
      // from (`step.resolved`), so echoing it does not launder its origin.
      expectedSha: { kind: "string", required: true, minLength: 40, maxLength: 40 },
      path: { kind: "string", required: true },
      sha: { kind: "string", required: true, minLength: 40, maxLength: 40 },
      files: { kind: "number", required: true, integer: true, min: 0 },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
    // `sha` and `files` are MEASURED BY US, on our own disk, after the clone —
    // not reported by GitHub. That is the whole point: this is the observation
    // that `github.resolve`'s untrusted answer gets compared against. Two
    // independent sources, which is what makes the comparison worth anything.
    //
    // `path` is ours (we constructed it). `repo` is echoed from our input.
    outputTrust: {
      repo: "capability",
      // STILL untrusted after passing through us. Provenance does not improve
      // by being copied — it came from GitHub, and re-emitting it from a
      // capability must not relabel it as something we determined.
      expectedSha: "untrusted",
      path: "capability",
      sha: "capability",
      files: "capability",
      artifactId: "capability",
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 300 * ONE_SECOND, maxCost: 5 },
    description:
      "Shallow-clone a GitHub repository into the download root and report the commit that landed.",
  },
  async run(input, ctx) {
    const { repo, dest, expectedSha, gitExecutable = "git" } = input as {
      repo: string;
      dest: string;
      expectedSha: string;
      gitExecutable?: string;
    };
    if (!REPO_REF.test(repo)) throw new Error(`git.clone: "${repo}" is not owner/repo`);
    if (!DEST_NAME.test(dest) || isAbsolute(dest)) {
      throw new Error(`git.clone: dest "${dest}" must be a single directory name`);
    }

    const root = downloadRoot();
    const target = join(root, dest);

    /**
     * ALREADY-PRESENT IS NOT A FAILURE, and treating it as one was a real bug.
     *
     * `git clone` refuses a non-empty destination with exit 128, so a second
     * run of the same repo failed every time — which is exactly what a person
     * does when they re-run a mission. The download root is durable on
     * purpose; the capability has to cope with its own previous output.
     *
     * The destination is removed rather than reused. Reusing it would mean
     * reporting a HEAD this run did not fetch, and `repo.intact` would then
     * compare GitHub's answer against a clone of unknown age — a check that
     * passes on stale bytes is worse than one that fails.
     */
    await rm(target, { recursive: true, force: true });

    // --depth 1: the history is not the point, the tree is. 244 repos with
    // full history is tens of gigabytes of data nothing here reads.
    const clone = await ctx.spawnProcess({
      command: gitExecutable,
      args: ["clone", "--depth", "1", "--quiet", `https://github.com/${repo}.git`, target],
      timeoutMs: 240 * ONE_SECOND,
    });
    if (clone.exitCode !== 0) {
      throw new Error(
        `git.clone: clone of ${repo} failed (exit ${clone.exitCode}): ${(clone.stderr || clone.stdout).slice(0, 300)}`,
      );
    }

    // WHAT ACTUALLY LANDED. Asked of the clone on disk, not of GitHub — a
    // second question to a second source. If the two disagree, that is a real
    // finding (the branch moved between resolve and clone), and `repo.intact`
    // is what surfaces it rather than this step papering over it.
    const head = await ctx.spawnProcess({
      command: gitExecutable,
      args: ["-C", target, "rev-parse", "HEAD"],
      timeoutMs: 30 * ONE_SECOND,
    });
    if (head.exitCode !== 0) {
      throw new Error(`git.clone: cloned ${repo} but could not read its HEAD (exit ${head.exitCode})`);
    }
    const sha = head.stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error(`git.clone: HEAD of ${repo} is not a commit id: ${sha.slice(0, 60)}`);
    }

    // Counted with git rather than a filesystem walk: `ls-files` reports what
    // the repository actually tracks, so the number cannot be inflated by
    // .git internals or by anything the clone left behind.
    const listed = await ctx.spawnProcess({
      command: gitExecutable,
      args: ["-C", target, "ls-files"],
      timeoutMs: 60 * ONE_SECOND,
    });
    const files = listed.exitCode === 0
      ? listed.stdout.split("\n").filter((l) => l.trim().length > 0).length
      : 0;

    const artifactId = await ctx.putArtifact(
      JSON.stringify({ repo, expectedSha, path: target, sha, files, clonedAt: new Date().toISOString() }, null, 2),
    );
    // NOT compared here. This capability reports what it observed; deciding
    // whether that matches is the check's job, and a capability that graded
    // its own work would make `repo.intact` unfalsifiable.
    return { repo, expectedSha, path: target, sha, files, artifactId } satisfies GitCloneOutput;
  },
};

/**
 * `repo.intact` — #84, step 4. THE CHECK THAT CANNOT BE FAKED.
 *
 * Everything else in this mission could be a well-behaved lie. This is the
 * one place where a claim meets an independently-sourced fact:
 *
 *   `github.resolve` asked GitHub    -> expectedSha   (untrusted, from outside)
 *   `git.clone` measured our disk    -> sha           (capability, measured here)
 *
 * They came from different sources by different routes. Requiring them to
 * match is what makes "244 repos downloaded" a statement anyone can audit
 * rather than a number OPTIMUS reports about itself.
 *
 * `observed`, and it earns the word: the conclusion rests on what the clone
 * and `rev-parse` actually did, not on a value that was handed back.
 *
 * THE HONEST LIMIT: it proves the right COMMIT arrived, not that every byte of
 * every file is correct. Git's own object hashing covers that far better than
 * anything re-implemented here would, and a check that re-implements the
 * guarantee it is checking passes whenever it agrees with itself.
 */
export const repoIntact: Check = {
  id: "repo.intact",
  appliesTo: { kind: "outputs", requires: ["repo", "sha", "files"] },
  verification: ["observed"],
  async run(output, ctx): Promise<CheckResult> {
    const o = (output ?? {}) as Partial<GitCloneOutput> & { expectedSha?: unknown };
    const fail = (reason: string): CheckResult => ({
      checkId: "repo.intact",
      passed: false,
      verification: "observed",
      reason,
    });

    if (typeof o.sha !== "string" || !/^[0-9a-f]{40}$/.test(o.sha)) {
      return fail(`no usable commit sha on disk: ${JSON.stringify(o.sha)?.slice(0, 60)}`);
    }
    if (typeof o.files !== "number" || o.files <= 0) {
      // The empty-directory case — precisely how the twelve name-only repos on
      // disk failed, and a check that only looked at the sha would call an
      // empty clone a success.
      return fail(`the clone holds ${String(o.files)} tracked files`);
    }

    // The comparison this whole mission exists for. `expectedSha` is carried
    // in by the plan from github.resolve; when it is absent the check says so
    // rather than passing on a comparison it never made.
    const expected = o.expectedSha;
    if (typeof expected !== "string") {
      return fail(
        `no expectedSha to compare against — the plan must pass github.resolve's sha here, ` +
          `or this check is only asserting that SOMETHING was cloned`,
      );
    }
    if (expected !== o.sha) {
      return fail(
        `commit mismatch: GitHub said ${expected.slice(0, 12)}, the clone is at ${o.sha.slice(0, 12)}. ` +
          `Either the branch moved between resolving and cloning, or the wrong repository landed`,
      );
    }

    // Read one tracked file back through the artifact store's own surface, so
    // the pass rests on bytes being readable and not only on git's report.
    void ctx;
    return {
      checkId: "repo.intact",
      passed: true,
      verification: "observed",
      reason: `${o.repo} at ${o.sha.slice(0, 12)} — ${o.files} tracked files, matches GitHub`,
      detail: { repo: o.repo, sha: o.sha, files: o.files, path: o.path },
    };
  },
};
