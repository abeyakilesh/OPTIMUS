/**
 * #84, first slice: OPTIMUS reads its own task list off the disk.
 *
 * LIVES BESIDE `builtin.ts`, NOT IN `kernel/capabilities/`. That directory is
 * for adapters over ABSORBED REPOS — browser-use, omniroute, scrapling — and
 * the absorption guard treats a new entry there as a repo absorption, demanding
 * a fidelity story and an Absorption Score. These two are kernel builtins with
 * no parent repo to be faithful to. The guard was right and the first draft's
 * file placement was wrong; `absorption-guard.test.ts` asserts that directory
 * holds exactly three.
 *
 * The acceptance mission is "download the ~215 repos named in
 * `MISSING_DOMAINS_AND_REPOS.md`". Before anything can be downloaded, the list
 * has to be read and parsed — and that half needs no network, so it is where
 * the vertical slice starts.
 *
 * WHY THIS IS THE RIGHT FIRST STEP AND NOT BUSYWORK: it is the first capability
 * in the kernel to use `fs:read` at all. `permissions.ts` has had `fsRead`
 * since the beginning, gated on a bounded `readRoots`, and **nothing has ever
 * exercised it**. A boundary no capability has crossed is a boundary whose
 * tests are the only thing that has ever run it.
 *
 * THE ROOT IS OPERATOR-DECLARED, and this follows `browser.navigate`'s
 * precedent exactly rather than inventing a new rule:
 *
 *   - STEP INPUT is untrusted. It is about to be written by a plan compiler
 *     driven by a model, so a path from step input may only SELECT within the
 *     root, never extend it.
 *   - ENVIRONMENT is the operator. Whoever sets `OPTIMUS_TASKLIST_ROOT` already
 *     chose this process's working directory and its interpreter.
 *
 * The default root is the repo itself, so the capability is useless-but-safe
 * out of the box. The task-list document lives in the workspace ABOVE this
 * repo — deliberately, because `CLAUDE.md` and its companions are never
 * committed here — so reading it is an explicit operator decision, made once,
 * in the environment.
 */

import { resolve } from "node:path";
import type { Capability, Check, CheckResult } from "./types";
import { ARTIFACT_ID_OUTPUT } from "./outputContract";

/**
 * Operator-declared read root. Undefined and empty both fall back to the repo,
 * which contains no task list — so the failure is "not found", never a silent
 * widening.
 */
function taskListRoot(): string {
  const declared = process.env.OPTIMUS_TASKLIST_ROOT?.trim();
  return declared ? resolve(declared) : resolve(process.cwd());
}

const ONE_SECOND = 1_000;

export interface ReadFileOutput {
  text: string;
  bytes: number;
  artifactId: string;
}

/**
 * `fs.readFile` — read one text file from inside the declared root.
 *
 * Containment is `requirePathWithin` in sandbox.ts, which resolves symlinks
 * before comparing, so `root/../../etc/passwd` and a symlink pointing out are
 * both refused by the same check rather than by a string comparison this file
 * would have had to get right on its own.
 */
export const fsReadFile: Capability = {
  manifest: {
    id: "fs.readFile",
    version: "1.0.0",
    permissions: ["fs:read"],
    // `assertBoundedRadius` refuses `fs:read` with no readRoots, so this is
    // not optional — a capability that could read anywhere would be refused at
    // registration, which is the boundary working before any mission runs.
    isolation: { readRoots: [taskListRoot()] },
    inputConstraints: {
      // Bounded, and that is the whole contract: the value is a path the
      // kernel is about to act on, and the length cap is what stops a
      // pathological input reaching the filesystem layer at all.
      path: { kind: "string", required: true, minLength: 1, maxLength: 4096 },
    },
    outputs: {
      text: { kind: "string", required: true },
      bytes: { kind: "number", required: true, integer: true, min: 0 },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
    // `text` IS UNTRUSTED — bytes off a disk this kernel did not author. The
    // same reasoning as `html.extractTitle.title`: the FUNCTION is a read, the
    // VALUE is whatever someone put in the file. A task list is exactly the
    // kind of file that gets edited by hand and pasted into from the internet.
    outputTrust: {
      text: "untrusted",
      bytes: "capability",
      artifactId: "capability",
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 10 * ONE_SECOND, maxCost: 1 },
    description: "Read a UTF-8 text file from inside the operator-declared task-list root.",
  },
  async run(input, ctx) {
    const { path } = input as { path: string };
    const text = await ctx.fsRead(path);
    const artifactId = await ctx.putArtifact(text);
    return { text, bytes: text.length, artifactId } satisfies ReadFileOutput;
  },
};

/**
 * Every `owner/repo` GitHub reference in the text, deduplicated, in order.
 *
 * TWO FORMS, because the task list uses both:
 *   `prisma/prisma`                       — a backticked slug in a table
 *   https://github.com/prisma/prisma      — a full URL
 *
 * Deliberately NOT a general "find things that look like paths": `docs/adr`
 * and `kernel/models` are slug-shaped and are not repos. The URL form is
 * unambiguous; the bare form is only accepted inside backticks, which is how
 * the document actually writes them.
 */
export function extractRepoRefs(markdown: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (owner: string, repo: string): void => {
    // ORDER MATTERS: punctuation first, then `.git`. Prose writes
    // "clone https://github.com/honojs/hono.git." — stripping `.git` first
    // leaves "hono.git" because the trailing full stop is still attached.
    const clean = `${owner}/${repo.replace(/[).,;:]+$/, "").replace(/\.git$/, "")}`;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})";
  const REPO = "[A-Za-z0-9._-]{1,100}";

  for (const m of markdown.matchAll(
    new RegExp(`https?://(?:www\\.)?github\\.com/(${OWNER})/(${REPO})`, "g"),
  )) {
    add(m[1], m[2]);
  }
  for (const m of markdown.matchAll(new RegExp("`(" + OWNER + ")/(" + REPO + ")`", "g"))) {
    add(m[1], m[2]);
  }
  return out;
}

