import { test, expect } from "@playwright/test";
import { OWNER, loginViaUi } from "./helpers";

test.describe("Login", () => {
  test("TC-AUTH-01 login page shows the form and a link to sign up", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  });

  test("TC-AUTH-02 empty form shows a clear error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("Email and password are required.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("TC-AUTH-03 wrong password is rejected and stays on login", async ({ page }) => {
    await loginViaUi(page, OWNER.email, "wrong-password-123");
    await expect(page.locator("form [role=alert]")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("TC-AUTH-04 correct login opens the dashboard", async ({ page }) => {
    await loginViaUi(page, OWNER.email, OWNER.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(OWNER.firstName);
  });

  test("TC-AUTH-05 Enter key submits the login form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByLabel("Password").press("Enter");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("Sign up", () => {
  test("TC-AUTH-06 missing fields and short password are caught before sending", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("Please fill in your name, email, and password.");

    await page.getByLabel("Full Name").fill("Test Person");
    await page.getByLabel("Email Address").fill("short@ai-employee.test");
    await page.getByLabel("Password").fill("123");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.locator("form [role=alert]")).toHaveText("Password must be at least 8 characters.");
  });

  test("TC-AUTH-07 new account is created and lands on onboarding", async ({ page }) => {
    const email = `e2e-signup-${Date.now()}@ai-employee.test`;
    await page.goto("/signup");
    // Unique first name: see TC-AUTH-11 for what happens with a repeated one.
    await page.getByLabel("Full Name").fill(`Nimal${Date.now()} Perera`);
    await page.getByLabel("Email Address").fill(email);
    await page.getByLabel("Password").fill("Signup@12345");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText(email)).toBeVisible();
  });

  test("TC-AUTH-08 signing up with an existing email shows an error", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Name").fill("Dup User");
    await page.getByLabel("Email Address").fill(OWNER.email);
    await page.getByLabel("Password").fill("Signup@12345");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });
});

test("TC-AUTH-11 two people with the same first name can both sign up", async ({ page }) => {
  for (const n of [1, 2]) {
    await page.goto("/signup");
    await page.getByLabel("Full Name").fill(`Amal Fernando`);
    await page.getByLabel("Email Address").fill(`e2e-amal-${Date.now()}-${n}@ai-employee.test`);
    await page.getByLabel("Password").fill("Signup@12345");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.evaluate(() => localStorage.clear());
  }
});

test("TC-AUTH-12 a name written in Sinhala can sign up", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full Name").fill("නිමල් පෙරේරා");
  await page.getByLabel("Email Address").fill(`e2e-si-${Date.now()}@ai-employee.test`);
  await page.getByLabel("Password").fill("Signup@12345");
  await page.getByRole("button", { name: /Create Account/ }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test.describe("Session", () => {
  test("TC-AUTH-09 protected pages send logged-out visitors to login", async ({ page }) => {
    for (const path of ["/", "/dashboard", "/settings", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("TC-AUTH-10 log out ends the session", async ({ page }) => {
    // Fresh login so logging out never revokes the shared saved session.
    await loginViaUi(page, OWNER.email, OWNER.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
