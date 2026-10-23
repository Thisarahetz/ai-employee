import { test, expect } from "@playwright/test";
import { OWNER_STATE, waitForSettled } from "./helpers";

test.use({ storageState: OWNER_STATE });

test.describe("Locations", () => {
  test("TC-LOC-01 add, rename and delete a location", async ({ page }) => {
    const name = `Kandy Branch ${Date.now()}`;
    await page.goto("/locations");
    await page.getByRole("button", { name: "+ Add location" }).click();
    await expect(page.getByRole("heading", { name: "Add location" })).toBeVisible();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Timezone").fill("Asia/Colombo");
    await page.getByRole("button", { name: "Add location", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name").fill(`${name} (edited)`);
    await page.getByRole("button", { name: "Save changes" }).click();
    const edited = page.getByRole("row").filter({ hasText: `${name} (edited)` });
    await expect(edited).toBeVisible();

    await edited.getByRole("button", { name: "Remove" }).click();
    await edited.getByRole("button", { name: "Confirm remove" }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  });

  test("TC-LOC-02 the add-location form closes with Escape and Cancel", async ({ page }) => {
    await page.goto("/locations");
    await page.getByRole("button", { name: "+ Add location" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Add location" })).toHaveCount(0);
    await page.getByRole("button", { name: "+ Add location" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Add location" })).toHaveCount(0);
  });
});

test.describe("Team", () => {
  test("TC-TEAM-01 invite a staff member and see them in the list", async ({ page }) => {
    const email = `e2e-staff-${Date.now()}@ai-employee.test`;
    await page.goto("/team");
    await page.getByRole("button", { name: "Add Team Member" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    // Step 1 refuses to continue without the required details.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("First name, last name, and email are required.")).toBeVisible();
    await page.getByLabel("First Name").fill("Kasun");
    await page.getByLabel("Last Name").fill("Silva");
    await page.getByLabel("Email Address").fill(email);
    for (const step of [2, 3, 4]) {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(`Step ${step} of 4`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Add Team Member" }).last().click();
    await expect(page.getByText("One-Time Login Credentials")).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await page.getByRole("button", { name: "Done & Return to Team" }).click();
    await waitForSettled(page);
    await expect(page.getByText("Kasun Silva").first()).toBeVisible();
  });
});

const businessName = (page: import("@playwright/test").Page) =>
  page.locator("label", { hasText: "Company / Business Name" }).locator("xpath=following-sibling::input[1]");

test.describe("Team colours", () => {
  test("TC-TEAM-02 the selected filter button is readable (not white on white)", async ({ page }) => {
    await page.goto("/team");
    const all = page.getByRole("button", { name: "All", exact: true });
    await expect(all).toBeVisible();
    const bg = await all.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("Settings", () => {
  test("TC-SET-01 business name change is saved", async ({ page }) => {
    await page.goto("/settings");
    await businessName(page).fill("E2E Test Salon Renamed");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await expect(page.getByText("Changes Saved!")).toBeVisible();
    await page.reload();
    await expect(businessName(page)).toHaveValue("E2E Test Salon Renamed");
    // Put it back so other tests see the expected name.
    await businessName(page).fill("E2E Test Salon");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await expect(page.getByText("Changes Saved!")).toBeVisible();
  });
});

test.describe("Settings (top bar)", () => {
  test("TC-SET-02 the top bar shows the new business name after a rename", async ({ page }) => {
    await page.goto("/settings");
    await businessName(page).fill("E2E Test Salon Renamed");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await expect(page.getByText("Changes Saved!")).toBeVisible();
    try {
      await page.reload();
      await expect(page.locator("header")).toContainText("E2E Test Salon Renamed", { timeout: 5_000 });
    } finally {
      await businessName(page).fill("E2E Test Salon");
      await page.getByRole("button", { name: "Save Profile" }).click();
      await expect(page.getByText("Changes Saved!")).toBeVisible();
    }
  });
});

test.describe("Sinhala dashboard", () => {
  test("TC-I18N-01 switching to Sinhala translates the menu and survives a reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("combobox", { name: "Dashboard language" }).selectOption("si");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "සැකසුම්" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ඉවත් වන්න" })).toBeVisible();
    await page.reload();
    await expect(sidebar.getByRole("link", { name: "සැකසුම්" })).toBeVisible();
    // Back to English.
    await page.getByRole("combobox").filter({ has: page.locator('option[value="si"]') }).first().selectOption("en");
    await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  });
});

test.describe("Command Center", () => {
  test("TC-CC-01 suggested prompts and the message box are shown", async ({ page }) => {
    await page.goto("/command-center");
    await expect(page.getByText("What should your team work on?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Team status report" })).toBeVisible();
    await expect(page.getByPlaceholder(/Ask sales to find new leads/)).toBeVisible();
  });

  test("TC-CC-02 the message box is fully on screen on a 1440x900 laptop", async ({ page }) => {
    await page.goto("/command-center");
    await waitForSettled(page);
    const box = await page.getByPlaceholder(/Ask sales to find new leads/).boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });

  test("TC-CC-03 the message box is not covered by the floating Setup button", async ({ page }) => {
    await page.goto("/command-center");
    await waitForSettled(page);
    await page.getByPlaceholder(/Ask sales to find new leads/).scrollIntoViewIfNeeded();
    const input = page.getByPlaceholder(/Ask sales to find new leads/);
    const box = (await input.boundingBox())!;
    // The element at the right end of the message box must belong to the box, not the Setup button.
    const covered = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("button")?.textContent?.includes("Setup"),
      { x: box.x + box.width - 60, y: box.y + 4 });
    expect(covered).toBe(false);
  });
});

test.describe("Dashboard", () => {
  test("TC-DASH-01 a new business sees the getting-started checklist", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Getting started")).toBeVisible();
    await expect(page.getByText(/0 of \d+ essential steps done/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open the setup wizard/ })).toBeVisible();
  });

  test("TC-DASH-02 status card does not claim AI staff are working when none exist", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("No AI Employees Deployed Yet")).toBeVisible();
    await expect(page.getByText(/autonomously handling inquiries/)).toHaveCount(0);
    await expect(page.getByText("No AI employees yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open setup wizard" })).toHaveAttribute("href", "/onboarding");
  });

  test("TC-DASH-03 quick actions go to the right pages", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Store & Branch Locations/ }).click();
    await expect(page).toHaveURL(/\/locations$/);
  });
});
