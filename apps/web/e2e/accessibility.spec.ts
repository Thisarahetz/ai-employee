import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_STATE, OWNER_STATE, waitForSettled } from "./helpers";

/**
 * Blocks only the worst problems (things screen-reader users cannot use at
 * all). Colour contrast is reported in the audit, not enforced here yet.
 */
async function contrastIssues(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")));
}

async function criticalIssues(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze();
  return r.violations.filter((v) => v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("TC-A11Y-01 login and signup have no critical accessibility issues", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    expect(await criticalIssues(page), path).toEqual([]);
  }
});

test.describe("Workspace", () => {
  test.use({ storageState: OWNER_STATE });

  for (const path of ["/dashboard", "/command-center", "/conversations", "/locations", "/team", "/channels", "/knowledge-base", "/integrations"]) {
    test(`TC-A11Y-02 no critical accessibility issues: ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForSettled(page);
      expect(await criticalIssues(page)).toEqual([]);
    });
  }

  for (const path of ["/settings", "/ai-employees"]) {
    test(`TC-A11Y-03 every dropdown and field has a label: ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForSettled(page);
      expect(await criticalIssues(page)).toEqual([]);
    });
  }

  test("TC-A11Y-04 pop-up windows are announced as dialogs and the close button has a name", async ({ page }) => {
    await page.goto("/locations");
    await page.getByRole("button", { name: "+ Add location" }).click();
    await expect(page.getByRole("dialog", { name: "Add location" })).toBeVisible();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
  });

  test("TC-A11Y-05 keyboard users can reach the main menu with Tab", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForSettled(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.closest("aside, header") ? true : false);
    expect(focused).toBe(true);
  });
});

test.describe("Admin console", () => {
  test.use({ storageState: ADMIN_STATE });
  for (const path of ["/admin", "/admin/tenants", "/admin/ai-employees", "/admin/usage", "/admin/audit"]) {
    test(`TC-A11Y-06 no critical accessibility issues: ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForSettled(page);
      expect(await criticalIssues(page)).toEqual([]);
    });
  }
});

test.describe("Text contrast", () => {
  test.use({ storageState: OWNER_STATE });
  for (const path of ["/dashboard", "/team", "/settings", "/ai-employees", "/conversations"]) {
    test(`TC-A11Y-07 all text is readable (WCAG AA contrast): ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForSettled(page);
      expect(await contrastIssues(page)).toEqual([]);
    });
  }
});
