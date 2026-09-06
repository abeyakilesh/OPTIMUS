#!/usr/bin/env node
/**
 * ABSORPTION GUARD — the gate that is specific to OPTIMUS.
 *
 * Every other gate in the gauntlet is generic engineering hygiene. This one
 * enforces the rules in CLAUDE.md that killed the last three projects when
 * they were left to good intentions:
 *
 *   Directive 1  · one repo per PR — no bulk absorption waves
 *   Directive 4  · never present a capability that isn't wired
 *   Directive 6  · an honest Absorption Score, with its breakdown
 *   Scoring      · AVAILABLE requires >=90/100, Fidelity >=30/35, Safety ==30/30
 *   Gauntlet     · nobody silently weakens the pipeline to get a PR through
 *
 * Exits non-zero on violation. Advisory notices use ::warning so they surface
 * without blocking ordinary product work.
 */

import { execFileSync } from "node:child_process";

const rawBody = process.env.PR_BODY ?? "";
const title = process.env.PR_TITLE ?? "";

/**
 * The body with HTML comments removed.
 *
 * WHY: `.github/PULL_REQUEST_TEMPLATE.md` ships its own instructions inside
 * `<!-- -->`, and one of those lines is
 *
 *     **Repo:** · **Fate:** PORT / BUNDLE / HARVEST · **Pinned SHA:**
 *
 * which is exactly what the absorption detector below matches on. So a PR
 * whose body still carries the UNFILLED template was classified as an
 * absorption and asked for a score breakdown it could not have — the
 * placeholder was read as a claim. Caught on PR #78, a kernel-only change
 * whose body GitHub had auto-filled from the commit message plus the template.
 *
 * The direction of the bug is what makes it worth a fix rather than a note:
 * it demanded MORE than it should, so it failed loudly instead of passing
 * silently. The same read is one edit away from the opposite — a real Fate
 * line commented out and a real absorption sailing through unscored.
 *
 * A comment is not a claim. Everything below reads this, never `rawBody`.
 *
 * WHY THIS IS A SCANNER AND NOT `.replace(/<!--[\s\S]*?-->/g, "")`. That was
 * the first version and CodeQL failed it HIGH —
 * `js/incomplete-multi-character-sanitization`: a single pass that removes a
 * multi-character delimiter can leave the opener behind. The rule is written
 * for HTML sanitisation and this is not rendering HTML, so it was tempting to
 * call it a false positive and move on. That reasoning — correct observation,
 * convenient conclusion — is the one this repo has a rule about.
 *
 * The rewrite is not defensive paperwork either. It pins the SEMANTICS, which
 * the regex only got right by accident:
 *
 *   · Comments DO NOT NEST. `<!-- a <!-- b --> c -->` ends at the FIRST
 *     `-->`, leaving ` c -->` as visible text. A greedy regex would have
 *     swallowed the lot and hidden text a reviewer can plainly see.
 *   · An UNCLOSED `<!--` runs to the end of the document, which is what HTML
 *     does and what GitHub renders — everything after it is invisible.
 *
 * Matching what the reviewer SEES is the whole point: the guard and the human
 * must be reading the same document. And the fail-safe direction holds — a
 * body that hides a Fate line behind an unclosed comment also hides it from
 * the reviewer, so no absorption is being claimed; the file-based detector
 * (`added` under `kernel/capabilities/`) still fires regardless, because it
 * reads the diff and cannot be spoofed by body text at all.
 */
function stripHtmlComments(s) {
  let out = "";
  let i = 0;
  for (;;) {
    const open = s.indexOf("<!--", i);
    if (open === -1) return out + s.slice(i);
    out += s.slice(i, open);
    const close = s.indexOf("-->", open + 4);
    if (close === -1) return out; // unterminated: the rest is comment
    i = close + 3;
  }
}

const body = stripHtmlComments(rawBody);

const errors = [];
const warnings = [];

