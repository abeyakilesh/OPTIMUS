import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserNavigateOutput } from "../../kernel/capabilities/browser-use/navigate";
import type { Scenario, ScenarioResult } from "./types";

/**
 * browser.navigate's real claim: a REAL browser, driven over CDP — not an
 * HTTP fetch with a parser bolted on. Scenario `javascript-rendered` is the
 * one that proves it: the text it looks for does not exist in the served
 * HTML at all and only appears after scripts run. A fetch-based
 * implementation fails that scenario and passes most of the others, which is
 * exactly why it is here.
 *
 * Pages are served from a local fixture server, so the round is deterministic
 * and needs no internet.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const VENV_PYTHON = join(HERE, "..", "..", "kernel", "capabilities", "browser-use", ".venv", "bin", "python3");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let server: Server | undefined;
let base = "";

const PAGES: Record<string, { status: number; body: string; headers?: Record<string, string> }> = {
  "/static": {
    status: 200,
    body: `<!doctype html><html><head><title>Static Fixture Page</title></head>
      <body><h1>Quarterly Report</h1><p>Revenue rose to £4.2m this quarter.</p></body></html>`,
  },
  "/js": {
    status: 200,
    // The marker exists nowhere in this HTML — only script execution creates it.
    body: `<!doctype html><html><head><title>Loading…</title></head>
      <body><div id="app">please enable javascript</div>
      <script>
        document.title = "Rendered By JavaScript";
        document.getElementById("app").textContent = "MARKER_ONLY_AFTER_JS_RUNS";
      </script></body></html>`,
  },
  "/redirect": { status: 302, body: "", headers: { Location: "/static" } },
  "/notfound": {
    status: 404,
    body: `<!doctype html><html><head><title>404 Not Found</title></head>
      <body><h1>No such page</h1><p>The document you requested does not exist.</p></body></html>`,
  },
  "/nested": {
    status: 200,
    body: `<!doctype html><html><head><title>Deeply Nested</title></head><body>
      <div><section><article><div><span><em><strong>BURIED_TREASURE_TEXT</strong></em></span></div></article></section></div>
      </body></html>`,
  },
};

export async function startFixtureServer(): Promise<string> {
  server = createServer((req, res) => {
    const page = PAGES[(req.url ?? "/").split("?")[0]];
    if (!page) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<html><body>unknown fixture</body></html>");
      return;
    }
    res.writeHead(page.status, { "Content-Type": "text/html", ...page.headers });
    res.end(page.body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const addr = server!.address();
  base = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  return base;
}

export async function stopFixtureServer(): Promise<void> {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
}

function o(r: ScenarioResult): Partial<BrowserNavigateOutput> {
  return (r.output ?? {}) as Partial<BrowserNavigateOutput>;
}

const CHECKS = ["browser.navigateSucceeded"];

function nav(path: string, extra: Record<string, unknown> = {}) {
  return {
    url: `${base}${path}`,
    chromeExecutablePath: CHROME,
    pythonExecutable: VENV_PYTHON,
    headless: true,
    ...extra,
  };
}

/** Rendered successfully AND the page text contains `needle`. */
function rendered(needle: string) {
  return (r: ScenarioResult) => {
    const out = o(r);
    const hit = (out.text ?? "").includes(needle) || (out.title ?? "").includes(needle);
    return {
      ok: r.status === "passed" && hit,
      observed:
        r.status === "passed"
          ? hit
            ? `"${out.title}" · ${out.text?.length ?? 0} chars · found "${needle}"`
            : `rendered "${out.title}" but "${needle}" is absent`
          : `status ${r.status} — ${r.evidence?.checks?.[0]?.reason ?? r.threw ?? "no reason"}`,
    };
  };
}

/**
 * Fails for the RIGHT reason. An earlier version accepted any failure at all,
 * so three scenarios reported PASS while actually dying on an unrelated
 * rollback error — a green tick over a broken capability. "It failed" is not
 * a verdict; "it failed in the way we predicted" is.
 */
