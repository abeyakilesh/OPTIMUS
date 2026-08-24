import { expect, test } from "@playwright/test";

/**
 * The first real vertical slice: browser → /api/chat → kernel → llm.chat
 * capability → (a real OmniRoute instance, when one exists). CI has no
 * OmniRoute reachable, same honest gap as browser-use's Chrome/Python and
 * OmniRoute's own real-server unit tests — so the default-environment case
 * here IS the unavailable path, tested for real, not mocked. The success
 * render path is mocked separately since a real reply isn't available in CI.
 */

test.describe("chat", () => {
  test("loads with an input and a disabled send button until there's text", async ({ page }) => {
    await page.goto("/chat");

    const input = page.getByPlaceholder("Message OPTIMUS…");
    const send = page.getByRole("button", { name: "Send" });

    await expect(input).toBeVisible();
    await expect(send).toBeDisabled();

    await input.fill("hello");
    await expect(send).toBeEnabled();
  });

  test("reports the model layer as honestly unavailable when nothing is behind it — the real CI condition, not a mock", async ({
    page,
  }) => {
    await page.goto("/chat");

    await page.getByPlaceholder("Message OPTIMUS…").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    // Directive #4: an unreachable capability is reported as unavailable,
    // never faked. This is the real /api/chat route hitting a real (absent)
    // OmniRoute instance — no interception anywhere in this test.
    await expect(page.getByText("model layer unavailable")).toBeVisible({ timeout: 15_000 });
    // And critically, no fabricated assistant reply appears alongside it.
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
  });

  test("renders a real reply bubble when the model layer responds", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, content: "mocked reply for UI render test" }),
      });
    });

    await page.goto("/chat");
    await page.getByPlaceholder("Message OPTIMUS…").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("mocked reply for UI render test")).toBeVisible();
  });
});
