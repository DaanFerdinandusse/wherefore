// Error copy for the dock: what went wrong and what to do about it. Never
// names a vendor; the server already writes advisor-facing messages, so a
// known server message is shown as is.

export type ChatProblem = { problem: string; recovery: string; retry: boolean };

const SERVER_JSON = /\{"error":"([a-z_]+:[a-z]+)","message":"([^"]+)"\}/;

export function describeChatError(error: Error | string | undefined): ChatProblem | undefined {
  if (!error) return undefined;
  const text = typeof error === "string" ? error : error.message;

  const server = SERVER_JSON.exec(text);
  if (server) {
    const [, code, message] = server;
    if (code === "conflict:chat") {
      return { problem: "A reply is already running in this chat.", recovery: "Wait for it to finish, or stop it.", retry: false };
    }
    if (code === "not_found:chat") {
      return { problem: "This chat no longer exists.", recovery: "Reload the trip.", retry: false };
    }
    return { problem: message ?? "The message was not sent.", recovery: "Try again.", retry: true };
  }
  if (/Subscription limit reached/i.test(text)) {
    return { problem: text, recovery: "Try again after the reset.", retry: true };
  }
  if (/Failed to reconnect|Failed to fetch|NetworkError|network/i.test(text)) {
    return { problem: "The connection to the reply dropped.", recovery: "Check your connection, then reload to catch up.", retry: false };
  }
  return { problem: text.length > 200 ? "The reply stopped with an error." : text, recovery: "Send it again to retry.", retry: true };
}
