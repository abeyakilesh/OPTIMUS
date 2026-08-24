import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // CI builds first, then serves the production output — the same artifact
  // the perf gate measures.
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Test-only credentials so the /chat auth gate (proxy.ts) has something
    // real to check against in CI. Not a production secret — never reused
    // outside this local/CI e2e run.
    env: {
      OPTIMUS_PASSWORD: "e2e-test-password",
      OPTIMUS_SESSION_SECRET: "e2e-test-session-secret-do-not-reuse",
    },
  },
});
