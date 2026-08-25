import { scraplingRelocate, relocateContractHonored } from "../../kernel/capabilities/scrapling-relocate";
import { llmChat, llmChatSucceeded } from "../../kernel/capabilities/omniroute/chat";
import { scraplingScenarios } from "./scrapling";
import { llmChatScenarios } from "./llmchat";
import { browserNavigate, browserNavigateSucceeded } from "../../kernel/capabilities/browser-use/navigate";
import { browserScenarios, startFixtureServer, stopFixtureServer } from "./browser";
import { runSuite, writeReport, type SuiteResult } from "./runner";
import { existsSync } from "node:fs";

async function main(): Promise<void> {
  const notes: string[] = [];
  const suites: SuiteResult[] = [];

  console.log("\n═══ VALIDATION ROUND 1 — repos 1–3, real kernel, real capabilities ═══\n");

  console.log("scrapling.relocate — adaptive selector survival");
  suites.push(await runSuite(scraplingRelocate, [relocateContractHonored], scraplingScenarios));

  console.log("\nllm.chat — real replies through the real model layer");
  suites.push(await runSuite(llmChat, [llmChatSucceeded], llmChatScenarios));

  const { VENV_PYTHON } = await import("./browser");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(VENV_PYTHON) && existsSync(chrome)) {
    console.log("\nbrowser.navigate — a real browser over real CDP");
    const base = await startFixtureServer();
    console.log(`  (fixture server on ${base})`);
    try {
      suites.push(await runSuite(browserNavigate, [browserNavigateSucceeded], browserScenarios()));
    } finally {
      await stopFixtureServer();
    }
  } else {
    // Never silently skipped: an absent prerequisite is reported as a gap.
    notes.push(
      `browser.navigate did NOT run — missing ${existsSync(VENV_PYTHON) ? "Chrome" : "the pinned venv"}. ` +
        "Its 10 scenarios are still owed before Round 1 is complete.",
    );
  }

  notes.push(
    "FINDING (fixed): browser-use 0.13.7's `get_current_page_title()` returns the page URL, " +
      "not document.title — verified against a data: URL whose title was REAL_DOC_TITLE. The " +
      "capability's contract promised a title and was delivering a URL. bridge.py now reads it " +
      "over CDP Runtime.evaluate.",
  );
  notes.push(
    "FINDING (fixed): browser.navigate's isolation.cwd pointed at its own source directory, " +
      "which holds the pinned venv (14,388 files). The rollback snapshot cap correctly refused " +
      "and every navigation failed. A child's cwd is now a dedicated scratch workspace.",
  );
  notes.push(
    "FINDING (open): artifacts are content-addressed, so a step producing bytes identical to an " +
      "existing artifact gets an EMPTY artifactIds in its evidence — the harness credits a step " +
      "only with artifacts it newly created. Two identical navigations, and the second has no " +
      "artifact in evidence. Not yet fixed; the affected scenario uses a unique URL to avoid it.",
  );
  notes.push(
    "The isolation boundary was A/B verified: run on `main` (no K4) the sandbox-blocks-remote-host " +
      "scenario FAILED and the request genuinely reached api.openai.com. On the K4 branch it is " +
      "refused at the boundary. 19/20 vs 20/20 on the same code path.",
  );

  const total = suites.reduce((n, s) => n + s.rows.length, 0);
  const passed = suites.reduce((n, s) => n + s.rows.filter((r) => r.ok).length, 0);
  console.log(`\n═══ ${passed}/${total} scenarios passed ═══`);

  const path = await writeReport(suites, notes);
  console.log(`report: ${path}\n`);
}

void main();
