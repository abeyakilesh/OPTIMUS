import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

/**
 * Box #7/#8/#9's real vertical slice: browser → /api/missions → real
 * Scheduler → llm.chat → (a real OmniRoute instance, when one exists) →
 * persisted to disk → listed in a real sidebar → reopenable with its real
 * evidence. CI has no OmniRoute reachable (same honest gap as browser-use's
 * Chrome/Python and OmniRoute's own real-server tests), so the
 * default-environment case here IS the unavailable path — tested for real,
 * not mocked. The success-render path is mocked separately.
 */

test.describe("missions", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads with an input and a disabled send button until there's text", async ({ page }) => {
    await page.goto("/chat");

    const input = page.getByPlaceholder("Message OPTIMUS…");
    const send = page.getByRole("button", { name: "Send" });

    await expect(input).toBeVisible();
    await expect(send).toBeDisabled();

    await input.fill("hello");
    await expect(send).toBeEnabled();
  });

  test("a real (unreachable) attempt reports honest unavailability and still appears in the sidebar as red", async ({
    page,
  }) => {
    await page.goto("/chat");
    const marker = `e2e-unavailable-${Date.now()}`;

    await page.getByPlaceholder("Message OPTIMUS…").fill(marker);
    await page.getByRole("button", { name: "Send" }).click();

    // Directive #4: no fabricated reply — a real, honest failure instead.
    await expect(page.getByText("model layer unavailable")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);

    // And it's a REAL mission, not thrown away — it shows up in history,
    // honestly marked as not-green (hollow dot, not the emerald "passed" one).
    const row = page.locator("aside li", { hasText: marker });
    await expect(row).toBeVisible();
    await expect(row.locator("span.bg-pass")).toHaveCount(0);
  });

  test("clicking a past mission in the sidebar reopens its real transcript, not the composer state", async ({
    page,
  }) => {
    const missionId = "e2e-mocked-mission-id";
    const objective = "what is the meaning of a verified reply";

    // The sidebar's list (GET /api/missions) and the reopened detail
    // (GET /api/missions/:id) are two SEPARATE round trips in the real
    // app — mocking only one would prove nothing about the other, so both
    // are mocked here to isolate the reopen UI logic from live storage
    // (already proven for real via the earlier curl round trip this PR's
    // description is built on).
    await page.route("**/api/missions", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, missions: [{ id: missionId, objective, status: "green", startedAt: Date.now() }] }),
      });
    });
    await page.route(`**/api/missions/${missionId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          content: "the real, persisted answer from before",
          mission: {
            spec: { id: missionId, objective, steps: [{ id: "chat", capabilityId: "llm.chat", input: { messages: [{ role: "user", content: objective }] }, dependsOn: [], checks: ["llm.chatSucceeded"] }] },
            status: "green",
            steps: {
              chat: {
                spec: { id: "chat", capabilityId: "llm.chat", input: { messages: [{ role: "user", content: objective }] }, dependsOn: [], checks: ["llm.chatSucceeded"] },
                status: "passed",
                evidence: {
                  stepId: "chat", capabilityId: "llm.chat", capabilityVersion: "x", attempts: 1, exitCode: 0,
                  durationMs: 99, cost: 1, artifactIds: ["sha256:0"], inputHash: "x",
                  checks: [{ checkId: "llm.chatSucceeded", passed: true, reason: "reopened ok" }],
                },
              },
            },
          },
        }),
      });
    });

    await page.goto("/chat");
    await page.locator("aside li", { hasText: objective }).click();

    await expect(page.getByText("the real, persisted answer from before")).toBeVisible();
    await expect(page.locator('[data-role="user"]', { hasText: objective })).toBeVisible();
  });

  test("renders a real reply bubble with a real evidence caption when the model layer responds", async ({
    page,
  }) => {
    await page.route("**/api/missions", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          missionId: "mocked-mission-id",
          status: "green",
          content: "mocked reply for UI render test",
          steps: [
            {
              id: "chat",
              capabilityId: "llm.chat",
              status: "finished",
              durationMs: 123,
              checks: [{ checkId: "llm.chatSucceeded", passed: true, reason: 'model "x" replied' }],
            },
          ],
        }),
      });
    });

    await page.goto("/chat");
    await page.getByPlaceholder("Message OPTIMUS…").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("mocked reply for UI render test")).toBeVisible();
    await expect(page.getByText("✓ llm.chatSucceeded")).toBeVisible();
    await expect(page.getByText("123ms")).toBeVisible();
  });
});
