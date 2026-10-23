import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STATE, API_URL, OWNER_STATE, testDb, waitForSettled } from "./helpers";

/**
 * Saved answers and reply modes, end to end: the owner writes answers, a
 * customer chats on the website widget, and replies come without AI.
 * (The test API has a fake AI key, so anything that reached the AI would fail.)
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_STATE });

async function addAnswer(page: Page, questions: string[], answers: { en?: string; si?: string; singlish?: string }) {
  await page.goto("/saved-answers");
  await page.getByRole("button", { name: "+ Add saved answer" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add saved answer" });
  await dialog.getByLabel("Ways customers ask (one per line)").fill(questions.join("\n"));
  if (answers.en) await dialog.getByLabel("Answer in English").fill(answers.en);
  if (answers.si) await dialog.getByLabel("Answer in Sinhala").fill(answers.si);
  if (answers.singlish) await dialog.getByLabel("Answer in Singlish").fill(answers.singlish);
  await dialog.getByRole("button", { name: "Save answer" }).click();
  await expect(dialog).toHaveCount(0);
}

/** A website-chat channel for the owner's business, created straight in the test database. */
async function websiteChannel(): Promise<string> {
  const db = testDb();
  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "e2e-test-salon" } });
    const existing = await db.channel.findFirst({ where: { tenantId: tenant.id, name: "E2E Website" } });
    if (existing) return existing.id;
    const ch = await db.channel.create({
      data: { tenantId: tenant.id, type: "WEBSITE_CHAT", name: "E2E Website", status: "ACTIVE", config: {} },
    });
    return ch.id;
  } finally {
    await db.$disconnect();
  }
}

async function conversationIdFor(sessionId: string): Promise<string> {
  const db = testDb();
  try {
    const c = await db.conversation.findFirstOrThrow({ where: { customer: { externalId: sessionId } } });
    return c.id;
  } finally {
    await db.$disconnect();
  }
}

/** A customer message through the public widget API; returns the reply text. */
async function customerSays(page: Page, channelId: string, sessionId: string, message: string): Promise<string> {
  const post = await page.request.post(`${API_URL}/channels/website-chat/${channelId}/messages`, { data: { sessionId, message } });
  expect(post.ok(), await post.text()).toBeTruthy();
  let reply = "";
  await expect
    .poll(async () => {
      const res = await page.request.get(`${API_URL}/channels/website-chat/${channelId}/messages`, { params: { sessionId } });
      const body = await res.json();
      const msgs = (body.messages ?? []) as { sender: string; content: string }[];
      const last = msgs[msgs.length - 1];
      reply = last && last.sender !== "CUSTOMER" ? last.content : "";
      return reply;
    }, { timeout: 15_000 })
    .not.toBe("");
  return reply;
}

