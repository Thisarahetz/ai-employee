import { test, expect } from "@playwright/test";
import { ADMIN_STATE, OWNER_STATE, waitForSettled } from "./helpers";

// Runs in the "mobile" project (Pixel 7 size).

test("TC-MOB-01 login works on a phone", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("Owner on a phone", () => {
  test.use({ storageState: OWNER_STATE });

  for (const path of ["/dashboard", "/conversations", "/settings", "/team", "/command-center"]) {
    test(`TC-MOB-02 no sideways scrolling: ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForSettled(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("TC-MOB-03 the main menu opens on a phone and takes you to a page", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForSettled(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Main menu" });
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(menu).toHaveCount(0); // closes after choosing a page
  });

  test("TC-MOB-05 the phone menu closes with Escape, the X button and the backdrop", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForSettled(page);
    const open = page.getByRole("button", { name: "Open menu" });
    const menu = page.getByRole("dialog", { name: "Main menu" });
    await open.click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await open.click();
    await menu.getByRole("button", { name: "Close menu" }).click();
    await expect(menu).toHaveCount(0);
    await open.click();
    await page.mouse.click(380, 400); // right of the drawer
    await expect(menu).toHaveCount(0);
  });

  test("TC-MOB-06 the top bar fits on one line on a phone", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForSettled(page);
    const logout = await page.getByRole("button", { name: "Log out" }).boundingBox();
    expect(logout!.height).toBeLessThanOrEqual(40);
    const header = await page.locator("header").boundingBox();
    expect(header!.height).toBeLessThanOrEqual(64);
  });
});

test.describe("Admin on a phone", () => {
  test.use({ storageState: ADMIN_STATE });

  test("TC-MOB-04 the admin console menu works on a phone", async ({ page }) => {
    await page.goto("/admin");
    await waitForSettled(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Admin menu" });
    await menu.getByRole("link", { name: "Businesses" }).click();
    await expect(page).toHaveURL(/\/admin\/tenants$/);
  });
});
