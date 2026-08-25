import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import type { Capability, Check } from "../../kernel/types";
import type { Scenario, ScenarioResult } from "./types";

export interface SuiteResult {
  capabilityId: string;
  rows: Array<{ id: string; intent: string; ok: boolean; observed: string; ms: number }>;
}

/**
 * Runs scenarios through the REAL kernel — real Broker, real Harness, real
 * capability, real checks. Nothing here is stubbed; a scenario that needs a
 * live service and cannot reach one fails honestly and says so.
 */
export async function runSuite(
  capability: Capability,
  checks: Check[],
  scenarios: Scenario[],
): Promise<SuiteResult> {
  const broker = new Broker();
  broker.register(capability);
  for (const check of checks) broker.registerCheck(check);
  const harness = new Harness({ broker, store: new MemoryArtifactStore() });

  const rows: SuiteResult["rows"] = [];

  for (const scenario of scenarios) {
    const began = Date.now();
    let result: ScenarioResult;
    try {
      const outcome = await harness.runStep({
        id: scenario.id,
        capabilityId: capability.manifest.id,
        input: scenario.input,
        dependsOn: [],
        checks: scenario.checks,
      });
      result = { status: outcome.status, evidence: outcome.evidence, output: outcome.output };
    } catch (error) {
      // The harness converts capability throws into failed observations, so
      // reaching here means the KERNEL itself broke — worth seeing plainly.
      result = {
        status: "failed",
        evidence: {} as ScenarioResult["evidence"],
        output: undefined,
        threw: error instanceof Error ? error.message : String(error),
      };
    }

    const { ok, observed } = scenario.verdict(result);
    const ms = Date.now() - began;
    rows.push({ id: scenario.id, intent: scenario.intent, ok, observed, ms });
    process.stdout.write(
      `  ${ok ? "PASS" : "FAIL"}  ${scenario.id.padEnd(28)} ${observed.slice(0, 96)}\n`,
    );
  }

  return { capabilityId: capability.manifest.id, rows };
}

/** A report a person reads, not a CI artifact. */
export async function writeReport(suites: SuiteResult[], notes: string[]): Promise<string> {
  const dir = join(dirname(fileURLToPath(import.meta.url)));
  await mkdir(dir, { recursive: true });
  const path = join(dir, "REPORT.md");

  const total = suites.reduce((n, s) => n + s.rows.length, 0);
  const passed = suites.reduce((n, s) => n + s.rows.filter((r) => r.ok).length, 0);

  const lines: string[] = [
    "# Validation Round 1 — repos 1–3",
    "",
    `Run ${new Date().toISOString()} against the real kernel. **${passed}/${total} scenarios passed.**`,
    "",
    "Scores measure whether gates passed. A validation round measures something",
    "harder to fake: whether the capability does the thing, on real input, with",
    "output a person reads.",
    "",
  ];

  for (const suite of suites) {
    const p = suite.rows.filter((r) => r.ok).length;
    lines.push(`## \`${suite.capabilityId}\` — ${p}/${suite.rows.length}`, "");
    lines.push("| | Scenario | What it checks | Observed | ms |");
    lines.push("|---|---|---|---|---|");
    for (const r of suite.rows) {
      const cell = r.observed.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${r.ok ? "✅" : "❌"} | \`${r.id}\` | ${r.intent} | ${cell} | ${r.ms} |`);
    }
    lines.push("");
  }

  if (notes.length) {
    lines.push("## Notes", "");
    for (const n of notes) lines.push(`- ${n}`);
    lines.push("");
  }

  await writeFile(path, lines.join("\n"), "utf8");
  return path;
}
