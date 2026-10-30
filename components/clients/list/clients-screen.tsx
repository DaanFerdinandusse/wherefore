import Link from "next/link";
import { Plus } from "lucide-react";

import { AppPage } from "@/components/shell/app-page";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StarburstOrnament } from "@/components/ui/starburst-ornament";
import { requirePageUser } from "@/lib/auth/server";
import { listClients, listClientTripCards } from "@/lib/clients";

import { filterCounts, inClientFilter, isClientFilter, plural, todayIso } from "../format";
import { ClientCard } from "./client-card";
import { ClientsFilters } from "./clients-filters";
import { ClientsSearch } from "./clients-search";

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

const addClientClasses = buttonClasses({ className: "h-[38px]! gap-2! px-[18px]!" });

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
  const counts = filterCounts(clients);
  const filtered = clients.filter((client) => inClientFilter(client, show));
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hidden = filtered.length - visible.length;

  const tripCards = await listClientTripCards(
    visible.flatMap((client) => (client.nextTrip ? [client.nextTrip.id] : [])),
    user,
  );
  const cardById = new Map(tripCards.map((card) => [card.id, card]));

  const subtitle = q
    ? `${plural(clients.length, "client")} match “${q}”.`
    : clients.length === 0
      ? "Add a client and the places they love. Every new trip starts from them."
      : "Their favorite places are saved, so every new trip starts from their taste.";

  return (
    <AppPage
      section="clients"
      detail={plural(clients.length, "client")}
      toolbar={clients.length > 0 || show !== "all" ? <ClientsFilters active={show} counts={counts} /> : null}
      actions={
        <Link href="/clients/new" className={addClientClasses}>
          <Plus size={14} strokeWidth={2.4} aria-hidden />
          Add client
        </Link>
      }
    >
      <PageHeader
        title="Clients"
        subtitle={subtitle}
        actions={clients.length > 0 || q ? <ClientsSearch initialQuery={q} /> : null}
      />

      {visible.length === 0 ? (
        <div className="pt-2">
          {q || show !== "all" ? (
            <EmptyState
              title="No clients match"
              body={
                q
                  ? `Nobody matches “${q}”. Check the spelling or clear the search.`
                  : "No client is in this group right now."
              }
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
        <section aria-label="Clients" className="flex flex-col gap-2">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
            {visible.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                nextTrip={client.nextTrip ? (cardById.get(client.nextTrip.id) ?? null) : null}
                startTripHref={hrefWith(params, {
                  new: "1",
                  client: client.id,
                })}
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
                className={buttonClasses({
                  variant: "outline",
                  size: "sm",
                  className: "h-[38px]! px-5! font-medium!",
                })}
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
    </AppPage>
  );
}
