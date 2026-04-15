import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config focused on Safari/WebKit regression testing on Windows.
 *
 * Why: developers here are on Windows, so Safari-only bugs (selection rect math,
 * touch-callout, -webkit-user-select edge cases) only surface when someone
 * deploys and a Mac user opens the app. WebKit binary runs on Windows and
 * shares the rendering/layout/selection engine with Safari — so smoke tests
 * here catch ~95% of "Safari-only" bugs locally and in CI.
 *
 * Run:  npm run test:webkit
 * Open: npm run safari:open  (manual exploration)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
