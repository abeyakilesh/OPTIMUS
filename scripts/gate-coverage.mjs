#!/usr/bin/env node
/**
 * The gauntlet's coverage summary, generated from CI_STATUS.md.
 *
 * This exists because the absent-gates list lived in TWO places — CI_STATUS.md
 * and an inline table in gauntlet.yml — and the copy went stale. For a full day
 * after K4 landed, every run printed "gate 10 · isolation invariants | no
 * sandbox", while 24 assertions were enforcing it. That is the second time a
 * fact has existed twice here and the duplicate was the one that lied (the
 * first: 554-vs-184 ast-grep rules in CLAUDE.md).
 *
 * The fix is not diligence, it is a single source. CI_STATUS.md holds the list;
 * this script reads it; tests/unit/gate-coverage.test.ts asserts no second copy
 * can creep back into the workflow.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Parse the "Not implemented" table out of CI_STATUS.md. */
export function absentGates(markdown = readFileSync(join(ROOT, "CI_STATUS.md"), "utf8")) {
  const section = markdown.split("## Not implemented")[1];
  if (!section) throw new Error("CI_STATUS.md has no '## Not implemented' section");

  const rows = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) {
      if (rows.length) break; // table ended
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^#$/.test(cells[0]) || /^-+$/.test(cells[0])) continue; // header / rule
    rows.push({ gate: cells[0], name: cells[1], blockedOn: cells[2], unblocks: cells[3] });
  }
  if (rows.length === 0) throw new Error("CI_STATUS.md's absent-gates table parsed as empty");
  return rows;
}

export function renderSummary(aiReviewSkipped, gates = absentGates()) {
  const enforced = aiReviewSkipped
    ? "1 build · 2 unit · 3 static-security · 5 supply-chain · 8 perf · 10 isolation invariants · 11 e2e"
    : "1 build · 2 unit · 3 static-security · 4 ai-review · 5 supply-chain · 8 perf · 10 isolation invariants · 11 e2e";

  const lines = ["## Gauntlet coverage", "", `**Enforced this run:** ${enforced}`, ""];
  if (aiReviewSkipped) {
    lines.push(
      "> Gate 4 (ai-review) was **skipped**: dependency-bot PRs change a lockfile",
      "> only, and both risks that carries — known CVEs and forbidden licences —",
      "> are proven by gates 3 and 5, which did run.",
      "",
    );
  }
  lines.push("### NOT enforced — absent, not passing", "", "| Gate | Blocked on | Unblocks when |", "|---|---|---|");
  for (const g of gates) lines.push(`| ${g.gate} · ${g.name} | ${g.blockedOn} | ${g.unblocks} |`);
  lines.push(
    "",
    "_Generated from `CI_STATUS.md` — it is the single source. A second copy of",
    "this list is what went stale last time._",
    "",
    "See `CI_STATUS.md`. Do not mark a capability AVAILABLE while a gate it depends on is listed here.",
  );
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderSummary(process.env.AI_REVIEW_RESULT === "skipped") + "\n");
}
