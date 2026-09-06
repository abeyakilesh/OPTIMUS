#!/usr/bin/env node
/**
 * GATE 11 — fidelity vs parent (issue #34).
 *
 * Before this, gate 11 was a set of assertions inside the unit suite. Real
 * testing, but it could only fail on a change to OUR code: nothing pinned the
 * golden's provenance, and nothing could notice the parent moving.
 *
 * This harness closes the part that is closable and is explicit about the part
 * that is not:
 *
 *   1. INTEGRITY   — each golden's sha256 matches what the manifest records.
 *                    Editing a golden to make a failing test pass now fails
 *                    here instead, which is the "regenerating a golden is a
 *                    deliberate, reviewable act" requirement.
 *   2. GENERATOR   — each generator's sha256 matches too. A generator changed
 *                    without regenerating its golden is drift, and it is the
 *                    most likely kind: someone edits the case list, reruns
 *                    nothing, and the stale golden keeps passing.
 *   3. REPRODUCE   — where the parent is available in CI, RE-RUN IT and diff.
 *                    This is the only check that can fail on the parent
 *                    changing rather than on us changing.
 *   4. COVERAGE    — report which capabilities have a golden and which do not,
 *                    counted, not asserted (THE COUNTING RULE).
 *
 * Check 3 currently applies to ONE port. Said plainly rather than averaged
 * away: `sequence-matcher`'s parent is CPython's own difflib, so CI has it.
 * Scrapling's parent needs an install CI does not carry, so its golden is
 * integrity-pinned but NOT re-derived — that half of gate 11 stays UNENFORCED
 * for scrapling and is reported as such on every run.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Overridable so tests can point at a temp copy. Its own tests mutate goldens
// to prove the gate can fail, and vitest runs test FILES in parallel — mutating
// the real fixture raced tests/kernel/sequence-matcher.test.ts, which reads the
// same golden and briefly saw expected: 0.999. A mutation test that writes
// shared state is a flake generator for every suite that reads it.
const MANIFEST = process.env.FIDELITY_MANIFEST ?? "kernel/fixtures/goldens.json";

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const errors = [];
const notes = [];

if (!existsSync(MANIFEST)) {
  console.error(`::error::${MANIFEST} is missing — gate 11 has no manifest to check.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const goldens = manifest.goldens ?? [];

let reproduced = 0;
let integrityChecked = 0;

for (const g of goldens) {
  const label = `${g.id}`;

  if (!existsSync(g.file)) {
    errors.push(`${label}: golden file missing at ${g.file}`);
    continue;
  }

  // 1 · integrity
  const actual = sha256(g.file);
  integrityChecked += 1;
  if (actual !== g.sha256) {
    errors.push(
      `${label}: golden CHANGED without its manifest entry being updated.\n` +
        `      ${g.file}\n` +
        `      manifest: ${g.sha256}\n` +
        `      actual:   ${actual}\n` +
        `      If this was a deliberate regeneration, run: node scripts/fidelity-check.mjs --update`,
    );
  }

  // 2 · generator
  if (g.generator) {
    if (!existsSync(g.generator)) {
      errors.push(`${label}: generator missing at ${g.generator} — the golden is no longer reproducible.`);
    } else {
      const gen = sha256(g.generator);
      if (gen !== g.generatorSha256) {
        errors.push(
          `${label}: GENERATOR changed but the golden was not regenerated.\n` +
            `      ${g.generator}\n` +
            `      manifest: ${g.generatorSha256}\n` +
            `      actual:   ${gen}\n` +
            `      A changed generator with an unchanged golden is drift: the case list moved and the stored answers did not.`,
        );
      }
    }
  }

  // 3 · reproduce against the real parent, where CI has it
  if (g.reproducibleInCI) {
    try {
      const out = execFileSync("python3", [g.generator], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const fresh = JSON.stringify(JSON.parse(out));
      const stored = JSON.stringify(JSON.parse(readFileSync(g.file, "utf8")));
      if (fresh !== stored) {
        errors.push(
          `${label}: RE-RAN THE PARENT AND GOT DIFFERENT OUTPUT.\n` +
            `      This is real divergence — the parent (${g.parent} ${g.parentVersion}) no longer\n` +
            `      produces what the golden records. Investigate before regenerating.`,
        );
      } else {
        reproduced += 1;
        notes.push(`${label}: re-derived from ${g.parent} and matched exactly`);
      }
    } catch (e) {
      errors.push(`${label}: could not re-run the parent generator — ${(e.message ?? e).toString().split("\n")[0]}`);
    }
  } else {
    notes.push(`${label}: integrity-pinned only — ${g.notReproducibleReason ?? "parent unavailable in CI"}`);
  }
}

// 4 · coverage, counted
const covered = new Set(goldens.flatMap((g) => g.covers ?? []));
const capabilities = manifest.capabilities ?? [];
const uncovered = capabilities.filter((c) => !covered.has(c));

const summary = [
  "## Gate 11 — fidelity vs parent",
  "",
  `- goldens integrity-checked: **${integrityChecked}/${goldens.length}**`,
  `- goldens **re-derived from the real parent**: **${reproduced}/${goldens.length}**`,
  `- capabilities with a golden: **${covered.size}/${capabilities.length}**`,
  uncovered.length ? `- **no golden at all:** ${uncovered.join(", ")}` : "- every capability has a golden",
  "",
  ...notes.map((n) => `- ${n}`),
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}

if (errors.length > 0) {
  for (const e of errors) console.log(`::error title=Gate 11 fidelity::${e}`);
  console.error(`\n${errors.length} fidelity violation(s).`);
  process.exit(1);
}
console.log("\nFidelity gate satisfied.");
process.exit(0);