// A commit SHA is 7-40 hex characters and nothing else. Anything that fails
// this never reaches git. NFR-19 says untrusted input is never interpolated
// into a shell; this guard is itself CI code, so it holds itself to that.
const sha = (value) => (/^[0-9a-f]{7,40}$/i.test(value ?? "") ? value : null);
const base = sha(process.env.BASE_SHA);
const head = sha(process.env.HEAD_SHA);

if (process.env.BASE_SHA && !base) errors.push("BASE_SHA is not a valid commit SHA.");
if (process.env.HEAD_SHA && !head) errors.push("HEAD_SHA is not a valid commit SHA.");

// execFileSync with an argv array — no shell is spawned, so no argument can be
// reinterpreted as a command regardless of what it contains.
const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const changed = base && head
  ? git(["diff", "--name-only", base, head]).split("\n").filter(Boolean)
  : [];

/**
 * Files this PR ADDED, as opposed to touched. Absorption means a capability
 * that did not exist now does; editing an existing capability's manifest is
 * ordinary kernel work and must not be made to report an Absorption Score for
 * a repo it did not absorb.
 *
 * `--name-only` cannot tell the two apart, which is why the file-based
 * detector fired on PR #65 — a change to `llm.chat`'s manifest adding a
 * required `trust` field, absorbing nothing.
 */
const added = base && head
  ? git(["diff", "--name-status", "--diff-filter=A", base, head])
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t").pop())
      .filter(Boolean)
  : [];

/* ── 1 · nobody weakens the gauntlet ──────────────────────────────────── */
const ciTouched = changed.filter((f) => f.startsWith(".github/workflows/"));
if (ciTouched.length > 0) {
  const diff = git(["diff", base, head, "--", ".github/workflows/"]);
  // Lines being ADDED that neuter a gate.
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const neutering = added.filter((l) =>
    /continue-on-error:\s*true|if:\s*false|^\+\s*#\s*(uses|run):/.test(l),
  );
  if (neutering.length > 0 && !/WEAKENS THE GAUNTLET/i.test(body)) {
    errors.push(
      "This PR makes a CI gate non-blocking or comments one out:\n" +
        neutering.map((l) => `      ${l.trim()}`).join("\n") +
        "\n    If that is deliberate, state why in the PR body and include the\n" +
        "    literal phrase 'WEAKENS THE GAUNTLET' so it cannot happen quietly.",
    );
  }
}

// `kernel/capabilities/`, not `capabilities/`. The original prefix matched
// nothing in this repo, so BOTH the absorption detection below and the
// one-repo-per-PR check were dead from the first commit — a guard that could
// not fire, printing "Absorption rules satisfied."
//
// Declared HERE, above its first use. It was originally declared in section 3
// and read in section 2, which is a TDZ ReferenceError the moment `changed` is
// non-empty. Local tests missed it because they left BASE_SHA/HEAD_SHA unset,
// so `changed` was always [] and `.some()` never ran the callback.
const CAP_PREFIX = "kernel/capabilities/";

