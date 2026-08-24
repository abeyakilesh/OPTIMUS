import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

/**
 * Box #5: a real, working auth gate in front of /chat — one shared
 * password, a real signed session (lib/auth/session.ts), enforced by
 * proxy.ts. Not a per-user account system, but not a fake "click to
 * continue" button either: every case here exercises the real routes,
 * no mocking.
 */

test.describe("auth", () => {
  test("an unauthenticated visitor is redirected from /chat to /login", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login\?next=%2Fchat$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("an unauthenticated request to /api/missions is refused, not silently allowed", async ({ request }) => {
    const res = await request.post("/api/missions", { data: { messages: [{ role: "user", content: "hi" }] } });
    expect(res.status()).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  test("the wrong password is rejected with a clear reason, and nothing is granted", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Enter the access password").fill("definitely-wrong");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Couldn't sign in")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // And the session genuinely wasn't granted — /chat is still gated.
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the right password signs in for real, reaches /chat, and sign-out revokes it", async ({ page }) => {
    await page.goto("/login?next=%2Fchat");
    await page.getByPlaceholder("Enter the access password").fill("e2e-test-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByPlaceholder("Message OPTIMUS…")).toBeVisible();

    // Already-signed-in visitors skip the form entirely.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/chat$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login\?next=%2Fchat$/);
  });

  test("a signed-in session survives across requests, not just the initial page load", async ({ page }) => {
    await signIn(page);
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      return res.status;
    });
    // Authenticated, so it clears the auth boundary — whatever happens next
    // (503 unavailable, since CI has no OmniRoute) is a DIFFERENT boundary.
    expect(status).not.toBe(401);
  });
});
