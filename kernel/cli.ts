/**
 * The WP-001 deliverable you can actually watch.
 *
 * docs/WORK_PACKAGES.md: "it does not need a UI. A CLI that prints the trace
 * is enough. Building Mission Control before the kernel works is the Atlas
 * mistake."
 *
 * Run:  npm run mission          — a mission that passes
 *       npm run mission -- fail  — the SAME mission with a corrupted result,
 *                                  to watch verification refuse to apply it
 *
 * The second mode is the point. AC-3's definition of done asks for
 * "verification actually blocks" to be *visible*, not merely asserted.
 */

import { buildBroker } from "./registry";
import { Harness } from "./harness";
import { Scheduler } from "./scheduler";
import { MemoryArtifactStore, addressOf } from "./artifacts";
import { htmlExtractTitle } from "./builtin";
import type { Capability, MissionSpec } from "./types";

const FIXTURE_HTML = `<!doctype html>
<html><head><title>  Example   Domain  </title></head>
<body><h1>Example Domain</h1></body></html>`;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

/** Corrupts the extracted title — a capability that lies about its result. */
const sabotagedExtract: Capability = {
  manifest: { ...htmlExtractTitle.manifest, id: "html.extractTitle" },
  async run() {
    return { title: "", artifactId: undefined };
  },
};

async function main(): Promise<void> {
  const sabotage = process.argv.includes("fail");

  // One registry, shared with the API route. The sabotage demo replaces a
  // capability rather than assembling a second, divergent broker.
  const broker = buildBroker({ overrides: sabotage ? [sabotagedExtract] : [] });

  const store = new MemoryArtifactStore();
  const harness = new Harness({
    broker,
    store,
    fetcher: async () => FIXTURE_HTML,
    onAttempt: (stepId, attempt) => {
      if (attempt > 1) console.log(dim(`      ↻ attempt ${attempt}`));
    },
  });

  const mission: MissionSpec = {
    id: "m-walking-skeleton",
    objective: "Fetch example.com and extract the page title",
    steps: [
      {
        id: "fetch",
        capabilityId: "web.fetch",
        input: { url: "https://example.com" },
        dependsOn: [],
        checks: ["artifact.intact"],
        agent: "collector",
      },
      {
        id: "extract",
        capabilityId: "html.extractTitle",
        input: { artifactId: addressOf(FIXTURE_HTML) },
        dependsOn: ["fetch"],
        checks: ["title.nonEmpty", "artifact.intact"],
        agent: "analyst",
      },
    ],
  };

  console.log();
  console.log(bold(`MISSION  ${mission.id}`));
  console.log(dim(`         ${mission.objective}`));
  if (sabotage) console.log(yellow(`         [fault injection: extract returns a corrupted title]`));
  console.log();

  const result = await new Scheduler({ harness }).run(mission);

  for (const stepId of Object.keys(result.state.steps)) {
    const step = result.state.steps[stepId];
    const ok = step.status === "passed";
    const mark = ok ? green("✔") : red("✘");
    console.log(`  ${mark} ${bold(stepId)} ${dim(`(${step.spec.agent ?? "—"})`)} · ${step.status}`);

    const evidence = step.evidence;
    if (!evidence) {
      console.log(dim(`      never ran`));
      continue;
    }

    for (const check of evidence.checks) {
      const cm = check.passed ? green("✔") : red("✘");
      console.log(`      ${cm} ${check.checkId} ${dim(`— ${check.reason}`)}`);
    }
    console.log(
      dim(
        `      evidence: ${evidence.capabilityId}@${evidence.capabilityVersion} · ` +
          `attempts ${evidence.attempts} · exit ${evidence.exitCode} · cost ${evidence.cost} · ` +
          `${evidence.artifactIds.length} artifact(s)`,
      ),
    );
    for (const id of evidence.artifactIds) console.log(dim(`      ${id}`));
  }

  console.log();
  console.log(
    result.green
      ? green(bold("MISSION GREEN — every check passed, the result may be applied."))
      : red(bold("MISSION RED — a check failed. Nothing is applied.")),
  );
  console.log(dim(`${result.log.all().length} events recorded · state is a fold of the log`));
  console.log();

  // Non-zero exit on red, so the CLI is usable as a gate itself.
  process.exit(result.green ? 0 : 1);
}

main().catch((error) => {
  console.error(red(`kernel error: ${error instanceof Error ? error.stack : String(error)}`));
  process.exit(2);
});
