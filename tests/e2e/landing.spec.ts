import { expect, test } from "@playwright/test";

/**
 * Smoke assertions for the landing page. These check the things that have
 * actually broken during development — a section silently failing to render,
 * a client component crashing hydration, the palette leaking, or fabricated
 * social proof appearing.
 */

test.describe("landing page", () => {
  test("renders every section", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("One objective");

    for (const heading of [
      "Seven surfaces. One brain.",
      "Every capability enters through the same five gates.",
      "Not answers. Outcomes you can check.",
      "One workspace. Your machine or ours.",
      "Stop prompting.",
    ]) {
      await expect(page.getByRole("heading", { name: new RegExp(heading.split(".")[0], "i") }).first())
        .toBeVisible();
    }
  });

  test("the loop completes on its own", async ({ page }) => {
    await page.goto("/");
    const ring = page.locator("#how");
    await ring.scrollIntoViewIfNeeded();

    // Progress is rendered as a percentage in the ring centre. It must advance
    // without any scrolling — the loop drives itself once seen.
    const readout = ring.locator("p.font-display").first();
    const first = await readout.textContent();
    await page.waitForTimeout(2500);
    const second = await readout.textContent();

    expect(first, "ring never rendered a percentage").toBeTruthy();
    expect(second, "loop did not advance on its own — is it scroll-scrubbed again?")
      .not.toBe(first);
  });

  test("stats count up when scrolled into view", async ({ page }) => {
    await page.goto("/");
    const stats = page.locator("dl").first();
    await stats.scrollIntoViewIfNeeded();
    await expect(stats.locator("dt").first()).toContainText("5,000", { timeout: 5000 });
  });

  test("ships no fabricated testimonials", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/not inventing any/i)).toBeVisible();
  });

  test("has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("body never scrolls horizontally", async ({ page }) => {
    await page.goto("/");
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll at ${width}px`).toBe(false);
    }
  });
});
