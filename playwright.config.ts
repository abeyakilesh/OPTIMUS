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
      // Isolated from real local dev data — the mission/artifact store this
      // suite writes real files to, never the developer's actual history.
      OPTIMUS_DATA_DIR: ".optimus-data-e2e",
      // Port 9 is the discard port: nothing ever listens there, so the
      // "model layer unreachable" test fails the SAME way on a developer
      // laptop that happens to have OmniRoute running as it does in CI,
      // which has none. It used to pass only by accident of environment —
      // caught when this suite was run on a machine with a live OmniRoute.
      // Nothing here exercises a genuinely live model; that path is proven
      // by hand against a real instance, and honestly remains an e2e gap.
      OMNIROUTE_BASE_URL: "http://127.0.0.1:9",
    },
  },
});
