/**
 * UI/UX audit crawl (not part of the normal run). Screenshots every page at
 * desktop and phone width and writes errors + accessibility issues to
 * e2e-results/audit.json.   UI_AUDIT=1 npx playwright test audit
 */
import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { ADMIN_STATE, OWNER_STATE, waitForSettled, watchForProblems } from "./helpers";

test.skip(!process.env.UI_AUDIT, "set UI_AUDIT=1 to run the screenshot audit");

const OWNER_PAGES = ["/dashboard", "/onboarding", "/ai-employees", "/command-center", "/automation", "/automations",
  "/business-setup", "/integrations", "/conversations", "/knowledge-base", "/locations", "/team", "/channels",
  "/settings", "/ai-configuration", "/workflows"];
const ADMIN_PAGES = ["/admin", "/admin/tenants", "/admin/users", "/admin/ai-employees", "/admin/ai-templates",
  "/admin/business-types", "/admin/plans", "/admin/usage", "/admin/health", "/admin/audit", "/admin/settings"];

const results: Record<string, unknown>[] = [];

for (const [who, state, pages] of [["owner", OWNER_STATE, OWNER_PAGES], ["admin", ADMIN_STATE, ADMIN_PAGES]] as const) {
  for (const width of [1440, 390]) {
    test(`${who} @ ${width}px`, async ({ browser }) => {
      test.setTimeout(600_000);
      const ctx = await browser.newContext({ storageState: state, viewport: { width, height: width > 500 ? 900 : 844 } });
      const page = await ctx.newPage();
      for (const path of pages) {
        const problems = watchForProblems(page);
        const t0 = Date.now();
        await page.goto(path);
        await waitForSettled(page);
        const ms = Date.now() - t0;
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const h1 = await page.locator("h1").first().textContent().catch(() => null);
        const axe = width > 500 ? await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze() : null;
        const name = `${who}-${width}${path.replace(/\//g, "_")}`;
        await page.screenshot({ path: `e2e-results/audit/${name}.png`, fullPage: true });
        results.push({
          who, width, path, url: page.url(), h1, ms, overflowX, problems: [...problems],
          a11y: axe?.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, sample: v.nodes.slice(0, 8).map((n) => n.target.join(" ")) })),
        });
        page.removeAllListeners();
      }
      await ctx.close();
      fs.mkdirSync("e2e-results", { recursive: true });
      fs.writeFileSync(`e2e-results/audit-${who}-${width}.json`, JSON.stringify(results.filter((r) => r.who === who && r.width === width), null, 2));
    });
  }
}
