import { describe, expect, it } from "vitest";

import { runIdFromReconnectApi } from "./use-chat-session";

// Which run a reconnect is bound to. WorkflowChatTransport builds its default
// reconnect URL as `<api>/<runId or chatId>/stream`.

describe("runIdFromReconnectApi", () => {
  const chatId = "3b1f0c2e-0000-4000-8000-000000000001";

  it("reads the run a dropped prompt stream was reading", () => {
    expect(runIdFromReconnectApi(`/api/chats/${chatId}/messages/wrun_01ABC/stream`, chatId)).toBe("wrun_01ABC");
  });

  it("names no run when the URL carries the chat id (a resume) or a placeholder", () => {
    expect(runIdFromReconnectApi(`/api/chats/${chatId}/messages/${chatId}/stream`, chatId)).toBeUndefined();
    expect(runIdFromReconnectApi(`/api/chats/${chatId}/messages/none/stream`, chatId)).toBeUndefined();
    expect(runIdFromReconnectApi(`/api/chats/${chatId}/stream`, chatId)).toBeUndefined();
  });
});
