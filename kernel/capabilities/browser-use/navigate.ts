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
import { ARTIFACT_ID_OUTPUT } from "../../outputContract";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = join(HERE, "bridge.py");

/**
 * The allow-lists behind this capability's two `executable` constraints.
 *
 * THE TRUST BOUNDARY, stated plainly, because the env-var terms below look
 * like a hole and are not one:
 *
 *   - STEP INPUT is untrusted. Today it is built by server code in
 *     app/api/missions/route.ts; the very next kernel task hands that job to
 *     a PLANNER — an LLM writing step inputs from a user's objective. That is
 *     the threat: a value chosen downstream of a prompt picking which binary
 *     the kernel executes.
 *
 *   - ENVIRONMENT is the operator. Whoever sets these already chose our PATH,
 *     our interpreter and our working directory before this process started.
 *     Nothing is conceded by letting them name a Chrome — they could replace
 *     the one we hardcoded.
 *
 * So the allow-list is: known-good defaults, plus whatever the operator
 * explicitly declared. Step input may only SELECT from that list; it can
 * never extend it.
 */
const VENV_PYTHON = join(HERE, ".venv", "bin", "python3");
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LINUX_CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

/** Operator-declared additions. Undefined and empty are both ignored. */
function withOperatorOverride(defaults: readonly string[], envVar: string): readonly string[] {
  const declared = process.env[envVar]?.trim();
  return declared ? [...defaults, declared] : defaults;
}

const ALLOWED_PYTHON = withOperatorOverride(["python3", "python", VENV_PYTHON], "OPTIMUS_TEST_PYTHON");
const ALLOWED_CHROME = withOperatorOverride([MAC_CHROME, ...LINUX_CHROME], "OPTIMUS_TEST_CHROME_PATH");

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
    inputConstraints: {
      // `anyHost` is honest here and not a shrug: navigating the open web is
      // literally the capability. The SCHEME is the part that was a hole.
      // Before this constraint, `file:///etc/passwd` went straight to a real
      // Chromium and came back in output.text — a local file read that K4's
      // readRoots cannot see, because the read happens inside the child
      // process (the same blind spot unconfinedChildEgress already admits to
      // for sockets). `data:` and `javascript:` were equally reachable.
      url: { kind: "url", required: true, allowedSchemes: ["http", "https"], anyHost: true },
      // This string was passed straight to spawn() as the command. proc:spawn
      // gates WHETHER a child may run and isolation.cwd gates WHERE — nothing
      // gated WHICH BINARY, so step input chose the executable. There is no
      // shell involved (spawn, not exec), so this was never shell injection;
      // it was something simpler, which is that the caller picked the program.
      pythonExecutable: { kind: "executable", allowed: ALLOWED_PYTHON },
      // Handed to browser-use as the browser binary — the same class of value
      // as pythonExecutable, and constrained the same way. The list is the
      // real install locations on the platforms this runs on; a new one is a
      // reviewable manifest change rather than a runtime surprise.
      chromeExecutablePath: { kind: "executable", required: true, allowed: ALLOWED_CHROME },
      headless: { kind: "boolean" },
    },
    // The bridge's two exit shapes, read off bridge.py rather than off
    // BrowserNavigateOutput: {ok, url, title, text} on success, {ok, error} on
    // any failure. So `ok` is the only field true on both paths.
    //
    // The closed field set earns more here than anywhere else in the kernel:
    // this output is JSON parsed from a CHILD PROCESS the kernel does not
    // sandbox. An extra key appearing in it is a change in something outside
    // this repo, and it now fails the step by name instead of flowing onward.
    outputs: {
      ok: { kind: "boolean", required: true },
      url: { kind: "string" },
      title: { kind: "string" },
      text: { kind: "string" },
      error: { kind: "string" },
      artifactId: ARTIFACT_ID_OUTPUT,
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
