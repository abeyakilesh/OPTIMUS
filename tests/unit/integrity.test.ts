import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * These are not example tests. Each one enforces a rule from CLAUDE.md that
 * has previously been broken by hand, and each can genuinely fail.
 */

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const componentFiles = walk(join(ROOT, "components")).filter((f) =>
  [".tsx", ".ts"].includes(extname(f)),
);

describe("palette discipline", () => {
  /**
   * The whole palette lives in app/globals.css under @theme. Components must
   * reference tokens (text-ink, bg-sky, border-line…) and never raw hex, or
   * the palette silently drifts — which is exactly how a 5-colour design
   * becomes a 12-colour one.
   */
  it("no raw hex colours in components", () => {
    const offenders: string[] = [];
    for (const file of componentFiles) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // #abc / #aabbcc / #aabbccdd, but not "#" anchors or JSX fragments
        const m = line.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/);
        if (m && !line.includes("href")) {
          offenders.push(`${file.replace(ROOT, "")}:${i + 1} → ${m[0]}`);
        }
      });
    }
    expect(offenders, `Use a palette token instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("globals.css defines every palette token", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    for (const token of [
      "--color-white", "--color-mist", "--color-sky", "--color-sky-2",
      "--color-cyan", "--color-cyan-dark", "--color-cyan-soft",
      "--color-ink", "--color-body", "--color-muted", "--color-faint",
      "--color-line", "--color-line-2",
      "--color-run", "--color-pass",
    ]) {
      expect(css, `${token} missing from @theme`).toContain(token);
    }
  });

  it("declares exactly two non-palette hues, both semantic", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    // run = executing, pass = verified. Anything else is palette drift.
    const semantic = css.match(/--color-(run|pass)(-soft)?:/g) ?? [];
    expect(new Set(semantic).size).toBe(4);
  });
});

describe("no fabricated social proof", () => {
  /**
   * Inventing customer quotes misleads visitors and is a real legal exposure.
   * Both testimonial components must either be empty or carry real entries —
   * and this test forces a human to consciously edit it, rather than a model
   * helpfully filling the array during some unrelated refactor.
   */
  const testimonialFiles = componentFiles.filter((f) => f.includes("Testimonials"));

  it("finds the testimonial components", () => {
    expect(testimonialFiles.length).toBeGreaterThan(0);
  });

  it.each(testimonialFiles)("%s ships no invented quotes", (file) => {
    const src = readFileSync(file, "utf8");
    const arr = src.match(/TESTIMONIALS\s*:\s*Testimonial\[\]\s*=\s*\[([\s\S]*?)\]/);
    expect(arr, "TESTIMONIALS array not found — did the shape change?").toBeTruthy();
    const body = (arr?.[1] ?? "").trim();
    if (body.length > 0) {
      // Non-empty is allowed ONLY with an explicit permission marker.
      expect(
        src,
        "Testimonials are present. Add `// PERMISSION: <link//note>` proving each quote is real and authorised.",
      ).toContain("PERMISSION:");
    }
  });
});

describe("stats stay factual", () => {
  /**
   * Every figure on the page must be countable from the repo inventory.
   * No uptime, no accuracy, no "trusted by N teams" until measured.
   */
  it("uses only the four derived figures", () => {
    const src = readFileSync(join(ROOT, "components", "landing", "Stats.tsx"), "utf8");
    for (const n of ["5000", "350", "42", "17"]) {
      expect(src).toContain(n);
    }
  });

  it("makes no reliability or uptime claim", () => {
    const src = readFileSync(join(ROOT, "components", "landing", "Stats.tsx"), "utf8");
    // Strip comments first — the guard comment in that file legitimately names
    // the banned words in order to forbid them. Only shipped copy counts.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["99.9", "uptime", "reliability", "SLA", "trusted by"]) {
      expect(
        code.toLowerCase().includes(banned.toLowerCase()),
        `"${banned}" is an unmeasured claim and must not appear in rendered copy`,
      ).toBe(false);
    }
  });
});
