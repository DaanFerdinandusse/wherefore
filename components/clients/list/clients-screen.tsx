import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StarburstOrnament } from "@/components/ui/starburst-ornament";
import { requirePageUser } from "@/lib/auth/server";
import { countClientTrips, listClients, listClientTripCards } from "@/lib/clients";
import { cn } from "@/lib/ui/cn";

import { clientTripState, filterCounts, isClientFilter, plural, todayIso } from "../format";
import { ClientRow } from "./client-row";
import { ClientsFilters } from "./clients-filters";
import { ClientsSearch } from "./clients-search";
import { COLUMNS } from "./columns";

// B Clients: the advisor's clients, newest activity first. ?q= searches
// (server side, fuzzy), ?show= filters by trip state, ?all=1 lifts the
// first-page cap.

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefWith(params: SearchParams, extra: Record<string, string>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = one(value);
    if (v) next.set(key, v);
  }
  for (const [key, value] of Object.entries(extra)) next.set(key, value);
  return `/clients?${next.toString()}`;
}

const addClientClasses = buttonClasses({
  variant: "outline-strong",
  className: "h-[35px]! gap-1.5! px-4!",
});

export async function ClientsScreen({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = one(params.q).trim();
  const showParam = one(params.show);
  const show = isClientFilter(showParam) ? showParam : "all";
  const showAll = one(params.all) === "1";

  const now = new Date();
  const today = todayIso(now);
  const clients = await listClients(user, { q });
  const states = clients.map((client) => clientTripState(client.nextTrip, today));
  const counts = filterCounts(states);
  const filtered = clients.filter((_, i) => show === "all" || states[i] === show);
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hidden = filtered.length - visible.length;

  const [tripCards, tripCounts] = await Promise.all([
    listClientTripCards(visible.flatMap((client) => (client.nextTrip ? [client.nextTrip.id] : [])), user),
    countClientTrips(visible.map((client) => client.id), user),
  ]);
  const cardById = new Map(tripCards.map((card) => [card.id, card]));

  const subtitle = q
    ? `${plural(clients.length, "client")} match “${q}”.`
    : clients.length === 0
      ? "Add a client and the places they love. Every new trip starts from them."
      : `${plural(clients.length, "client")}. Their favorite places are saved, so every new trip starts from what they love.`;

  return (
    <div className="flex flex-col pb-10">
      <PageHeader
        title="Clients"
        subtitle={subtitle}
        className="pb-5!"
        actions={
          <>
            <ClientsSearch initialQuery={q} />
            {clients.length > 0 ? <ClientsFilters active={show} counts={counts} /> : null}
            <span aria-hidden className="h-6 w-px shrink-0 bg-rule-strong" />
            <Link href="/clients/new" className={addClientClasses}>
              <Plus size={14} strokeWidth={2.4} aria-hidden />
              Add client
            </Link>
          </>
        }
      />

      {visible.length === 0 ? (
        <div className="px-7 pt-2">
          {q || show !== "all" ? (
            <EmptyState
              title="No clients match"
              body={q ? `Nobody matches “${q}”. Check the spelling or clear the search.` : "No client is in this group right now."}
              action={
                <Link href="/clients" className={buttonClasses({ variant: "outline" })}>
                  Show all clients
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Your clients will show up here"
              body="Add a client and the places they love, then plan their first trip."
              action={
                <Link href="/clients/new" className={buttonClasses()}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden />
                  Add client
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <section aria-label="Clients" className="flex flex-col gap-2 px-7">
          <div aria-hidden className="flex items-center gap-6 px-5 pb-1 text-text-muted">
            <span className={cn("label-caps shrink-0 leading-4", COLUMNS.client)}>Client</span>
            <span className={cn("label-caps shrink-0 leading-4", COLUMNS.loves)}>Loves</span>
            <span className={cn("label-caps shrink-0 leading-4", COLUMNS.nextTrip)}>Next trip</span>
            <span className={cn("label-caps shrink-0 leading-4", COLUMNS.trips)}>Trips</span>
            <span className={cn("label-caps shrink-0 leading-4", COLUMNS.activity)}>Last activity</span>
          </div>
          <ul className="flex flex-col gap-2">
            {visible.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                nextTrip={client.nextTrip ? (cardById.get(client.nextTrip.id) ?? null) : null}
                tripCount={tripCounts[client.id] ?? 0}
                startTripHref={hrefWith(params, { new: "1", client: client.id })}
                today={today}
                now={now}
              />
            ))}
          </ul>

          <footer className="flex flex-col items-center gap-3.5 py-5">
            {hidden > 0 ? (
              <Link
                href={hrefWith(params, { all: "1" })}
                scroll={false}
                className={buttonClasses({ variant: "outline", size: "sm", className: "h-[38px]! px-5! font-medium!" })}
              >
                Show {plural(hidden, "more client")}
              </Link>
            ) : null}
            <StarburstOrnament size={36} />
            <p className="text-center text-meta leading-[17px] text-text-muted">
              Every favorite is matched to a real place.
              <br />
              New trips reuse them.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
