import { expect, type Page, type ConsoleMessage } from "@playwright/test";

export const API_URL = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

/** Fixed test accounts, created in the test database by global.setup.ts. */
export const OWNER = {
  email: "e2e-owner@ai-employee.test",
  password: "E2eOwner@12345",
  firstName: "Esha",
  lastName: "Owner",
  business: "E2E Test Salon",
};
export const ADMIN = {
  email: "e2e-admin@ai-employee.test",
  password: "E2eAdmin@12345",
  firstName: "Ari",
  lastName: "Admin",
};

export const OWNER_STATE = "e2e/.auth/owner.json";
export const ADMIN_STATE = "e2e/.auth/admin.json";

/** Log in through the real login form. */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/**
 * Collects things a user would notice as "broken": uncaught page errors,
 * console errors and API calls that come back 5xx.
 */
export function watchForProblems(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Expected noise: 4xx responses already surfaced in the UI, React dev hints.
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    if (/Download the React DevTools/.test(text)) return;
    problems.push(`console error: ${text.slice(0, 300)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500 && res.url().startsWith(API_URL)) {
      problems.push(`API ${res.status()}: ${res.request().method()} ${res.url().replace(API_URL, "")}`);
    }
  });
  return problems;
}

/** Wait until loading spinners are gone so assertions see the real page. */
export async function waitForSettled(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
}
