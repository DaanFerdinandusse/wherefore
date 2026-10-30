// A trip's chats as the drawer and /api/trips/[tripId]/chats send them, and
// the drawer's short time label. Pure: the client drawer imports it too.

/** A chat row. `title` is null until the advisor's first message: the UI reads "New chat". */
export type NavChat = { id: string; title: string | null; updatedAt: string };

/** What the store hands over; only the fields a chat row needs. */
export type ChatListItem = { id: string; tripId: string; title: string | null; updatedAt: Date };

/** Chats listed per trip in the drawer; older ones stay reachable from the trip. */
export const CHATS_PER_TRIP = 6;

export const UNTITLED_CHAT = "New chat";

export function toNavChat(chat: ChatListItem): NavChat {
  return { id: chat.id, title: chat.title, updatedAt: chat.updatedAt.toISOString() };
}

/** Chats (already newest first) grouped by trip, at most `limit` each, order kept. */
export function groupChatsByTrip(chats: readonly ChatListItem[], limit = CHATS_PER_TRIP): Map<string, NavChat[]> {
  const byTrip = new Map<string, NavChat[]>();
  for (const chat of chats) {
    const list = byTrip.get(chat.tripId) ?? [];
    if (list.length < limit) list.push(toNavChat(chat));
    byTrip.set(chat.tripId, list);
  }
  return byTrip;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Local midnight of a date, for whole-day differences. */
function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * When a chat was last active, in a few characters, in the viewer's local
 * time: "Now" within the hour, "Today", "Yesterday", the weekday within the
 * last week ("Mon"), else the date ("12 Nov", with the year when it differs).
 */
export function chatTimeLabel(updatedAt: Date, now: Date = new Date()): string {
  if (now.getTime() - updatedAt.getTime() < 60 * 60_000) return "Now";
  const days = Math.round((dayStart(now) - dayStart(updatedAt)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[updatedAt.getDay()] ?? "";
  const date = `${updatedAt.getDate()} ${MONTHS[updatedAt.getMonth()] ?? ""}`;
  return updatedAt.getFullYear() === now.getFullYear() ? date : `${date} ${updatedAt.getFullYear()}`;
}

/** The chat a trip page shows: the one in `?chat=`, else the newest (the page opens that one by default). */
export function activeChatId(chats: readonly NavChat[], fromUrl: string | null): string | undefined {
  return fromUrl || chats[0]?.id;
}
