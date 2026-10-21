import "server-only";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser, type AuthUser } from "@/lib/auth/server";

import { ChatRouteError, chatErrorResponse } from "./chat-routes";

type ChatParams = { params: Promise<{ chatId: string }> };

/**
 * Wraps a chat route: requireUser first, then the handler; typed route
 * errors and auth errors become JSON responses, anything else is a 500.
 */
export function chatRoute(
  handler: (args: { request: Request; chatId: string; user: AuthUser }) => Promise<Response>,
): (request: Request, context: ChatParams) => Promise<Response> {
  return async (request, context) => {
    try {
      const user = await requireUser();
      const { chatId } = await context.params;
      return await handler({ request, chatId, user });
    } catch (error) {
      if (error instanceof ChatRouteError) return chatErrorResponse(error);
      try {
        return errorResponse(error);
      } catch {
        console.error("[chat route] unexpected error", error);
        return Response.json(
          { error: "internal:chat", message: "Something went wrong on our side. Try again." },
          { status: 500 },
        );
      }
    }
  };
}
