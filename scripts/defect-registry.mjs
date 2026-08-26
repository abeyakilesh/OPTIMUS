#!/usr/bin/env node
/**
 * GATE — the defect-class registry stays true.
 *
 * `docs/DEFECT_CLASSES.md` is a description of defects that live somewhere
 * else, which makes it subject to every failure mode it catalogues. Three in
 * particular, all of which have already happened in this repo:
 *
 *   · `count-in-summary-disagrees-with-rows` — the coverage line is typed by
 *     hand and rots the moment a class is added. The first draft of this file
 *     said 57 with 69 rows present.
 *   · `stale-single-source` — a Detection line naming a file or test that has
 *     since been renamed or deleted, still reading as a live mechanism.
 *   · `rule-without-mechanism` — a class with no detection and no tracking
 *     issue, which is a note about a defect rather than a defence against it.
 *
 * So the registry is computed and checked rather than trusted:
 *   --check   (default) verify; exit 1 on any violation
 *   --update  rewrite the coverage line from the actual rows
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGISTRY = "docs/DEFECT_CLASSES.md";
const mode = process.argv.includes("--update") ? "update" : "check";

// Read directly rather than existsSync-then-read. The guard was a
// check-then-act on the filesystem: CodeQL flagged the later writeFileSync as
// a TOCTOU race, and it was right — the file can change between the check and
// either the read or the write. Letting the read throw is both safer and
// simpler, and it reports the real errno instead of a generic "is missing".
let text;
try {
  text = readFileSync(REGISTRY, "utf8");
} catch (e) {
  console.log(`::error title=Defect registry::Cannot read ${REGISTRY} — ${e.message}`);
  process.exit(1);
}
const errors = [];

/** Split into one block per class. */
const blocks = text.split(/^### /m).slice(1);
const classes = blocks.map((b) => {
  const name = (b.match(/^`([^`]+)`/) || [])[1] ?? b.split("\n")[0].trim();
  const field = (label) => {
    const m = b.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n---)`, "m"));
    return m ? m[1].trim() : "";
  };
  return {
    name,
    looks: field("Looks like"),
    instances: field("Instances"),
    survived: field("Why it survived"),
    detection: field("Detection"),
  };
});

if (classes.length === 0) errors.push("No class rows found — the registry parsed as empty.");

