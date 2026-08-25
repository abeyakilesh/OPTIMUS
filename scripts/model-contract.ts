#!/usr/bin/env node
/**
 * Qualify a chat model against the OPTIMUS model contract.
 *
 *   node scripts/model-contract.mjs [model] [baseUrl]
 *
 * Defaults to the local Ollama endpoint. Exits non-zero when a model fails,
 * so this can gate a backend rather than merely describe one.
 */
import { runModelContract, PROBES } from "../kernel/models/contract";

// Wrapped rather than top-level await: tsx transforms to CJS here, which
// cannot express it (ERR_REQUIRE_ASYNC_MODULE).
async function main(): Promise<void> {
  const model = process.argv[2] ?? process.env.OPTIMUS_MODEL ?? "llama3.2:latest";
  const baseUrl = process.argv[3] ?? process.env.OPTIMUS_MODEL_BASE_URL ?? "http://127.0.0.1:11434";

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

  process.exit(report.usable ? 0 : 1);
}

void main();
