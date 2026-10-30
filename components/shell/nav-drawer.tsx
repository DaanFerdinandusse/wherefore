"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, BriefcaseBusiness, Plus, Search, Users, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import { Sheet } from "@/components/ui/sheet";
import { cardDatesLabel, tripDayToday } from "@/components/trips/format";
import type { NavSummary, NavTrip } from "@/lib/trips/nav";
import { activeChatId, chatTimeLabel, UNTITLED_CHAT, type NavChat } from "@/lib/trips/nav-chats";
import { cn } from "@/lib/ui/cn";

import { flattenResults, type SearchResults } from "./search-results";
import { useShell } from "./shell-store";

// G3 Nav drawer: the menu button's sheet from the left. New trip, a search
// across clients, trips and places, the sections, the most recent trips
// (the open trip lists its chats under it, with "New chat for this trip"),
// and the advisor at the bottom. Its data loads each time it opens
// (/api/nav), so counts stay current. Switching chats is a URL change:
// /trips/<id>?chat=<chatId>.

const SECTIONS = [
  { href: "/trips", label: "Trips", icon: BriefcaseBusiness },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/places", label: "My places", icon: Bookmark },
] as const;

const STAGE_DOT: Record<NavTrip["stage"], string> = {
  planning: "bg-ink",
  shared: "bg-glow",
  traveling: "bg-green",
  done: "bg-transparent",
};

function tripLine(trip: NavTrip, today: string): string {
  if (trip.stage === "traveling") {
    const day = tripDayToday(trip, today);
    return day ? `Traveling now · Day ${day} of ${trip.days}` : "Traveling now";
  }
  const dates = cardDatesLabel(trip);
  const open = Math.max(0, trip.days * 3 - trip.filledSlots);
  if (trip.stage === "shared") return `${dates} · shared`;
  return trip.filledSlots === 0 ? `${dates} · nothing picked yet` : `${dates} · ${open} ${open === 1 ? "slot" : "slots"} open`;
}

export function NavDrawer() {
  const open = useShell((s) => s.drawerOpen);
  const close = useShell((s) => s.closeDrawer);
  const pathname = usePathname();

  // Any navigation closes the drawer.
  useEffect(() => close(), [pathname, close]);

  return (
    <Sheet open={open} onClose={close} label="Menu" side="left" className="flex flex-col gap-[22px] px-4 pt-4 pb-3.5">
      <DrawerBody onClose={close} pathname={pathname} />
    </Sheet>
  );
}

