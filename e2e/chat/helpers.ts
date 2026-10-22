import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

// Shared steps for the durable chat scenarios (PLAN 6.6). Each test gets its
// own chat on the dev trip through POST /chat-lab/new.

const snapshotSchema = z.object({
  chat: z.object({
    id: z.string(),
    status: z.enum(["idle", "running", "failed"]),
    activeRunId: z.string().optional(),
    lastError: z.string().optional(),
    messages: z.array(
      z.looseObject({
        id: z.string(),
        role: z.string(),
        parts: z.array(z.looseObject({ type: z.string() })),
        metadata: z.looseObject({}).optional(),
      }),
    ),
  }),
});

export type Snapshot = z.infer<typeof snapshotSchema>["chat"];

export async function newChat(request: APIRequestContext): Promise<string> {
  const response = await request.post("/chat-lab/new");
  expect(response.ok()).toBe(true);
  return z.object({ chatId: z.string() }).parse(await response.json()).chatId;
}

export async function openChat(page: Page, chatId: string): Promise<void> {
  await page.goto(`/chat-lab?chat=${chatId}`);
  await expect(page.getByTestId("chat-dock")).toBeVisible();
}

export async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId("composer").fill(text);
  await page.getByTestId("composer").press("Enter");
  await expect(page.getByTestId("chat-dock")).toHaveAttribute("data-busy", "true");
}

export async function snapshot(request: APIRequestContext, chatId: string): Promise<Snapshot> {
  const response = await request.get(`/api/chats/${chatId}`);
  expect(response.ok()).toBe(true);
  return snapshotSchema.parse(await response.json()).chat;
}

export async function waitForIdle(request: APIRequestContext, chatId: string, timeoutMs = 150_000): Promise<Snapshot> {
  let last: Snapshot | undefined;
  await expect
    .poll(
      async () => {
        last = await snapshot(request, chatId);
        return last.status;
      },
      { timeout: timeoutMs, intervals: [1_000] },
    )
    .not.toBe("running");
  return last!;
}

/** Waits until the chat holds `turns` answered user messages and is no longer running. */
export async function waitForTurns(request: APIRequestContext, chatId: string, turns: number, timeoutMs = 150_000): Promise<Snapshot> {
  let last: Snapshot | undefined;
  await expect
    .poll(
      async () => {
        last = await snapshot(request, chatId);
        const users = last.messages.filter((m) => m.role === "user").length;
        const assistants = last.messages.filter((m) => m.role === "assistant").length;
        return last.status !== "running" && users >= turns && assistants >= turns;
      },
      { timeout: timeoutMs, intervals: [1_000] },
    )
    .toBe(true);
  return last!;
}

export function textOf(message: Snapshot["messages"][number]): string {
  return message.parts
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("");
}

export function assistantMessages(chat: Snapshot) {
  return chat.messages.filter((m) => m.role === "assistant");
}

export function toolParts(message: Snapshot["messages"][number], toolName: string) {
  return message.parts.filter((p) => p.type === `tool-${toolName}`);
}
