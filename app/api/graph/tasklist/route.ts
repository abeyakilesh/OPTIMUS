/**
 * GET /api/graph/tasklist — the repos OPTIMUS has to download, read by OPTIMUS.
 *
 * ⚠️ THIS EXISTS BECAUSE THE ALTERNATIVE WAS A HARDCODED LIST. An earlier
 * version of the canvas seeded its Run box with three repo names typed into a
 * constant — while `fs.readFile` and `repos.extract` (built in #85 for exactly
 * this document) sat unused. That is the product demoing itself: the list
 * looks real, and the capability that was supposed to produce it has never
 * been shown to work.
 *
 * So this route runs the real capabilities through the real harness, against
 * the real `MISSING_DOMAINS_AND_REPOS.md`. If parsing breaks, this endpoint
 * fails loudly instead of a literal quietly covering for it.
 *
 * No mission, no scheduler: this is a READ, on the THINK plane (ADR-0016).
 * It changes nothing, so it needs no run record and no approval.
 */

import { buildBroker } from "@/kernel/registry";
import { Harness } from "@/kernel/harness";
import { MemoryArtifactStore } from "@/kernel/artifacts";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Where the task list lives, relative to the read root the capability already
 * declares. Operator-overridable for the same reason the root is: the document
 * lives outside the repo, and only the operator knows where.
 */
function taskListPath(): string {
  const declared = process.env.OPTIMUS_TASKLIST_PATH?.trim();
  if (declared) return declared;
  const root = process.env.OPTIMUS_TASKLIST_ROOT?.trim() ?? process.cwd();
  return join(root, "Repo collection and their use", "MISSING_DOMAINS_AND_REPOS.md");
}

export async function GET(): Promise<Response> {
  const broker = buildBroker();
  const store = new MemoryArtifactStore();
  const harness = new Harness({ broker, store });

  const read = await harness.runStep({
    id: "read-tasklist",
    capabilityId: "fs.readFile",
    input: { path: taskListPath() },
    dependsOn: [],
    checks: ["artifact.intact"],
  });
  if (read.status !== "passed") {
    return Response.json(
      {
        ok: false,
        reason:
          `could not read the task list at ${taskListPath()} — ` +
          `set OPTIMUS_TASKLIST_ROOT or OPTIMUS_TASKLIST_PATH. ` +
          (read.evidence.checks?.map((c) => c.reason).join("; ") ?? read.status),
      },
      { status: 404 },
    );
  }

  const extract = await harness.runStep({
    id: "extract-repos",
    capabilityId: "repos.extract",
    input: { artifactId: (read.output as { artifactId: string }).artifactId },
    dependsOn: [],
    checks: ["repos.found"],
  });
  if (extract.status !== "passed") {
    return Response.json(
      {
        ok: false,
        reason: extract.evidence.checks?.map((c) => c.reason).join("; ") ?? extract.status,
      },
      { status: 500 },
    );
  }

  const out = extract.output as { repos: string[]; count: number };
  return Response.json({
    ok: true,
    // `measured`, per THE COUNTING RULE — every entry was parsed out of the
    // document just now, not read from a total someone wrote in prose.
    repos: out.repos,
    count: out.count,
    source: taskListPath(),
    method: "measured",
  });
}
