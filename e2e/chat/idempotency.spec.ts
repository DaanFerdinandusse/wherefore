import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { assistantMessages, newChat, snapshot, waitForIdle } from "./helpers";

// PLAN 6.6 scenario 5: a double submit with the same turnId starts one run;
// a different turn while one is running gets 409 conflict:chat.

test("5. double submit with the same turnId starts one run", async ({ request }) => {
  const chatId = await newChat(request);
  const turnId = randomUUID();
  const body = {
    turnId,
    message: { id: `u-${turnId}`, role: "user", parts: [{ type: "text", text: "Call slow_count with to set to 3, then reply with the word: done" }] },
  };

  const [first, second] = await Promise.all([
    request.post(`/api/chats/${chatId}/messages`, { data: body }),
    request.post(`/api/chats/${chatId}/messages`, { data: body }),
  ]);
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  const runA = first.headers()["x-workflow-run-id"];
  expect(runA).toBeTruthy();
  expect(second.headers()["x-workflow-run-id"]).toBe(runA);

  const chat = await waitForIdle(request, chatId);
  expect(chat.messages.filter((m) => m.role === "user")).toHaveLength(1);
  expect(assistantMessages(chat)).toHaveLength(1);
});

test("5b. a different turn while one runs gets 409 conflict:chat", async ({ request }) => {
  const chatId = await newChat(request);
  const turnA = randomUUID();
  const running = request.post(`/api/chats/${chatId}/messages`, {
    data: {
      turnId: turnA,
      message: { id: `u-${turnA}`, role: "user", parts: [{ type: "text", text: "Call slow_count with to set to 5, then reply: done" }] },
    },
  });
  await expect.poll(async () => (await snapshot(request, chatId)).status, { timeout: 10_000 }).toBe("running");

  const turnB = randomUUID();
  const conflict = await request.post(`/api/chats/${chatId}/messages`, {
    data: { turnId: turnB, message: { id: `u-${turnB}`, role: "user", parts: [{ type: "text", text: "Another question" }] } },
  });
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: "conflict:chat" });
  await running;
  const chat = await waitForIdle(request, chatId);
  expect(chat.messages.filter((m) => m.role === "user")).toHaveLength(1);
});
