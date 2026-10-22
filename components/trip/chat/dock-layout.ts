// Layout state of the chat dock that is not chat state: whether the list is
// collapsed (remembered per chat for the browser session), whether the list
// is pinned to the bottom, and how tall the list may be. Pure helpers plus a
// tiny sessionStorage store for useSyncExternalStore.

/** How close to the bottom (px) still counts as "at the bottom". */
export const PIN_THRESHOLD = 24;

/** Height of the list at rest: the tail of the last reply, so the dock is about 177 px. */
export const PEEK_HEIGHT = 42;

export type ListMode = "hidden" | "peek" | "open";

export function listMode({ collapsed, expanded }: { collapsed: boolean; expanded: boolean }): ListMode {
  if (collapsed) return "hidden";
  return expanded ? "open" : "peek";
}

export function isAtBottom(el: { scrollTop: number; scrollHeight: number; clientHeight: number }, threshold = PIN_THRESHOLD) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * The list's max height in px, or undefined for "up to the dock's cap".
 * At rest it peeks; while open it fits the last turn (never below the peek),
 * and once the reader scrolls back into earlier turns it may use the whole cap.
 */
export function listMaxHeight(mode: ListMode, lastTurnHeight: number | null, reading: boolean): number | undefined {
  if (mode === "peek") return PEEK_HEIGHT;
  if (mode === "hidden" || reading || lastTurnHeight === null) return undefined;
  return Math.max(PEEK_HEIGHT, Math.ceil(lastTurnHeight));
}

// Collapsed flag per chat, in sessionStorage. Storage can throw (private
// windows, blocked site data); the dock then just starts open.

export function collapsedKey(chatId: string) {
  return `tastebrief.chat-dock.collapsed.${chatId}`;
}

const listeners = new Set<() => void>();
// Fallback when storage is unavailable, so the toggle still works this visit.
const memory = new Map<string, boolean>();

export function readCollapsed(chatId: string): boolean {
  try {
    return window.sessionStorage.getItem(collapsedKey(chatId)) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(chatId: string, collapsed: boolean) {
  try {
    if (collapsed) window.sessionStorage.setItem(collapsedKey(chatId), "1");
    else window.sessionStorage.removeItem(collapsedKey(chatId));
  } catch {
    // Not remembered; the in-memory value below still applies.
  }
  memory.set(chatId, collapsed);
  for (const listener of listeners) listener();
}

export function collapsedSnapshot(chatId: string): boolean {
  return memory.get(chatId) ?? readCollapsed(chatId);
}

export function subscribeCollapsed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