// ── 1 · every class is complete ────────────────────────────────────────────
for (const c of classes) {
  for (const [label, value] of [
    ["Looks like", c.looks],
    ["Instances", c.instances],
    ["Why it survived", c.survived],
    ["Detection", c.detection],
  ]) {
    if (!value) errors.push(`${c.name}: missing "${label}".`);
  }

  // An instance must cite something real. No reconstructed-from-memory rows.
  if (c.instances && !/(PR|Issue|issue|#)\s*#?\d+|commit\s+`?[0-9a-f]{7,}/.test(c.instances)) {
    errors.push(`${c.name}: Instances cites no PR, issue or commit. Every instance must reference a real ref.`);
  }
}

// ── 2 · UNDETECTED must name a tracking issue or an explicit reason ────────
const undetected = classes.filter((c) => /\bUNDETECTED\b/.test(c.detection));
for (const c of undetected) {
  const hasIssue = /#\d+/.test(c.detection);
  const hasReason = /—|--/.test(c.detection) && c.detection.length > 30;
  if (!hasIssue && !hasReason) {
    errors.push(
      `${c.name}: marked UNDETECTED with no tracking issue and no stated reason. ` +
        `"We know about it" is not a mechanism (THE ENFORCEMENT RULE).`,
    );
  }
}

// ── 3 · a named mechanism must still exist ─────────────────────────────────
// Detection lines name files in backticks. A path that has been renamed or
// deleted leaves the row reading as a live defence that is not there.
// Only the token immediately BEFORE a `::` is a path claim. That is the
// authoring convention — `path` :: identifier — and it matters: a Detection
// line legitimately backticks other things after the `::`, such as a
// .gitignore ENTRY (`CLAUDE.md`) or a PATTERN (`/README.md`), neither of
// which is a file that should exist. Validating every backticked token
// reported three false failures on the first run.
for (const c of classes) {
  if (/\bUNDETECTED\b/.test(c.detection)) continue;
  const referenced = [...c.detection.matchAll(/`([^`]+)`\s*::/g)].map((m) => m[1]);
  if (referenced.length === 0) {
    errors.push(`${c.name}: Detection names no file. It must point at the thing that actually catches this.`);
  }
  for (const path of referenced) {
    if (!existsSync(path)) {
      errors.push(
        `${c.name}: Detection references "${path}", which does not exist. ` +
          `A mechanism that has been renamed or deleted still reads as live.`,
      );
    }
  }
}


// ── 5 · a PR that admits a defect must touch the registry ──────────────────
//
// THE REGISTRY RULE: every mistake either adds a class or appends an instance,
// in the same PR that fixes it. Otherwise the lesson lives in a PR body nobody
// re-reads and the class is rediscovered from scratch — which has already
// happened three times for `test-passes-without-subject` and four for
// `pr-body-not-diff`.
//
// Deliberately phrase-based rather than clever. It cannot know whether a
// defect was found; it can notice the author SAYING one was, and ask for the
// registry to move. False positives are cheap (tick the "no new class" box and
// append an instance, or say why not); a missed lesson is not.
const CONFESSION = [
  /\bI got (?:that |this )?wrong\b/i,
  /\bmy (?:own )?(?:mistake|bug|error|slip|overclaim)\b/i,
  /\bcaught by (?:CI|the gauntlet|mutation)/i,
  /\bthis (?:is|was) a (?:real )?defect\b/i,
  /\bshould have (?:caught|checked|noticed|been)\b/i,
  /\bfound (?:a|the) (?:real )?(?:defect|bug)\b/i,
  /\bwas (?:false|untrue|wrong)\b/i,
  /\bnearly (?:shipped|reported|missed)\b/i,
  /\bdead (?:code|check)\b/i,
  /\bcould never fire\b/i,
  /\bpassing for the wrong reason\b/i,
];

const prBody = process.env.PR_BODY ?? "";
if (prBody) {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  const validSha = (v) => (/^[0-9a-f]{7,40}$/i.test(v ?? "") ? v : null);
  let changed = [];
  if (validSha(base) && validSha(head)) {
    try {
      changed = execFileSync("git", ["diff", "--name-only", validSha(base), validSha(head)], {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
    } catch {
      changed = [];
    }
  }
  const touchedRegistry = changed.includes(REGISTRY);
  const optedOut = /No new defect class surfaced in this PR/i.test(prBody) &&
    /\[x\][^\n]*No new defect class surfaced/i.test(prBody);

  const fired = CONFESSION.filter((re) => re.test(prBody));
  if (fired.length > 0 && !touchedRegistry && !optedOut) {
    const phrase = (prBody.match(fired[0]) || [""])[0];
    errors.push(
      `This PR body says a defect was found or a mistake corrected — the phrase that fired was ` +
        `"${phrase}" — but ${REGISTRY} is unchanged.\n` +
        `      Add the new class, or append an instance to the existing one, in THIS PR.\n` +
        `      A defect that recurs was never classified (THE REGISTRY RULE).\n` +
        `      If it genuinely produced no class, tick "No new defect class surfaced in this PR" and say why.`,
    );
  }
}

// ── 4 · the coverage line must match the rows ──────────────────────────────
const total = classes.length;
const undetectedCount = undetected.length;
const detected = total - undetectedCount;
const expected = `> **${total} classes · ${detected} with a real detection mechanism · ${undetectedCount} UNDETECTED**`;

if (mode === "update") {
  const updated = text.replace(/^> \*\*\d+ classes ·.*$/m, expected);
  // "no change" and "no such line" are different outcomes and used to share an
  // exit path, so running --update on an already-correct registry failed with
  // "Could not find a coverage line" — a true statement about nothing that had
  // happened (`mislabelled-failure-reason`, PR #62). Distinguish them.
  if (!/^> \*\*\d+ classes ·.*$/m.test(text)) {
    console.error("No coverage line found. The registry must state N classes · M detected · K UNDETECTED.");
    process.exit(1);
  }
  if (updated === text) {
    console.log(`Coverage line already correct: ${total} classes · ${detected} detected · ${undetectedCount} UNDETECTED`);
    process.exit(0);
  }
  writeFileSync(REGISTRY, updated);
  console.log(`Coverage line updated: ${total} classes · ${detected} detected · ${undetectedCount} UNDETECTED`);
  process.exit(0);
}

const claimed = text.match(/^> \*\*(\d+) classes · (\d+) with a real detection mechanism · (\d+) UNDETECTED\*\*/m);
if (!claimed) {
  errors.push("No coverage line found. The registry must state N classes · M detected · K UNDETECTED.");
} else if (Number(claimed[1]) !== total || Number(claimed[2]) !== detected || Number(claimed[3]) !== undetectedCount) {
  errors.push(
    `Coverage line disagrees with the rows.\n` +
      `      claims: ${claimed[1]} classes · ${claimed[2]} detected · ${claimed[3]} UNDETECTED\n` +
      `      actual: ${total} classes · ${detected} detected · ${undetectedCount} UNDETECTED\n` +
      `      Fix with: node scripts/defect-registry.mjs --update`,
  );
}

const summary = [
  "## Defect-class registry",
  "",
  `- classes recorded: **${total}**`,
  `- with a real detection mechanism: **${detected}**`,
  `- **UNDETECTED: ${undetectedCount}**`,
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}

if (errors.length > 0) {
  for (const e of errors) console.log(`::error title=Defect registry::${e}`);
  console.error(`\n${errors.length} registry violation(s).`);
  process.exit(1);
}
console.log("\nDefect registry consistent.");
process.exit(0);
