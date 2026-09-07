/**
 * #84's runner. `npm run download -- <repo> [repo...]`
 *
 * Prints a trace a person reads, then a table whose LAST COLUMN is the point:
 * for each repo, the sha GitHub reported and the sha measured on disk.
 */

import { buildBroker, ALL_REPAIRS } from "./registry";
import { Harness } from "./harness";
import { Scheduler } from "./scheduler";
import { DiskArtifactStore } from "./artifacts";
import { buildDownloadMission } from "./downloadMission";
import { downloadRoot } from "./gitClone";
import { saveMissionLog } from "@/lib/graph/store";
import { join } from "node:path";
import { tmpdir } from "node:os";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main(): Promise<void> {
  const repos = process.argv.slice(2).filter((a) => a.includes("/"));
  if (repos.length === 0) {
    console.error("usage: npm run download -- owner/repo [owner/repo ...]");
    process.exit(2);
  }

  const broker = buildBroker();
  const store = new DiskArtifactStore(join(tmpdir(), "optimus-download-artifacts"));
  const harness = new Harness({ broker, store });
  const scheduler = new Scheduler({ harness, repairs: ALL_REPAIRS });

  const mission = buildDownloadMission({ repos });
  console.log(bold(`\n${mission.objective}`));
  console.log(dim(`clones land in ${downloadRoot()}\n`));

  const result = await scheduler.run(mission);
  const state = result.state;

  // Persisted so the canvas can fold the SAME log this CLI just folded.
  const logPath = await saveMissionLog(mission.id, result.log.all());

  console.log(bold("\n  repo                          GitHub said   on disk       verdict"));
  console.log(dim("  " + "─".repeat(72)));
  let verified = 0;
  for (const repo of repos) {
    const clone = state.steps[`clone:${repo}`];
    const check = clone?.evidence?.checks?.find((c: { checkId: string }) => c.checkId === "repo.intact");
    const d = (check?.detail ?? {}) as { sha?: string; files?: number };
    const expected = (clone?.evidence?.checks?.[0]?.detail as { expectedSha?: string })?.expectedSha;
    const ok = clone?.status === "passed";
    if (ok) verified++;
    console.log(
      `  ${repo.padEnd(30)}${(expected ?? d.sha ?? "—").slice(0, 12).padEnd(14)}` +
        `${(d.sha ?? "—").slice(0, 12).padEnd(14)}${ok ? green("VERIFIED") : red(clone?.status ?? "—")}`,
    );
  }

  // The honest headline. `measured`, per THE COUNTING RULE — every one of
  // these was cloned and compared, none were assumed.
  console.log(
    bold(`\n  ${verified}/${repos.length} verified`) +
      dim("  (measured — each clone's HEAD compared to GitHub's reported SHA)\n"),
  );
  console.log(`  mission: ${result.green ? green("green") : red(state.status)}`);
  console.log(dim(`  log:     ${logPath}`));
  console.log(dim(`  canvas:  http://localhost:3000/missions/${encodeURIComponent(mission.id)}\n`));
  process.exit(result.green ? 0 : 1);
}

void main();
