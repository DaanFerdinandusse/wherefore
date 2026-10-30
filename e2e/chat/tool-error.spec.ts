import { expect, test } from "@playwright/test";

import { newChat, openChat, send, waitForIdle, waitForTurns } from "./helpers";

// PLAN 6.6 scenario 7: a failing tool renders an error card with Retry, and
// Retry re-sends the ask as a new turn.

test("7. a tool error renders Retry, and Retry starts the ask again", async ({ page, request }) => {
  const chatId = await newChat(request);
  await openChat(page, chatId);
  await send(
    page,
    "Call echo_places once with query natural wine and fail set to true. Do not call it again; just tell me in one sentence that it failed.",
  );

  const failedCard = page.locator('[data-testid="tool-card"][data-tool="echo_places"][data-state="output-error"]');
  await expect(failedCard.first()).toBeVisible({ timeout: 90_000 });
  await expect(failedCard.first().getByTestId("tool-error")).toContainText("The step did not finish");
  await waitForIdle(request, chatId);
  await expect(page.getByTestId("chat-column")).toHaveAttribute("data-busy", "false");

  const retry = failedCard.first().getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  await retry.click();

  // The ask goes out again as a new turn: a second user message and a second reply.
  await expect(page.getByTestId("user-message")).toHaveCount(2);
  const chat = await waitForTurns(request, chatId, 2);
  expect(chat.messages.filter((m) => m.role === "user")).toHaveLength(2);
  expect(chat.messages.filter((m) => m.role === "assistant")).toHaveLength(2);
  await expect(page.getByTestId("assistant-message")).toHaveCount(2);
});