function DrawerBody({ onClose, pathname }: { onClose: () => void; pathname: string }) {
  const router = useRouter();
  const userName = useShell((s) => s.userName);
  const [summary, setSummary] = useState<NavSummary | null>(null);
  // The open chat (?chat=), read when the data lands: the drawer mounts on open.
  const [chatParam, setChatParam] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; results: SearchResults } | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/nav", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<NavSummary>) : null))
      .then((data) => {
        setChatParam(new URLSearchParams(window.location.search).get("chat"));
        setSummary(data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SearchResults>) : null))
        .then((data) => setFound(data ? { q, results: data } : null))
        .catch(() => undefined);
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Results show while the query is not empty; the last answer stays up while the next loads.
  const results = query.trim() && found ? found.results : null;
  const flat = results ? flattenResults(results) : [];

  return (
    <>
      <div className="flex items-center justify-between pl-2">
        <Link href="/trips" className="font-display text-wordmark leading-8 tracking-[-0.03em] text-ink">
          Tastebrief
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="inline-flex size-10 items-center justify-center rounded-pill bg-canvas text-ink transition-colors hover:bg-avatar"
        >
          <X size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams({ new: "1" });
            router.push(`${pathname.startsWith("/trips/") ? "/trips" : pathname}?${params.toString()}`);
          }}
          className="flex h-[45px] items-center justify-center gap-2 rounded-pill bg-ink text-action font-semibold text-surface transition-colors hover:bg-text-4"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden />
          New trip
        </button>
        <label className="flex h-[42px] items-center gap-2.5 rounded-pill border border-ink/8 bg-surface-raised px-4 focus-within:border-ink">
          <Search size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients, trips or places"
            aria-label="Search clients, trips or places"
            className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      {results ? (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {flat.length === 0 ? (
            <p role="status" className="px-3 py-2 text-ui text-text-2">
              No clients, trips or places match “{query.trim()}”.
            </p>
          ) : (
            flat.map((result) => (
              <Link
                key={`${result.group}-${result.id}`}
                href={result.href}
                className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-canvas"
              >
                {result.group === "clients" ? (
                  <Avatar name={result.title} size={38} src={result.imageUrl} />
                ) : (
                  <Thumb src={result.imageUrl ?? null} size={38} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body leading-5 font-semibold text-ink">{result.title}</span>
                  {result.subtitle ? <span className="truncate text-ui-sm text-text-muted">{result.subtitle}</span> : null}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : (
        <>
          <nav aria-label="Sections" className="flex flex-col gap-0.5">
            {SECTIONS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href === "/trips" ? pathname === "/trips" : pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-row px-3 py-2.5 text-body leading-5 text-ink transition-colors hover:bg-canvas",
                    active ? "bg-canvas font-semibold" : "font-medium",
                  )}
                >
                  <span className="flex w-5 shrink-0 justify-center">
                    <Icon size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="flex-1">{label}</span>
                  {href === "/trips" && summary ? (
                    <span className="text-ui-sm font-normal text-text-muted">{summary.tripsInProgress} in progress</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {summary && summary.recentTrips.length > 0 ? (
              <>
                <p className="label-caps px-3 pb-1.5 leading-4 text-text-3">Recent trips</p>
                {summary.recentTrips.map((trip) => {
                  const current = pathname.startsWith(`/trips/${trip.id}`);
                  return (
                    <div key={trip.id} className="flex flex-col">
                      <Link
                        href={`/trips/${trip.id}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl p-2 transition-colors",
                          current
                            ? "bg-surface-raised shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]"
                            : "hover:bg-canvas",
                        )}
                      >
                        <Thumb src={trip.imageUrl} size={44} />
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className={cn("truncate text-body leading-5 text-ink", current ? "font-semibold" : "font-medium")}>
                            {trip.clientName} · {trip.destinationName}
                          </span>
                          <span className="truncate text-ui-sm text-text-muted">{tripLine(trip, today)}</span>
                        </span>
                        <span aria-hidden className={cn("mr-1.5 size-2 shrink-0 rounded-pill", STAGE_DOT[trip.stage])} />
                      </Link>
                      {current ? (
                        <TripChats tripId={trip.id} chats={trip.chats} activeId={activeChatId(trip.chats, chatParam)} onNavigate={onClose} />
                      ) : null}
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 border-t border-ink/8 px-2 pt-3 pb-0.5">
        <Avatar name={userName} tone="ink" size={38} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body leading-5 font-semibold text-ink">{userName || "Your account"}</span>
          <span className="text-ui-sm text-text-muted">Shared demo workspace</span>
        </span>
      </div>
    </>
  );
}

/** The open trip's chats, nested under its row, and the action that starts another. */
function TripChats({
  tripId,
  chats,
  activeId,
  onNavigate,
}: {
  tripId: string;
  chats: NavChat[];
  activeId: string | undefined;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = new Date();

  async function startChat() {
    setCreating(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/trips/${tripId}/chats`, { method: "POST" });
      const body = res.ok ? ((await res.json()) as { chat?: { id?: unknown } }) : null;
      const id = typeof body?.chat?.id === "string" ? body.chat.id : null;
      if (!id) throw new Error("No chat id");
      onNavigate();
      router.push(`/trips/${tripId}?chat=${id}`);
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5 pt-0.5 pb-1.5 pl-7.5">
      {chats.map((chat) => {
        const active = chat.id === activeId;
        return (
          <Link
            key={chat.id}
            href={`/trips/${tripId}?chat=${chat.id}`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] transition-colors",
              active ? "bg-canvas" : "hover:bg-canvas",
            )}
          >
            <ChatIcon className={active ? "text-ink" : "text-text-muted"} />
            <span className={cn("min-w-0 flex-1 truncate text-ui text-ink", active ? "font-semibold" : "font-normal")}>
              {chat.title ?? UNTITLED_CHAT}
            </span>
            <span className="shrink-0 text-meta text-text-muted">{chatTimeLabel(new Date(chat.updatedAt), now)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={startChat}
        disabled={creating}
        className="flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left transition-colors hover:bg-canvas disabled:opacity-60"
      >
        <Plus size={14} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
        <span className="text-ui font-medium text-text-3">{creating ? "Starting a new chat" : "New chat for this trip"}</span>
      </button>
      {failed ? (
        <p role="alert" className="px-2.5 text-meta text-text-2">
          Could not start a new chat. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
      <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  return (
    <span style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-xl bg-avatar">
      {src ? <FilmImage src={src} alt="" sizes={`${size}px`} /> : null}
    </span>
  );
}