export interface ExtractReposOutput {
  repos: string[];
  count: number;
  artifactId: string;
}

/**
 * `repos.extract` — pull the repo list out of a stored document.
 *
 * Reads through the ARTIFACT STORE, not the filesystem, so it needs no
 * permissions at all and chains from `fs.readFile` by `$from`. Same shape as
 * `html.extractTitle`, and for the same reason: a pure transformation should
 * not be able to reach the disk.
 */
export const reposExtract: Capability = {
  manifest: {
    id: "repos.extract",
    version: "1.0.0",
    permissions: [],
    inputConstraints: {
      artifactId: { kind: "string", required: true, minLength: 71, maxLength: 71 },
    },
    outputs: {
      repos: { kind: "array", required: true, of: { kind: "string" } },
      count: { kind: "number", required: true, integer: true, min: 0 },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
    // `repos` is derived from untrusted document text and is therefore
    // untrusted, exactly as `html.extractTitle.title` is. `count` is a number
    // this capability computed about that list.
    outputTrust: {
      repos: "untrusted",
      count: "capability",
      artifactId: "capability",
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 10 * ONE_SECOND, maxCost: 1 },
    description: "Extract every owner/repo GitHub reference from a stored markdown document.",
  },
  async run(input, ctx) {
    const { artifactId } = input as { artifactId: string };
    const markdown = await ctx.readArtifact(artifactId);
    const repos = extractRepoRefs(markdown);
    const stored = await ctx.putArtifact(JSON.stringify(repos, null, 2));
    return { repos, count: repos.length, artifactId: stored } satisfies ExtractReposOutput;
  },
};

/**
 * `repos.found` — the extraction produced a usable list.
 *
 * A check that only asserted `Array.isArray(repos)` would pass on `[]`, which
 * is the failure this exists to catch: a parser that matches nothing looks
 * identical to a document with nothing in it. So it asserts a non-empty list
 * AND that every entry is shaped like a repo — meaning, not shape
 * (CLAUDE.md's assertion rule).
 */
export const reposFound: Check = {
  id: "repos.found",
  appliesTo: { kind: "outputs", requires: ["repos", "count"] },
  // Reads the returned array and decides. Nothing was exercised to find out —
  // whether those repos EXIST is a different question, answered by the
  // download step's own check, not by this one.
  verification: ["reasoned"],
  async run(output): Promise<CheckResult> {
    const repos = (output as { repos?: unknown })?.repos;
    const count = (output as { count?: unknown })?.count;
    if (!Array.isArray(repos)) {
      return {
        checkId: "repos.found",
        passed: false,
        verification: "reasoned",
        reason: `expected an array of repos, got ${JSON.stringify(repos)?.slice(0, 80)}`,
      };
    }
    if (repos.length === 0) {
      return {
        checkId: "repos.found",
        passed: false,
        verification: "reasoned",
        reason: "extracted no repos at all — the document was empty or the parser matched nothing",
      };
    }
    if (count !== repos.length) {
      // The count is a claim about the list beside it. THE COUNTING RULE
      // applied at the smallest possible scale.
      return {
        checkId: "repos.found",
        passed: false,
        verification: "reasoned",
        reason: `count says ${String(count)} but the list holds ${repos.length}`,
      };
    }
    const malformed = repos.filter(
      (r) => typeof r !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/.test(r),
    );
    if (malformed.length > 0) {
      return {
        checkId: "repos.found",
        passed: false,
        verification: "reasoned",
        reason: `${malformed.length} entries are not owner/repo: ${JSON.stringify(malformed.slice(0, 3))}`,
      };
    }
    return {
      checkId: "repos.found",
      passed: true,
      verification: "reasoned",
      reason: `${repos.length} repo references, all well-formed`,
      detail: { count: repos.length, sample: repos.slice(0, 5) },
    };
  },
};
