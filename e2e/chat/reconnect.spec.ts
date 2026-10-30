import { expect, test } from "@playwright/test";

import { assistantMessages, newChat, openChat, send, snapshot, textOf, toolParts, waitForIdle } from "./helpers";

// PLAN 6.6 scenarios 1, 2 and 4: the turn survives the tab, a refresh and a
// network drop, and the client re-attaches without duplicates.

test("1. close the tab mid tool run, reopen after 20 s: full reply, final tool card, no duplicates", async ({
  browser,
  request,
}) => {
  const chatId = await newChat(request);
  const context = await browser.newContext();
  const page = await context.newPage();
  await openChat(page, chatId);
  await send(page, "Call slow_count with to set to 10. After it finishes, reply with exactly the word: finished");
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toBeVisible();
  await context.close();

  await new Promise((resolve) => setTimeout(resolve, 20_000));

  const reopened = await browser.newPage();
  await openChat(reopened, chatId);
  const chat = await waitForIdle(request, chatId);
  expect(chat.status).toBe("idle");
  const replies = assistantMessages(chat);
  expect(replies).toHaveLength(1);
  expect(toolParts(replies[0]!, "slow_count")).toHaveLength(1);
  expect(textOf(replies[0]!).toLowerCase()).toContain("finished");

  const cards = reopened.locator('[data-testid="tool-card"][data-tool="slow_count"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-state", "output-available");
  await expect(cards.first()).toHaveAttribute("data-preliminary", "false");
  await expect(reopened.getByTestId("assistant-message")).toHaveCount(1);
  await expect(reopened.getByTestId("assistant-text").last()).toContainText(/finished/i);
});

test("2. refresh mid-stream: the stream continues with no duplicate text", async ({ page, request }) => {
  const chatId = await newChat(request);
  await openChat(page, chatId);
  await send(
    page,
    "Call slow_count with to set to 3. Then write the numbers from one to sixty as English words, separated by commas, and nothing else.",
  );
  // Refresh once while the tool runs and once while the text streams.
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("chat-column")).toBeVisible();
  await expect
    .poll(async () => (await page.getByTestId("assistant-text").allInnerTexts()).join("").length, { timeout: 90_000 })
    .toBeGreaterThan(30);
  await page.reload();
  await expect(page.getByTestId("chat-column")).toBeVisible();

  const chat = await waitForIdle(request, chatId);
  const replies = assistantMessages(chat);
  expect(replies).toHaveLength(1);
  const saved = textOf(replies[0]!);
  expect(saved.match(/sixty/gi)?.length ?? 0).toBe(1);
  // The opening of the list appears once: a replay did not append it twice.
  expect(saved.match(/one,\s*two,\s*three/gi)?.length ?? 0).toBe(1);

  await expect(page.getByTestId("chat-column")).toHaveAttribute("data-busy", "false");
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toHaveCount(1);
  const shown = (await page.getByTestId("assistant-text").allInnerTexts()).join("");
  expect(shown.replace(/\s+/g, "")).toBe(saved.replace(/\s+/g, ""));
});

test("4. network drop of 10 s during a reply: resumes after reconnect", async ({ page, context, request }) => {
  const chatId = await newChat(request);
  await openChat(page, chatId);
  await send(page, "Call slow_count with to set to 10. After it finishes, reply with exactly the word: finished");
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toBeVisible();
  await context.setOffline(true);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  await context.setOffline(false);

  const chat = await waitForIdle(request, chatId);
  expect(textOf(assistantMessages(chat)[0]!).toLowerCase()).toContain("finished");
  await expect(page.getByTestId("assistant-text").last()).toContainText(/finished/i, { timeout: 30_000 });
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toHaveAttribute(
    "data-state",
    "output-available",
  );
  expect((await snapshot(request, chatId)).status).toBe("idle");
});