/* ── 2 · is this an absorption PR? ────────────────────────────────────── */
const isAbsorption =
  // `absorb/scrapling: ...` is this repo's actual convention and the original
  // `^absorb[:(]` did not match it, leaving the body's Fate line as the ONLY
  // working detector. Omit that line and every score check skipped silently.
  /^absorb[:/(]/i.test(title) ||
  /\*\*Fate:\*\*\s*(PORT|BUNDLE|HARVEST)/i.test(body) ||
  // ADDED, not changed. See `added` above (#65).
  added.some((f) => f.startsWith(CAP_PREFIX));

if (!isAbsorption) {
  console.log("Not an absorption PR — checked gauntlet integrity only.");
  finish();
}

/* ── 3 · one repo per PR ──────────────────────────────────────────────── */
const capDirs = new Set(
  added
    .filter((f) => f.startsWith(CAP_PREFIX))
    // A capability is either a directory (omniroute/chat.ts) or a single file
    // (scrapling-relocate.ts); both are one capability, so drop the extension
    // and treat the segment as its name.
    .map((f) => f.slice(CAP_PREFIX.length).split("/")[0].replace(/\.[^.]+$/, ""))
    .filter(Boolean),
);
if (capDirs.size > 1) {
  errors.push(
    `This PR absorbs ${capDirs.size} repos: ${[...capDirs].join(", ")}.\n` +
      "    One repo = one issue = one branch = one PR (Directive 1). Split it.",
  );
}

/* ── 4 · the score must be present, broken down, and honest ───────────── */
const total = body.match(/(\d{1,3})\s*\/\s*100/);
if (!total) {
  errors.push(
    "No Absorption Score found. Every absorption PR reports a score out of\n" +
      "    100 — 0/100 is valid and honest, a missing score is not (Directive 6).",
  );
} else {
  const score = Number(total[1]);
  if (score > 100) errors.push(`Absorption Score ${score}/100 is out of range.`);

  const grab = (label, max) => {
    const m = new RegExp(`\\|\\s*${label}\\s*\\|\\s*${max}\\s*\\|\\s*(\\d{1,3})`, "i").exec(body);
    return m ? Number(m[1]) : null;
  };
  const parts = {
    Fidelity: grab("Fidelity", 35),
    // Safety 30 and Integration 10 since #40: gate 8's input contract moved
    // from Integration ("is it declared") to Safety ("does it hold"). A
    // relocation, not an addition — the total is still 100.
    Safety: grab("Safety", 30),
    Robustness: grab("Robustness", 15),
    Integration: grab("Integration", 10),
    "Proof coverage": grab("Proof coverage", 10),
  };

  const missing = Object.entries(parts).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length > 0) {
    errors.push(
      `Score breakdown incomplete — missing: ${missing.join(", ")}.\n` +
        "    'A bare number without the breakdown is not an honest score.'",
    );
  } else {
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    if (sum !== score) {
      errors.push(
        `Score arithmetic does not add up: components sum to ${sum} but the ` +
          `PR claims ${score}/100.`,
      );
    }
    // The AVAILABLE thresholds. Safety is never partial credit.
    const claimsAvailable = /\bAVAILABLE\b/.test(body) && !/UNAVAILABLE/.test(body);
    if (claimsAvailable) {
      if (score < 90) errors.push(`Claims AVAILABLE at ${score}/100. Requires >=90.`);
      if (parts.Fidelity < 30) errors.push(`Claims AVAILABLE with Fidelity ${parts.Fidelity}/35. Requires >=30.`);
      if (parts.Safety !== 30) {
        errors.push(
          `Claims AVAILABLE with Safety ${parts.Safety}/30. Safety is never ` +
            "partial credit — either all six boundaries are wired and tested " +
            "(permission, sandbox, input, verify, log, rollback), or the " +
            "capability stays UNAVAILABLE (Directive 4).",
        );
      }
    }
  }
}

/* ── 5 · fidelity evidence must actually be filled in ─────────────────── */
if (/Fidelity evidence/i.test(body)) {
  const table = body.split(/Fidelity evidence[^\n]*\n/i)[1] ?? "";
  const rows = table.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l));
  const filled = rows.filter((r) => r.replace(/\|/g, "").trim().length > 0).length;
  if (filled < 2) {
    errors.push(
      "Fidelity evidence table is empty. Gate 11 needs real golden inputs and\n" +
        "    the parent's outputs beside OPTIMUS's. 'It looks right' is not evidence.",
    );
  }
}

/* ── 6 · provenance ───────────────────────────────────────────────────── */
// `\**` skips the markdown bold the PR template wraps the label in.
if (!/Pinned SHA:?\**\s*\**\s*\b[0-9a-f]{7,40}\b/i.test(body)) {
  warnings.push("No pinned upstream SHA found. Gate 6 requires reproducible provenance.");
}

finish();

function finish() {
  for (const w of warnings) console.log(`::warning title=Absorption guard::${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.log(`::error title=Absorption guard::${e}`);
    console.error(`\n${errors.length} absorption rule violation(s). See CLAUDE.md.`);
    process.exit(1);
  }
  console.log("Absorption rules satisfied.");
  process.exit(0);
}
