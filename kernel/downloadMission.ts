/**
 * #84 — the acceptance mission. OPTIMUS downloads its own missing repos.
 *
 * WHY THIS MISSION AND NOT A NICER DEMO. Every earlier demo in this repo is
 * one OPTIMUS grades itself on: a fixture goes in, a capability transforms it,
 * a check reads the transformation. Sabotage the capability and the check goes
 * red — which proves the machinery, and proves nothing about the world.
 *
 * This one cannot be passed by agreement. The mission ends by comparing a
 * commit id GitHub reported against a commit id measured on our own disk. Both
 * are outside OPTIMUS's control, they arrive by different routes, and no
 * amount of confident output moves either.
 *
 *   "Downloaded 244 repos" is a claim.
 *   "244 clones whose HEAD matches the SHA GitHub independently reported"
 *   is an audit anyone can repeat with git ls-remote.
 *
 * THE PLAN, per repo — two steps, not three. The tarball route (fetch, then
 * extract) is closed: `runFetch` ends in `response.text()`, a UTF-8 decode
 * that destroys binary irrecoverably. See kernel/gitClone.ts.
 *
 *   resolve ──$from──> clone ──> repo.intact
 *   (THINK)            (ACT)     (the comparison)
 *
 * The arrow is a real `$from` reference, so the sha the check compares against
 * is the one the kernel resolved and logged in `step.resolved` — not a value
 * this file typed twice.
 */

import type { MissionSpec, StepSpec } from "./types";

/** Filesystem-safe, collision-free, and readable in a trace. */
export function destFor(repo: string): string {
  return repo.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export interface DownloadMissionOptions {
  repos: readonly string[];
  /**
   * Clones are heavy and every one of them is a network transfer. Two at a
   * time is a deliberate floor, not a tuned number: the point of this mission
   * is proof, and a run that saturates the link produces timeouts that look
   * like failures of the thing being tested.
   */
  maxParallel?: number;
}

/**
 * One repo becomes two steps and one check.
 *
 * `continueOnError` is set on BOTH steps, and that is the difference between
 * a mission that reports and a mission that stops. Across 244 repos some will
 * be renamed, some deleted, some rate-limited. A run that halts on the first
 * of those answers "did repo #7 fail" instead of "how many of 244 verified" —
 * and the second question is the one #84 exists to ask.
 *
 * Nothing is hidden by this: a continued failure is recorded in evidence and
 * the mission still finishes RED. The count of green steps is the result.
 */
export function stepsForRepo(repo: string): StepSpec[] {
  const dest = destFor(repo);
  const resolveId = `resolve:${repo}`;
  const cloneId = `clone:${repo}`;

  return [
    {
      id: resolveId,
      capabilityId: "github.resolve",
      input: { repo },
      dependsOn: [],
      checks: ["repo.resolved"],
      continueOnError: true,
    },
    {
      id: cloneId,
      capabilityId: "git.clone",
      input: {
        repo,
        dest,
        // THE LOAD-BEARING LINE. Not the string this file could have written
        // itself — a reference the kernel resolves from the previous step's
        // sealed output and records in `step.resolved`. If it were typed here,
        // the check would compare OPTIMUS's own value against OPTIMUS's own
        // clone and always agree.
        expectedSha: { $from: `${resolveId}.sha` },
      },
      dependsOn: [resolveId],
      checks: ["repo.intact"],
      continueOnError: true,
    },
  ];
}

export function buildDownloadMission(options: DownloadMissionOptions): MissionSpec {
  const { repos, maxParallel = 2 } = options;
  if (repos.length === 0) throw new Error("buildDownloadMission: no repos given");

  return {
    id: `download-missing-repos-${Date.now()}`,
    objective:
      `Download ${repos.length} missing repositories and verify each against the ` +
      `commit SHA GitHub independently reports (#84).`,
    maxParallel,
    steps: repos.flatMap(stepsForRepo),
  };
}
