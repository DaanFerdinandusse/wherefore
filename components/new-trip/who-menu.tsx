"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import { searchTripBarClients, type TripBarClient } from "@/lib/trips/actions";
import { cn } from "@/lib/ui/cn";

import { DropLabel } from "./bar-segment";
import { enterRows, moveBetweenRows } from "./drop-keys";
import { clientLine } from "./format";
import { localToday } from "./today";
import { useDebouncedValue } from "./use-debounced-value";

// For who (N1): the most recent clients, each with three favorite photos,
// the name and "New York · Mexico City in Nov" (home city and next trip).
// Under them "Find a client by name or city", which swaps the list for the
// matches as you type, and "+ New client", which opens the client screen and
// comes back here through `return`. Arrow keys move between the rows.
export function WhoMenu({
  recentClients,
  loading,
  selectedId,
  newClientHref,
  onSelect,
}: {
  recentClients: TripBarClient[];
  loading: boolean;
  selectedId: string | null;
  newClientHref: string;
  onSelect: (client: TripBarClient) => void;
}) {
  const [today] = useState(localToday);
  const [query, setQuery] = useState("");
  const q = query.trim();
  const debounced = useDebouncedValue(q, 250);
  const [results, setResults] = useState<{ q: string; clients: TripBarClient[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!debounced) return;
    let live = true;
    searchTripBarClients(debounced)
      .then((clients) => {
        if (!live) return;
        setError(null);
        setResults({ q: debounced, clients });
      })
      .catch(() => {
        if (live) setError(debounced);
      });
    return () => {
      live = false;
    };
  }, [debounced]);

  const matches = q && debounced === q && results?.q === q ? results.clients : null;
  const failed = Boolean(q) && error === q;

  let list;
  if (!q) {
    list = loading ? (
      <Note>
        <Spinner size={14} /> Loading your clients
      </Note>
    ) : recentClients.length === 0 ? (
      <Note>No clients yet. Add your first one below.</Note>
    ) : (
      recentClients.map((client) => (
        <ClientRow key={client.id} client={client} today={today} selected={client.id === selectedId} onSelect={onSelect} />
      ))
    );
  } else if (failed) {
    list = <Note alert>Could not search your clients. Try again.</Note>;
  } else if (!matches) {
    list = (
      <Note>
        <Spinner size={14} /> Searching your clients
      </Note>
    );
  } else if (matches.length === 0) {
    list = <Note>No client matches “{q}”. Check the spelling, or add them as a new client.</Note>;
  } else {
    list = matches.map((client) => (
      <ClientRow key={client.id} client={client} today={today} selected={client.id === selectedId} onSelect={onSelect} />
    ));
  }

  return (
    <div className="flex flex-col gap-1">
      <DropLabel>{q ? "Matching clients" : "Recent clients"}</DropLabel>
      <div onKeyDown={moveBetweenRows} className="flex max-h-[min(360px,calc(100dvh-420px))] min-h-18 flex-col gap-1 overflow-y-auto">
        {list}
      </div>
      <div className="mt-1 flex items-center gap-3 border-t border-rule px-4 pt-4 pb-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-pill bg-surface px-[18px] transition-shadow focus-within:ring-1 focus-within:ring-pill-outline">
          <Search size={18} strokeWidth={2} aria-hidden className="shrink-0 text-text-3" />
          <input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => enterRows(event, event.currentTarget.closest("[data-drop]"))}
            aria-label="Find a client by name or city"
            placeholder="Find a client by name or city"
            className="min-w-0 flex-1 bg-transparent text-action text-ink placeholder:text-text-muted focus-visible:outline-none"
          />
        </label>
        <Link
          href={newClientHref}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-pill border border-ink pr-5 pl-4 text-action font-semibold text-ink transition-colors hover:bg-ink/5"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
          New client
        </Link>
      </div>
    </div>
  );
}

function Note({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p role={alert ? "alert" : undefined} className={cn("flex items-center gap-2 px-4 py-4 text-ui", alert ? "text-amber" : "text-text-2")}>
      {children}
    </p>
  );
}

function ClientRow({
  client,
  today,
  selected,
  onSelect,
}: {
  client: TripBarClient;
  today: string;
  selected: boolean;
  onSelect: (client: TripBarClient) => void;
}) {
  const line = clientLine(client, today);
  const photos = client.favoriteImages.slice(0, 3);
  return (
    <button
      type="button"
      data-row
      onClick={() => onSelect(client)}
      aria-current={selected || undefined}
      className={cn(
        "group flex w-full items-center gap-5 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-glow/25 focus-visible:bg-glow/25 focus-visible:outline-none",
        selected && "bg-glow/25",
      )}
    >
      <span aria-hidden className="flex w-60 shrink-0 gap-1">
        {photos.length > 0 ? (
          photos.map((src) => (
            <span key={src} className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-avatar">
              <FilmImage src={src} alt="" sizes="72px" />
            </span>
          ))
        ) : (
          <Avatar name={client.name} src={client.avatarUrl ?? undefined} size={48} />
        )}
      </span>
      <span className="w-40 shrink-0 truncate text-body-lg leading-[22px] font-semibold text-ink">{client.name}</span>
      <span className="min-w-0 flex-1 truncate text-ui leading-5 text-text-3">{line}</span>
      <ChevronRight
        size={20}
        strokeWidth={2}
        aria-hidden
        className={cn(
          "shrink-0 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          selected && "opacity-100",
        )}
      />
    </button>
  );
}
