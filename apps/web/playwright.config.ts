import { defineConfig, devices } from "@playwright/test";

/**
 * Browser (UI/UX) tests. Runs a separate API + web app against the isolated
 * test database (ai_employee_test), so your dev data is never touched.
 *
 *   pnpm --filter @ai-employee/web test:e2e
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "./e2e/start-test-api.sh",
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      url: `${WEB_URL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