test("TC-SA-01 add a saved answer and try it with a misspelt Singlish question", async ({ page }) => {
  await addAnswer(page, ["What are your opening hours?", "kiyatada open karanne"], {
    en: "We are open 9am to 7pm, Monday to Saturday.",
    singlish: "Api ude 9 idan ra 7 wenakan open.",
  });
  const card = page.getByTestId("saved-answer").filter({ hasText: "What are your opening hours?" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Not written — the closest other language is used"); // no Sinhala yet

  await page.getByLabel("Try a customer question").fill("kiyatada open krnne?");
  await page.getByRole("combobox", { name: "Customer language" }).selectOption("si-Latn");
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await expect(page.getByTestId("try-result")).toContainText("Customer gets this saved answer");
  await expect(page.getByTestId("try-result")).toContainText("Api ude 9 idan ra 7 wenakan open.");
});

test("TC-SA-02 the form refuses an answer with no text", async ({ page }) => {
  await page.goto("/saved-answers");
  await page.getByRole("button", { name: "+ Add saved answer" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add saved answer" });
  await dialog.getByLabel("Ways customers ask (one per line)").fill("Do you have parking?");
  await dialog.getByRole("button", { name: "Save answer" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Write the answer in at least one language.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("TC-SA-03 edit, turn off, turn on and delete a saved answer", async ({ page }) => {
  await addAnswer(page, ["Do you have parking?"], { en: "Yes, behind the salon." });
  let card = page.getByTestId("saved-answer").filter({ hasText: "Do you have parking?" });
  await card.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit saved answer" });
  await dialog.getByLabel("Answer in English").fill("Yes, free parking behind the salon.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(card).toContainText("Yes, free parking behind the salon.");

  await card.getByRole("button", { name: "Turn off" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("tab", { name: "Turned off" }).click();
  card = page.getByTestId("saved-answer").filter({ hasText: "Do you have parking?" });
  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(card).toHaveCount(0);

  await page.getByRole("tab", { name: "Answers" }).click();
  card = page.getByTestId("saved-answer").filter({ hasText: "Do you have parking?" });
  await card.getByRole("button", { name: "Delete" }).click();
  await card.getByRole("button", { name: "Confirm delete" }).click();
  await expect(card).toHaveCount(0);
});

test("TC-SA-04 a customer gets the saved answer instantly, labelled in the conversation", async ({ page }) => {
  const channelId = await websiteChannel();
  const session = `e2e-${Date.now()}`;
  const reply = await customerSays(page, channelId, session, "what r ur opening hours");
  expect(reply).toBe("We are open 9am to 7pm, Monday to Saturday.");

  await page.goto(`/conversations/${await conversationIdFor(session)}`);
  await expect(page.getByText("We are open 9am to 7pm, Monday to Saturday.")).toBeVisible();
  await expect(page.getByText("AI (Saved answer)")).toBeVisible();
});

test("TC-SA-05 No-AI mode: unknown question goes to staff and shows up as a question to answer", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: /No AI/ }).check();
  await page.getByRole("button", { name: "Save reply mode" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  const channelId = await websiteChannel();
  const reply = await customerSays(page, channelId, `e2e-${Date.now()}`, "Do you do bridal makeup packages?");
  expect(reply).toMatch(/team will reply/);

  await page.goto("/saved-answers");
  await expect(page.locator("aside").getByRole("link", { name: /Saved Answers/ })).toContainText("1");
  await page.getByRole("tab", { name: /Questions to answer/ }).click();
  const q = page.getByTestId("saved-answer").filter({ hasText: "Do you do bridal makeup packages?" });
  await expect(q).toContainText("Asked 1×");
  await q.getByRole("button", { name: "Write answer" }).click();
  const dialog = page.getByRole("dialog", { name: "Answer this question" });
  await dialog.getByLabel("Answer in English").fill("Yes! Bridal packages start at Rs. 25,000.");
  await dialog.getByRole("button", { name: "Save answer" }).click();
  await expect(q).toHaveCount(0);

  const second = await customerSays(page, channelId, `e2e-${Date.now()}`, "do you do bridal make up packages");
  expect(second).toBe("Yes! Bridal packages start at Rs. 25,000.");
});

test("TC-SA-06 save a staff reply from a conversation as a new saved answer", async ({ page }) => {
  const channelId = await websiteChannel();
  const session = `e2e-${Date.now()}`;
  await customerSays(page, channelId, session, "Can I pay by card?");
  await page.goto(`/conversations/${await conversationIdFor(session)}`);
  // The "team will reply" notice is a system message: it can't be saved as an answer.
  await expect(page.getByRole("button", { name: "Save as answer" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Reply to customer" }).fill("Yes, we accept Visa and Mastercard.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Yes, we accept Visa and Mastercard.")).toBeVisible();
  await page.getByRole("button", { name: "Save as answer" }).click();
  const dialog = page.getByRole("dialog", { name: "Add saved answer" });
  await expect(dialog.getByLabel("Ways customers ask (one per line)")).toHaveValue("Can I pay by card?");
  await expect(dialog.getByLabel("Answer in English")).toHaveValue("Yes, we accept Visa and Mastercard.");
  await dialog.getByRole("button", { name: "Save answer" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/saved-answers");
  await expect(page.getByTestId("saved-answer").filter({ hasText: "Can I pay by card?" })).toBeVisible();
});

test("TC-SA-07 dashboard shows how many replies needed no AI", async ({ page }) => {
  await page.goto("/dashboard");
  await waitForSettled(page);
  const tile = page.getByTestId("without-ai-tile");
  await expect(tile).toContainText("Answered without AI");
  await expect(tile).not.toContainText("—");
  await expect(tile).toContainText(/\d+%/);
});

test("TC-SA-08 the plan decides which reply modes an owner can pick", async ({ browser, page }) => {
  // Platform admin removes "AI only" from the Free plan.
  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminCtx.newPage();
  await admin.goto("/admin/plans");
  const free = admin.locator("fieldset").first();
  await expect(free.getByLabel("AI only")).toBeChecked();
  await free.getByLabel("AI only").uncheck();
  await expect(free.getByLabel("AI only")).not.toBeChecked();

  try {
    await page.goto("/settings");
    const aiOnly = page.getByRole("radio", { name: /AI only/ });
    await expect(aiOnly).toBeDisabled();
    await expect(page.locator("#reply-mode")).toContainText("Not included in your plan");
  } finally {
    await free.getByLabel("AI only").check();
    await expect(free.getByLabel("AI only")).toBeChecked();
    await adminCtx.close();
  }

  // Back to Hybrid for later runs.
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Hybrid/ }).check();
  await page.getByRole("button", { name: "Save reply mode" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
});
