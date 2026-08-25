import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

/**
 * Settings → Model Providers.
 *
 * Two halves, deliberately:
 *
 *  - The REAL half runs against the actual server. CI has no provider keys
 *    and `playwright.config.ts` pins OmniRoute to the discard port, so this
 *    half exercises the fully-degraded state — which is exactly the state the
 *    spec requires to work ("must work even when OmniRoute is not running").
 *
 *  - The MOCKED half feeds the client refresh a fixed payload, so the
 *    connected-with-measured-limits rendering is asserted deterministically
 *    rather than depending on whoever runs the suite having live keys.
 *
 * The connected path against real providers is proven separately, by hand and
 * by the unit suite. That split is stated rather than papered over.
 */

const MEASURED = {
  observedAt: "2026-08-25T12:00:00.000Z",
  providers: [
    {
      id: "groq",
      name: "Groq",
      keyPresent: true,
      maskedKey: "gsk_••••••••••r763L",
      reachable: true,
      httpStatus: 200,
      modelCount: 13,
      models: ["groq/compound"],
      modelInfo: [],
      suggestedModel: "groq/compound",
      suggestedModelReason: "largest context window (131,072) among the 9 the provider marks as text-chat",
      rankedModels: ["groq/compound"],
      error: null,
      usageSource: "inference-headers",
      usageNote: null,
      latencyMs: 332,
    },
    {
      id: "gemini",
      name: "Gemini",
      keyPresent: true,
      maskedKey: "AQ.A••••••••••Zqa2w",
      reachable: true,
      httpStatus: 200,
      modelCount: 50,
      models: ["models/gemini-2.5-flash"],
      modelInfo: [],
      suggestedModel: "models/gemini-2.5-flash",
      suggestedModelReason: "largest context window (1,048,576)",
      rankedModels: ["models/gemini-2.5-flash"],
      error: null,
      usageSource: "none",
      usageNote: "Google returns no rate-limit headers on either the model list or a generateContent call.",
      latencyMs: 255,
    },
  ],
  omniroute: {
    reachable: false,
    baseUrl: "http://127.0.0.1:9",
    authenticated: false,
    modelCount: null,
    sampleModels: [],
    usage: null,
    usageNote: null,
    error: "no OmniRoute reachable at http://127.0.0.1:9 — provider status below is unaffected",
    latencyMs: 3,
  },
  missionCost: { meanTokens: 34, sampleSize: 4, note: "mean of 4 recorded missions on this machine." },
  pool: { measuredProviders: 1, unmeasuredProviders: 1, note: "Pool totals need per-provider limits." },
};

async function mockStatus(page: Page) {
  await page.route("**/api/providers/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...MEASURED }) });
  });
}

test.describe("settings · model providers", () => {
  test("is gated — an unauthenticated visitor never sees provider state", async ({ page, request }) => {
    await page.goto("/settings/providers");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fproviders$/);

    // And the route behind it is refused, not merely un-linked. It reads keys
    // from the environment and can spend quota; it is gated like /api/missions.
    const res = await request.get("/api/providers/status");
    expect(res.status()).toBe(401);
    const test = await request.post("/api/providers/test", { data: { id: "groq" } });
    expect(test.status()).toBe(401);
  });

  test("renders every provider even with OmniRoute down and no keys configured", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings/providers");

    await expect(page.getByRole("heading", { name: "Model providers" })).toBeVisible();
    for (const name of ["Groq", "Mistral", "Gemini"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    // The gateway being down is reported, and does not take the page with it.
    await expect(page.getByText(/no OmniRoute reachable|Not running/i).first()).toBeVisible();
  });

  test("refuses an unknown provider id — the test route is a closed set", async ({ page, request }) => {
    await signIn(page);
    const cookies = await page.context().cookies();
    const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.post("/api/providers/test", {
      data: { id: "https://evil.test/steal" },
      headers: { Cookie: header },
    });
    expect(res.status()).toBe(404);
  });

  test("draws a bar only from measured limits, and says so when there are none", async ({ page }) => {
    await signIn(page);
    await mockStatus(page);
    await page.goto("/settings/providers");
    await page.getByRole("button", { name: "Refresh" }).click();

    // Gemini publishes nothing — it must SAY so, and draw no meter.
    const gemini = page.locator("article", { hasText: "Gemini" });
    await expect(gemini.getByText("Usage not available from this provider.")).toBeVisible();

    // Groq is measurable but untested in this payload, so it must invite a
    // measurement rather than show a bar filled from tier documentation.
    const groq = page.locator("article", { hasText: "Groq" });
    await expect(groq.getByText(/only returned on an inference call/i)).toBeVisible();

    // No recommendation without measured data — and the reason is given.
    await expect(page.getByText(/No provider has measured limits yet/i)).toBeVisible();
  });

  test("shows a masked key and never an unmasked one", async ({ page }) => {
    await signIn(page);
    await mockStatus(page);
    await page.goto("/settings/providers");
    await page.getByRole("button", { name: "Refresh" }).click();

    await expect(page.getByText("gsk_••••••••••r763L")).toBeVisible();

    // Nothing on the page looks like a bare credential: no run of 20+ key-ish
    // characters outside the masked forms.
    const body = (await page.locator("body").innerText()).replace(/[•]/g, "");
    expect(body).not.toMatch(/\b(gsk|sk)_[A-Za-z0-9]{20,}\b/);
  });

  test("reports a failed refresh instead of leaving stale numbers looking live", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings/providers");
    await page.route("**/api/providers/status", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(/refresh failed/i)).toBeVisible();
  });
});
