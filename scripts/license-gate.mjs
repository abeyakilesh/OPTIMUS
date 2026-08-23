#!/usr/bin/env node
/**
 * GATE 5 — forbidden-license check, read from the CycloneDX SBOM.
 *
 * Why not `license-checker`: it shells out to `npm ls --json --long --all`,
 * which exits ELSPROBLEMS whenever npm reports an extraneous or invalid
 * optional platform package. That happens routinely on CI, because the
 * lockfile carries optional binaries for every platform (sharp, lightningcss)
 * and only one platform's set is ever installed. The gate died on an
 * environment artefact rather than on a licence.
 *
 * The SBOM is generated from the lockfile, so it does not have that failure
 * mode, and it is a required artefact of this job anyway — one source of
 * truth for what actually ships.
 *
 * The policy is UNCHANGED from the license-checker invocation this replaces:
 * production dependencies only, failing on the same seven identifiers.
 *
 * Usage: node scripts/license-gate.mjs <sbom.json>
 */

// CLAUDE.md: OPTIMUS ships as ONE standalone deployable, so a copyleft or
// source-available dep linked into the artifact is a real licensing problem.
const FORBIDDEN = [
  "AGPL-1.0",
  "AGPL-3.0",
  "GPL-2.0",
  "GPL-3.0",
  "SSPL-1.0",
  "BUSL-1.1",
  "Elastic-2.0",
];

/**
 * Split an SPDX expression into its individual licence identifiers.
 * "Apache-2.0 AND LGPL-3.0-or-later AND MIT" -> [Apache-2.0, LGPL-3.0-or-later, MIT]
 */
function tokenize(expression) {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR|WITH)\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Normalise one identifier for comparison. `-only` / `-or-later` are SPDX
 * suffixes on the SAME licence, so they must compare equal to the bare id.
 *
 * This is deliberately an exact-token match, NOT a substring match: a
 * substring test would classify LGPL-3.0-or-later as GPL-3.0 and fail the
 * build on sharp's libvips, which is permitted here.
 */
function normalise(identifier) {
  return identifier
    .trim()
    .replace(/[+]$/, "")
    .replace(/-(?:only|or-later)$/i, "")
    .toUpperCase();
}

const FORBIDDEN_NORMALISED = new Set(FORBIDDEN.map(normalise));

function licenceStrings(component) {
  const out = [];
  for (const entry of component.licenses ?? []) {
    if (entry.expression) out.push(entry.expression);
    const license = entry.license ?? {};
    if (license.id) out.push(license.id);
    else if (license.name) out.push(license.name);
  }
  return out;
}

const sbomPath = process.argv[2];
if (!sbomPath) {
  console.error("usage: node scripts/license-gate.mjs <sbom.json>");
  process.exit(2);
}

const { readFileSync } = await import("node:fs");
let sbom;
try {
  sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
} catch (error) {
  console.error(`Cannot read SBOM at ${sbomPath}: ${error.message}`);
  process.exit(2);
}

const components = sbom.components ?? [];
if (components.length === 0) {
  // An empty SBOM would vacuously pass. That is exactly the "reports green
  // while doing nothing" failure this pipeline exists to prevent.
  console.error("SBOM contains no components — refusing to pass vacuously.");
  process.exit(2);
}

const violations = [];
const undeclared = [];

for (const component of components) {
  const name = `${component.name}@${component.version ?? "?"}`;
  const strings = licenceStrings(component);

  if (strings.length === 0) {
    undeclared.push(name);
    continue;
  }

  for (const raw of strings) {
    for (const token of tokenize(raw)) {
      if (FORBIDDEN_NORMALISED.has(normalise(token))) {
        violations.push({ name, token, raw });
      }
    }
  }
}

console.log(`Scanned ${components.length} production components.`);
if (undeclared.length > 0) {
  // Reported, not fatal — matches the previous tool's behaviour.
  console.log(`No licence declared (${undeclared.length}): ${undeclared.join(", ")}`);
}

if (violations.length > 0) {
  console.error("");
  console.error("Forbidden licence(s) found — OPTIMUS ships as one deployable:");
  for (const v of violations) {
    console.error(`  ${v.name}  ->  ${v.token}   (declared: ${v.raw})`);
  }
  process.exit(1);
}

console.log(`No forbidden licences. Blocked set: ${FORBIDDEN.join(", ")}`);
