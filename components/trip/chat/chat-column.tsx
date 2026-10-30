"use client";

import type { ChatDockProps } from "../contracts";

import { ChatDock } from "./chat-dock";

// The v3 chat column: the left half of the trip workspace (G1). The thread
// fills the column, the composer sits at its bottom, and a selected place
// opens as a full place card (J1) inside the column. The workspace mounts it
// with the same props the dock took; the chat owner builds the inside.
export type ChatColumnProps = Omit<ChatDockProps, "toggle">;

export function ChatColumn(props: ChatColumnProps) {
  return <ChatDock {...props} />;
}
