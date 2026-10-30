import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { assistantMessages, newChat, openChat, send, snapshot, textOf, waitForIdle, waitForTurns } from "./helpers";

// Runtime review fixes: a turnId stays idempotent after its turn finished,
// and a reconnect is bound to the run it was reading.

const prompt = (turnId: string, text: string) => ({
  turnId,
  message: { id: `u-${turnId}`, role: "user", parts: [{ type: "text", text }] },
});

test("8. a duplicate turnId after completion returns the same answer and starts no second run", async ({ request }) => {
  const chatId = await newChat(request);
  const turnId = randomUUID();
  const body = prompt(turnId, "Reply with exactly the word: pineapple");

  const first = await request.post(`/api/chats/${chatId}/messages`, { data: body });
  expect(first.status()).toBe(200);
  const runId = first.headers()["x-workflow-run-id"];
  expect(runId).toBeTruthy();
  await first.text();
  const done = await waitForIdle(request, chatId);
  const answer = assistantMessages(done)[0];
  expect(textOf(answer!).toLowerCase()).toContain("pineapple");

  const again = await request.post(`/api/chats/${chatId}/messages`, { data: body });
  expect(again.status()).toBe(200);
  expect(again.headers()["x-chat-turn"]).toBe("replay");
  expect(again.headers()["x-chat-turn-status"]).toBe("completed");
  // The recorded run, never a new one.
  expect(again.headers()["x-workflow-run-id"]).toBe(runId);
  expect((await again.text()).toLowerCase()).toContain("pineapple");

  const after = await snapshot(request, chatId);
  expect(after.status).toBe("idle");
  expect(after.activeRunId).toBeUndefined();
  expect(after.messages.filter((m) => m.role === "user")).toHaveLength(1);
  expect(assistantMessages(after)).toHaveLength(1);
  expect(textOf(assistantMessages(after)[0]!)).toBe(textOf(answer!));
});

test("9. a reconnect after another tab started a new turn resets cleanly", async ({ page, context, request }) => {
  const chatId = await newChat(request);
  await openChat(page, chatId);
  await send(page, "Call slow_count with to set to 3. After it finishes, reply with exactly the word: alpha");
  await expect(page.locator('[data-testid="tool-card"][data-tool="slow_count"]')).toBeVisible();
  const runA = (await snapshot(request, chatId)).activeRunId;
  expect(runA).toBeTruthy();

  // This tab drops off mid-turn A; turn A ends, and "another tab" starts turn B.
  await context.setOffline(true);
  await waitForIdle(request, chatId);
  const turnB = randomUUID();
  const running = request.post(`/api/chats/${chatId}/messages`, {
    data: prompt(turnB, "Call slow_count with to set to 5. After it finishes, reply with exactly the word: bravo"),
  });
  await expect.poll(async () => (await snapshot(request, chatId)).status, { timeout: 20_000 }).toBe("running");
  const runB = (await snapshot(request, chatId)).activeRunId;
  expect(runB).toBeTruthy();
  expect(runB).not.toBe(runA);

  // A reconnect bound to run A, with run A's cursor, is told to reset.
  const stale = await request.get(`/api/chats/${chatId}/stream?startIndex=40`, { headers: { "x-chat-run-id": runA! } });
  expect(stale.status()).toBe(205);
  expect(stale.headers()["x-chat-stream"]).toBe("reset");
  expect(stale.headers()["x-chat-active-run-id"]).toBe(runB);

  // Back online: the tab re-syncs to the server transcript and follows turn B from chunk 0.
  await context.setOffline(false);
  const bound = await request.get(`/api/chats/${chatId}/stream?startIndex=0&runId=${runB}`);
  expect(bound.status()).toBe(200);
  expect(bound.headers()["x-workflow-run-id"]).toBe(runB);
  expect(await bound.text()).toContain('"type":"finish"');
  await running;
  const chat = await waitForTurns(request, chatId, 2);
  const replies = assistantMessages(chat);
  expect(replies).toHaveLength(2);
  expect(textOf(replies[0]!).toLowerCase()).toContain("alpha");
  expect(textOf(replies[1]!).toLowerCase()).toContain("bravo");

  await expect(page.getByTestId("assistant-message")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId("user-message")).toHaveCount(2);
  await expect(page.getByTestId("chat-column")).toHaveAttribute("data-busy", "false", { timeout: 60_000 });
  const shown = (await page.getByTestId("assistant-text").allInnerTexts()).join(" ").toLowerCase();
  expect(shown.match(/alpha/g)?.length ?? 0).toBe(1);
  expect(shown.match(/bravo/g)?.length ?? 0).toBe(1);
});