function failsWith(expected: RegExp) {
  return (r: ScenarioResult) => {
    const reason = r.evidence?.checks?.find((c) => !c.passed)?.reason ?? r.threw ?? "";
    const rightReason = expected.test(reason);
    return {
      ok: r.status !== "passed" && rightReason,
      observed:
        r.status === "passed"
          ? "WRONG — reported success on something that should have failed"
          : rightReason
            ? `refused for the right reason: ${reason.slice(0, 70)}`
            : `failed, but for an UNEXPECTED reason (wanted ${expected}): ${reason.slice(0, 70)}`,
    };
  };
}

export function browserScenarios(): Scenario[] {
  return [
    {
      id: "static-page",
      intent: "Navigates a real browser to a page and extracts its real title and text",
      input: nav("/static"),
      checks: CHECKS,
      verdict: rendered("Revenue rose"),
    },
    {
      id: "javascript-rendered",
      intent: "Runs JavaScript — this text exists nowhere in the served HTML",
      input: nav("/js"),
      checks: CHECKS,
      verdict: rendered("MARKER_ONLY_AFTER_JS_RUNS"),
    },
    {
      id: "title-set-by-script",
      intent: "Reads a title that only a script sets, proving it is not parsing raw HTML",
      input: nav("/js"),
      checks: CHECKS,
      verdict: rendered("Rendered By JavaScript"),
    },
    {
      id: "follows-redirect",
      intent: "Follows a 302 and reports the destination's content",
      input: nav("/redirect"),
      checks: CHECKS,
      verdict: rendered("Quarterly Report"),
    },
    {
      id: "renders-404-body",
      intent: "A 404 page still renders — the content is real, the status is not the point",
      input: nav("/notfound"),
      checks: CHECKS,
      verdict: rendered("No such page"),
    },
    {
      id: "deeply-nested-text",
      intent: "Extracts text buried seven elements deep",
      input: nav("/nested"),
      checks: CHECKS,
      verdict: rendered("BURIED_TREASURE_TEXT"),
    },
    {
      id: "evidence-is-real",
      intent: "Evidence carries a real artifact and a real duration, not placeholders",
      // A UNIQUE url on purpose. With `/static` this failed, and the cause is
      // worth recording: artifacts are content-addressed, so navigating the
      // same page twice produces identical bytes, the store already holds that
      // hash, and the harness — which credits a step only with artifacts it
      // newly created — leaves this step's artifactIds EMPTY. Real evidence
      // gap, filed separately; this scenario is about placeholders, so it
      // sidesteps the collision rather than silently absorbing it.
      input: nav("/static?unique-for-evidence-scenario=1"),
      checks: CHECKS,
      verdict(r) {
        const id = o(r).artifactId;
        const real = !!id && r.evidence.artifactIds.includes(id) && r.evidence.durationMs > 0;
        return {
          ok: r.status === "passed" && real,
          observed: real
            ? `artifact ${id!.slice(0, 20)}… · ${r.evidence.durationMs}ms · ${r.evidence.attempts} attempt(s)`
            : `missing artifact or duration: ${id} / ${r.evidence?.durationMs}ms`,
        };
      },
    },
    {
      id: "connection-refused",
      intent: "A dead server is reported honestly, not answered around",
      input: nav("", { url: "http://127.0.0.1:9/nothing-here" }),
      checks: CHECKS,
      verdict: failsWith(/navigation did not succeed|connect|refus|ERR_/i),
    },
    {
      id: "malformed-url",
      intent: "A nonsense URL fails with a reason instead of hanging",
      input: nav("", { url: "not-a-real-url-at-all" }),
      checks: CHECKS,
      verdict: failsWith(/navigation did not succeed|invalid|url|ERR_/i),
    },
    {
      id: "missing-chrome-path",
      intent: "Refuses at the contract when no browser binary is supplied",
      input: { url: `${base}/static`, pythonExecutable: VENV_PYTHON, headless: true },
      checks: CHECKS,
      verdict: failsWith(/requires \{ url, chromeExecutablePath \}/i),
    },
  ];
}
