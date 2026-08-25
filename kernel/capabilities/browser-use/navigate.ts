/**
 * Gates 8-10 for absorb/browser-use: the capability contract and broker
 * adapter over bridge.py (SERVICE fate — the real engine runs as its own
 * process; this file never reimplements browser-use's logic, it spawns it).
 *
 * Requires: Python 3 with `pip install -r requirements.txt` in this
 * directory, and a real Chromium-family browser executable. Neither is
 * available on the default CI runner today — see this directory's README
 * for what that means for gate 11/15 (fidelity and regression-suite
 * automation are proven manually, not yet wired into required CI).
 */

import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Capability, Check, CheckResult } from "../../types";

const BRIDGE_PATH = join(dirname(fileURLToPath(import.meta.url)), "bridge.py");

export interface BrowserNavigateInput {
  url: string;
  /** Defaults to `python3` on PATH; override for a pinned venv interpreter. */
  pythonExecutable?: string;
  chromeExecutablePath: string;
  headless?: boolean;
}

export interface BrowserNavigateOutput {
  ok: boolean;
  url: string;
  title?: string;
  text?: string;
  error?: string;
  artifactId: string;
}

const HARD_KILL_MARGIN_MS = 5_000;

/**
 * Real browser navigation via browser-use/CDP — not an HTTP fetch. Renders
 * JavaScript, reflects the DOM the same way a person's browser would.
 *
 * Permission honesty, stated plainly rather than implied: `proc:spawn` is
 * REAL and enforced — spawnProcess throws PermissionDenied without it.
 * `net:read` here is DECLARATIVE ONLY. The actual network request happens
 * inside the spawned Python process, which the kernel does not currently
 * sandbox — once proc:spawn is granted, that process can reach the network
 * (or the filesystem, or anything else its OS user can) regardless of what
 * else this manifest declares. This is a real, tracked gap (K4 process
 * isolation doesn't exist yet, same gap already scored 0/5 for "sandbox" on
 * the Scrapling capability), not a boundary this file is claiming to
 * enforce. Declaring net:read here is audit value for a human reading the
 * manifest, not a runtime guarantee.
 */
export const browserNavigate: Capability = {
  manifest: {
    id: "browser.navigate",
    version: "0.13.7-service", // pinned browser-use version, see requirements.txt
    permissions: ["proc:spawn", "net:read"],
    isolation: {
      // A dedicated scratch workspace — NOT this source directory.
      //
      // It was the source directory until a validation round caught what that
      // means in practice: the pinned venv lives here (14,388 files), so the
      // rollback snapshot correctly refused and every navigation failed. The
      // cap was right; pointing a child's cwd at a source tree was wrong.
      //
      // A workspace is better isolation anyway: the child cannot write into
      // the repo at all, and rollback has a small, meaningful radius. The
      // kernel creates it (see permissions.spawnProcess) — bridge.py is
      // referenced by absolute path, so it is still found from anywhere.
      cwd: join(tmpdir(), "optimus-browser-use"),
      // Python needs these to locate an interpreter and its site-packages;
      // everything else in process.env — every provider key, the session
      // secret — is stripped before the child sees it.
      env: ["VIRTUAL_ENV", "PYTHONPATH", "PYTHONHOME", "PATH"],
      // Declared, not hidden: the actual HTTP request happens INSIDE the
      // Python child, which the kernel cannot police from in-process. This
      // is the honest form of the `net:read` caveat documented above — an
      // admitted gap the broker can see, rather than a silent one.
      //
      // ⛔ CEILING, NOT A TODO. This caps sandbox at 3/5 for this capability
      // and it is NOT closable by editing this file. Once a child process
      // exists, confining its sockets needs a boundary OUTSIDE the process:
      // an OS network namespace, or a microVM.
      //
      //   Blocked on: codesandbox-sdk (Wave 1, not yet absorbed) — or a
      //   local equivalent, since codesandbox-client is GPL and now a
      //   read-only FIXTURE (CLAUDE.md, RE-FATED table).
      //
      // Per CLAUDE.md's WIP rule, "blocked on X" is a legitimate stopping
      // point and "not tested" never is. Do not read 3/5 as unfinished work
      // and try to close it in-process; it cannot be closed in-process.
      unconfinedChildEgress: true,
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 45_000, maxCost: 20 },
    description:
      "Navigates a real, headless Chromium-family browser to a URL via " +
      "browser-use/CDP and returns the rendered page's title and text.",
  },
  async run(input, ctx) {
    const {
      url,
      pythonExecutable = "python3",
      chromeExecutablePath,
      headless = true,
    } = input as BrowserNavigateInput;

    if (!url || !chromeExecutablePath) {
      throw new Error("browser.navigate requires { url, chromeExecutablePath }");
    }

    const stepBudgetMs = 45_000; // matches defaultBudget.maxWallTimeMs above
    const processResult = await ctx.spawnProcess({
      command: pythonExecutable,
      args: [BRIDGE_PATH],
      input: JSON.stringify({
        url,
        chromeExecutablePath,
        headless,
        timeoutMs: stepBudgetMs - HARD_KILL_MARGIN_MS,
      }),
      // The process's own hard kill must fire BEFORE this one, so the
      // process gets the chance to report a clean {ok:false} instead of
      // being SIGKILLed by the outer boundary first.
      timeoutMs: stepBudgetMs,
    });

    if (processResult.timedOut) {
      throw new Error(`browser.navigate: bridge process exceeded ${stepBudgetMs}ms`);
    }
    if (processResult.exitCode !== 0 && !processResult.stdout.trim()) {
      throw new Error(
        `browser.navigate: bridge crashed with no output (exit ${processResult.exitCode}): ` +
          processResult.stderr.slice(-1000),
      );
    }

    let parsed: Omit<BrowserNavigateOutput, "artifactId">;
    try {
      parsed = JSON.parse(processResult.stdout.trim().split("\n").pop()!);
    } catch {
      throw new Error(
        `browser.navigate: bridge produced non-JSON output: ${processResult.stdout.slice(-500)}`,
      );
    }

    const artifactId = await ctx.putArtifact(JSON.stringify(parsed));
    return { ...parsed, artifactId } satisfies BrowserNavigateOutput;
  },
};

/**
 * A real check, not a rubber stamp: the bridge can report `ok: true` with
 * empty/garbage content just as easily as it can genuinely succeed — this
 * verifies actual page content came back, the way AC-3 (WP-001) proved
 * verification has to for any capability, not just the toy fetch tool.
 */
export const browserNavigateSucceeded: Check = {
  id: "browser.navigateSucceeded",
  async run(output): Promise<CheckResult> {
    const result = output as Partial<BrowserNavigateOutput> | undefined;

    if (!result || result.ok !== true) {
      return {
        checkId: "browser.navigateSucceeded",
        passed: false,
        reason: `navigation did not succeed: ${result?.error ?? "unknown error"}`,
      };
    }
    if (!result.text || result.text.trim().length === 0) {
      return {
        checkId: "browser.navigateSucceeded",
        passed: false,
        reason: "navigation reported ok=true but returned no page text",
      };
    }

    return {
      checkId: "browser.navigateSucceeded",
      passed: true,
      reason: `rendered "${result.title}" — ${result.text.length} chars of page text`,
      detail: { title: result.title, textLength: result.text.length },
    };
  },
};
