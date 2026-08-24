import type { Page } from "@playwright/test";

/**
 * Signs in via a real fetch() executed INSIDE the page, not Playwright's
 * raw APIRequestContext (page.request). The login cookie is Secure in
 * production (deliberately — real security, not a local-dev toggle left
 * on), and Chromium's APIRequestContext doesn't apply the same
 * localhost-is-a-secure-context exception a real page's cookie jar does —
 * discovered when a first draft of this helper silently failed to
 * authenticate anything. Going through page.evaluate(fetch) makes this
 * indistinguishable from what an actual browser does.
 */
export async function signIn(page: Page, password = "e2e-test-password") {
  // fetch() inside page.evaluate needs a same-origin document to run from.
  await page.goto("/");
  const ok = await page.evaluate(async (pw) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    return res.ok;
  }, password);
  if (!ok) throw new Error("test helper signIn failed — see /api/auth/login response");
}
