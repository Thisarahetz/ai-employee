import { test, expect } from "@playwright/test";
import { ADMIN_STATE, OWNER_STATE, waitForSettled, watchForProblems } from "./helpers";

const ADMIN_PAGES = [
  ["/admin", "Platform Dashboard"],
  ["/admin/tenants", "Businesses / Tenants"],
  ["/admin/users", "Platform users"],
  ["/admin/ai-employees", "Platform AI Employees"],
  ["/admin/ai-templates", "AI Template Registry"],
  ["/admin/business-types", "Supported Business Types"],
  ["/admin/plans", "Subscriptions & Plans"],
  ["/admin/usage", "Platform Usage & Analytics"],
  ["/admin/health", "System Health & Diagnostics"],
  ["/admin/audit", "Platform Audit Logs"],
  ["/admin/settings", "Platform settings"],
] as const;

test.describe("Platform admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("TC-ADM-01 every admin console page loads with no errors", async ({ page }) => {
    const problems = watchForProblems(page);
    for (const [path, h1] of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(h1);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("TC-ADM-02 tenants list shows the test businesses and search filters it", async ({ page }) => {
    await page.goto("/admin/tenants");
    await waitForSettled(page);
    await expect(page.getByText("E2E Test Salon").first()).toBeVisible();
    await page.getByPlaceholder(/Search business/).fill("Admin Workspace");
    await expect(page.getByText("E2E Test Salon")).toHaveCount(0);
    await expect(page.getByText("E2E Admin Workspace").first()).toBeVisible();
  });

  test("TC-ADM-03 opening a tenant shows its detail page", async ({ page }) => {
    await page.goto("/admin/tenants");
    await waitForSettled(page);
    await page.getByText("E2E Test Salon").first().click();
    await expect(page).toHaveURL(/\/admin\/tenants\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Test Salon");
  });

  test("TC-ADM-04 admin who owns a business can switch to their workspace", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Platform Console/ }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe("Access control", () => {
  test.use({ storageState: OWNER_STATE });

  test("TC-ADM-05 a business owner cannot open the admin console", async ({ page }) => {
    await page.goto("/admin/tenants");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("aside").getByRole("link", { name: /Platform Console/ })).toHaveCount(0);
  });
});
