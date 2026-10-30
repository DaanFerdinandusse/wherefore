import { expect, test } from "@playwright/test";

import { assistantMessages, newChat, openChat, send, textOf, waitForIdle, waitForTurns } from "./helpers";

// PLAN 6.6 scenarios 3 and 6: two tabs share one stream and one stop; a stop
// saves the partial reply and the next prompt is accepted.

test("3. two tabs see the same stream; stop in one stops both", async ({ browser, request }) => {
  const chatId = await newChat(request);
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await openChat(tabA, chatId);
  await openChat(tabB, chatId);

  await send(tabA, "Call slow_count with to set to 10. After it finishes, reply with exactly the word: finished");
  // Tab B attaches through its idle poll and shows the same running card.
  const cardIn = (tab: typeof tabA) => tab.locator('[data-testid="tool-card"][data-tool="slow_count"]');
  await expect(cardIn(tabA)).toBeVisible();
  await expect(cardIn(tabB)).toBeVisible({ timeout: 20_000 });
  await expect(tabB.getByTestId("chat-column")).toHaveAttribute("data-busy", "true");

  await tabB.getByTestId("stop-button").click();

  const chat = await waitForIdle(request, chatId, 30_000);
  expect(chat.status).toBe("idle");
  const reply = assistantMessages(chat)[0];
  expect(reply?.metadata?.stopped).toBe(true);
  expect(textOf(reply!).toLowerCase()).not.toContain("finished");

  for (const tab of [tabA, tabB]) {
    await expect(tab.getByTestId("chat-column")).toHaveAttribute("data-busy", "false", { timeout: 30_000 });
    await expect(tab.locator('[data-testid="assistant-message"][data-stopped="true"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(cardIn(tab)).toHaveAttribute("data-state", "output-error");
  }
  await context.close();
});

test("6. stop mid-stream saves the partial text, then the next prompt is accepted", async ({ page, request }) => {
  const chatId = await newChat(request);
  await openChat(page, chatId);
  await send(page, "Write a 500 word story about the trams of Lisbon. No tools, no headings.");
  await expect
    .poll(async () => (await page.getByTestId("assistant-text").allInnerTexts()).join("").length, { timeout: 90_000 })
    .toBeGreaterThan(60);
  await page.getByTestId("stop-button").click();

  const stopped = await waitForIdle(request, chatId, 30_000);
  expect(stopped.status).toBe("idle");
  const partial = assistantMessages(stopped)[0];
  expect(partial?.metadata?.stopped).toBe(true);
  const partialText = textOf(partial!);
  expect(partialText.length).toBeGreaterThan(30);
  // Far short of a 500 word story: the stop really cut it.
  expect(partialText.split(/\s+/).length).toBeLessThan(450);
  await expect(page.getByTestId("chat-column")).toHaveAttribute("data-busy", "false", { timeout: 30_000 });

  await send(page, "Reply with exactly the word: ok");
  const next = await waitForTurns(request, chatId, 2);
  const replies = assistantMessages(next);
  expect(replies).toHaveLength(2);
  expect(textOf(replies[1]!).toLowerCase()).toContain("ok");
  expect(textOf(replies[0]!)).toBe(partialText);
  await expect(page.getByTestId("assistant-message")).toHaveCount(2);
});
