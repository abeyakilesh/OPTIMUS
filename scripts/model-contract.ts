#!/usr/bin/env node
/**
 * Qualify a chat model against the OPTIMUS model contract.
 *
 *   node scripts/model-contract.mjs [model] [baseUrl]
 *
 * Defaults to the local Ollama endpoint. Exits non-zero when a model fails,
 * so this can gate a backend rather than merely describe one.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runModelContract, PROBES } from "../kernel/models/contract";
import { CONTRACT_VERSION, type QualificationRecord } from "../kernel/models/qualified";

// fileURLToPath, not .pathname: a file:// URL percent-encodes spaces, and this
// repo lives under a path that has them — .pathname produced "%20" and ENOENT.
const RECORD_PATH = fileURLToPath(new URL("../kernel/models/qualified.json", import.meta.url));

/**
 * Only ever called on a USABLE result. A record entry is a claim that a model
 * passed; writing one for a failure would make the record exactly the kind of
 * green check on nothing this project exists to prevent.
 */
function record(model: string, baseUrl: string, probes: { id: string; passed: boolean; reason: string }[]): void {
  const rec = JSON.parse(readFileSync(RECORD_PATH, "utf8")) as QualificationRecord & { $comment?: string };
  rec.contractVersion = CONTRACT_VERSION;
  const entry = {
    id: model,
    baseUrl,
    qualifiedAt: new Date().toISOString(),
    probes: probes.map((p) => ({ id: p.id, passed: p.passed, reason: p.reason })),
  };
  const at = rec.models.findIndex((m) => m.id === model);
  if (at >= 0) rec.models[at] = entry;
  else rec.models.push(entry);
  rec.models.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(RECORD_PATH, JSON.stringify(rec, null, 2) + "\n");
}

// Wrapped rather than top-level await: tsx transforms to CJS here, which
// cannot express it (ERR_REQUIRE_ASYNC_MODULE).
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--record");
  const shouldRecord = process.argv.includes("--record");
  const model = args[0] ?? process.env.OPTIMUS_MODEL ?? "llama3.2:latest";
  const baseUrl = args[1] ?? process.env.OPTIMUS_MODEL_BASE_URL ?? "http://127.0.0.1:11434";

  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

  console.log(`\n${bold("MODEL CONTRACT")} ${model} ${dim(`via ${baseUrl}`)}\n`);

  const report = await runModelContract(baseUrl, model);

  for (const probe of report.probes) {
    const def = PROBES.find((p) => p.id === probe.id);
    console.log(`  ${probe.passed ? green("✔") : red("✘")} ${probe.id.padEnd(22)} ${dim(`${probe.latencyMs}ms`)}`);
    console.log(`      ${probe.reason}`);
    if (!probe.passed) {
      console.log(dim(`      why it matters: ${def?.why ?? ""}`));
      if (probe.output) console.log(dim(`      got: ${probe.output.replace(/\n/g, " ").slice(0, 160)}`));
    }
  }

  const total = report.probes.reduce((sum, p) => sum + p.latencyMs, 0);
  console.log(
    `\n  ${report.usable ? green(bold("USABLE")) : red(bold("NOT USABLE"))} — ` +
      `${report.probes.filter((p) => p.passed).length}/${report.probes.length} probes · ${(total / 1000).toFixed(1)}s total\n`,
  );

  if (shouldRecord) {
    if (report.usable) {
      record(model, baseUrl, report.probes);
      console.log(`  recorded in kernel/models/qualified.json — commit it for the gate to see it\n`);
    } else {
      console.log(red("  NOT recorded — only a passing run earns an entry\n"));
    }
  }

  process.exit(report.usable ? 0 : 1);
}

void main();
