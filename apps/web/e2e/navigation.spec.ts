import { test, expect } from "@playwright/test";
import { OWNER_STATE, waitForSettled, watchForProblems } from "./helpers";

test.use({ storageState: OWNER_STATE });

/** Sidebar label → page heading. Covers every page in the owner workspace. */
const PAGES = [
  { nav: "Dashboard", path: "/dashboard", h1: /Good (morning|afternoon|evening)/ },
  { nav: "AI Employees", path: "/ai-employees", h1: "AI Employee Center" },
  { nav: "Command Center", path: "/command-center", h1: "Command Center" },
  { nav: "Schedules & Limits", path: "/automation", h1: "Schedules & AI limits" },
  { nav: "Automations", path: "/automations", h1: "Automations" },
  { nav: "Business Setup", path: "/business-setup", h1: "Business setup" },
  { nav: "Integrations", path: "/integrations", h1: "Integrations" },
  { nav: "Conversations", path: "/conversations", h1: "Conversations" },
  { nav: "Business Info", path: "/knowledge-base", h1: "Business Information & Documents" },
  { nav: "Locations", path: "/locations", h1: "Locations" },
  { nav: "Team", path: "/team", h1: "Team Members" },
  { nav: "Channels", path: "/channels", h1: "Connect Customer Channels" },
  { nav: "Settings", path: "/settings", h1: "Business Settings" },
];

test("TC-NAV-01 every sidebar link opens its page with no errors", async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto("/dashboard");
  const sidebar = page.locator("aside");
  for (const p of PAGES) {
    const link = sidebar.getByRole("link", { name: new RegExp(`^${p.nav}`) });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${p.path}$`));
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(p.h1);
    // The current page is highlighted in the sidebar.
    await expect(link).toHaveClass(/bg-brand-50/);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

for (const path of ["/ai-configuration", "/workflows", "/onboarding"]) {
  test(`TC-NAV-02 page outside the sidebar loads: ${path}`, async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(path);
    await waitForSettled(page);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

for (const path of ["/ai-employees/does-not-exist", "/channels/does-not-exist", "/conversations/does-not-exist", "/workflows/does-not-exist"]) {
  test(`TC-NAV-03 unknown record shows a message, not a crash: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await waitForSettled(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("main")).not.toBeEmpty();
    expect(errors).toEqual([]);
  });
}

test("TC-NAV-04 every page loads in under 5 seconds", async ({ page }) => {
  for (const p of PAGES) {
    const start = Date.now();
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(Date.now() - start, `${p.path} was slow`).toBeLessThan(5_000);
  }
});

test("TC-NAV-05 the top bar shows the business and signed-in user", async ({ page }) => {
  await page.goto("/dashboard");
  const header = page.locator("header");
  await expect(header).toContainText("E2E Test Salon");
  await expect(header).toContainText("e2e-owner@ai-employee.test");
});

test("TC-NAV-06 notifications panel opens and closes", async ({ page }) => {
  await page.goto("/dashboard");
  const bell = page.getByRole("button", { name: "Notifications" });
  await bell.click();
  await expect(page.locator("header").getByText(/No notifications|Mark read|Fix it/).first()).toBeVisible();
  await bell.click();
  await expect(page.locator("header").getByText("No notifications")).toHaveCount(0);
});
