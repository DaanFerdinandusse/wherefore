import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryTabs } from "@/components/places/category-tabs";
import {
  categoryTabs,
  citySummaries,
  clientsGoingTo,
  clientTripLine,
  defaultClientId,
  firstName,
  parseCategory,
  placeSections,
  sameCity,
  type CitySummary,
} from "@/components/places/city";
import { CityPlaces } from "@/components/places/city-places";
import { CitySwitcher } from "@/components/places/city-switcher";
import { ClientPicker, type PickerClient } from "@/components/places/client-picker";
import { cityCenter, placesHref, type PlacesQuery } from "@/components/places/format";
import { PlacesProvider } from "@/components/places/places-provider";
import { SavePlaceButton } from "@/components/places/save-place";
import { ScoresProvider, ScoreStatus } from "@/components/places/scores";
import { ListToggle, TasteButton } from "@/components/places/taste";
import { AppPage } from "@/components/shell/app-page";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdvisor } from "@/lib/auth/advisor";
import { requirePageUser } from "@/lib/auth/server";
import { listClients } from "@/lib/clients";
import { listAdvisorPlaces, listCityTrips } from "@/lib/places";
import { scorePlacesForClient } from "@/lib/places/scores";
import { todayIso } from "@/lib/trips/stage";

// H4 / H5 My places: the advisor's own places one city at a time. The URL
// keeps the state (?city=, ?category=, ?client=, ?list=team), so the page is
// a server component; the city picker, the client picker, the cards and the
// save flow are the client islands. Scoring for the picked client starts
// here and streams into the cards without holding the page.

export const metadata: Metadata = { title: "My places · Wherefore" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PlacesFallback />}>
      <PlacesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PlacesContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const teamEnabled = user.orgIds.length > 0;
  const list: "mine" | "team" = teamEnabled && one(params.list) === "team" ? "team" : "mine";
  const scope = list === "team" ? user : user.userId;
  const today = todayIso();

  const [all, trips, clients, advisor] = await Promise.all([
    listAdvisorPlaces(scope, { limit: 500 }),
    listCityTrips(scope),
    listClients(scope, { limit: 200 }),
    getAdvisor(user.userId),
  ]);
  const cities = citySummaries(all, trips, today);

  // The city in the URL, in the advisor's spelling; else the city with the most places.
  const requested = one(params.city).slice(0, 80);
  const known = requested ? cities.find((c) => sameCity(c.city, requested)) : cities[0];
  const city = known?.city ?? requested;
  const current: CitySummary | null =
    known ?? (city ? { city, count: 0, country: null, imageUrl: null, mix: null, fact: null } : null);
  const places = city ? all.filter((p) => sameCity(p.city, city)) : [];
  const filter = parseCategory(one(params.category));

  // Scored for: the client in the URL, else the one there now or going next.
  const clientParam = one(params.client);
  const active = clients.filter((c) => c.status === "active");
  const clientId = clientParam === "none" ? null : clientParam || (city ? defaultClientId(trips, city, today) : null);
  const client = clientId ? (active.find((c) => c.id === clientId) ?? null) : null;
  const scores = client && places.length > 0 ? scorePlacesForClient(client.id, places.map((p) => p.entityId), scope) : null;

  const going = city ? clientsGoingTo(trips, city, today) : [];
  const pickerClients: PickerClient[] = [
    ...going.flatMap((id) => active.filter((c) => c.id === id)),
    ...active.filter((c) => !going.includes(c.id)),
  ].map((c) => ({
    id: c.id,
    name: c.name,
    avatarUrl: c.avatarUrl,
    line: city ? clientTripLine(trips, c.id, city, today) : null,
  }));

  const query: PlacesQuery = { city, category: filter, client: clientParam || null, list };
  const near = city ? cityCenter(places, city) : null;
  const sections = placeSections(places, filter);
  const filterLabel = sections[0]?.title.toLocaleLowerCase("en");

  return (
    <PlacesProvider initialTasteTags={advisor?.tasteTags ?? []}>
      <AppPage
        section="places"
        detail={`${all.length} saved`}
        toolbar={
          <>
            <CitySwitcher current={current} cities={cities} total={all.length} list={list} />
            {teamEnabled ? <ListToggle query={query} /> : null}
          </>
        }
        actions={
          <>
            {all.length > 0 ? <TasteButton placeCount={all.length} blendMyTaste={advisor?.blendMyTaste ?? false} /> : null}
            <SavePlaceButton city={city || null} near={near} variant="primary" />
          </>
        }
      >
        {!city ? (
          <EmptyState
            title="Your places will show up here"
            body="Save the places you know and trust, with a private note. When a trip goes to that city, they are scored for your client."
            action={<SavePlaceButton variant="primary" />}
            className="py-24"
          />
        ) : (
          <ScoresProvider scores={scores} clientName={client?.name ?? ""} firstName={client ? firstName(client.name) : ""}>
            <div className="flex flex-col gap-1.5">
              <h1 className="font-display text-section text-ink">{city}</h1>
              <p className="text-body leading-[22px] text-text-3">
                {places.length > 0
                  ? `${places.length} ${places.length === 1 ? "place" : "places"} you know and trust here. On a ${city} trip, they are scored for your client.`
                  : `No places saved in ${city} yet. On a ${city} trip, the ones you save here are scored for your client.`}
              </p>
            </div>

            {places.length === 0 ? (
              <EmptyState
                title={`Start your ${city} list`}
                body="Search a place by name, add what you would tell a client, and save it."
                action={<SavePlaceButton city={city} near={near} variant="primary" />}
                className="py-16"
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CategoryTabs tabs={categoryTabs(places)} total={places.length} filter={filter} query={query} />
                  <div className="flex min-w-0 items-center gap-3">
                    <ScoreStatus />
                    <ClientPicker
                      clients={pickerClients}
                      selected={client ? { id: client.id, name: client.name } : null}
                      city={city}
                      query={query}
                    />
                  </div>
                </div>
                {sections.length > 0 ? (
                  <CityPlaces places={places} filter={filter} query={query} now={new Date().toISOString()} />
                ) : (
                  <EmptyState
                    title={`No ${filterLabel ?? "places of this kind"} in ${city} yet`}
                    body="Save one with Save a place, or look at everything you have here."
                    action={
                      <Link
                        href={placesHref({ ...query, category: null })}
                        className="text-ui font-semibold text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
                      >
                        Show all {places.length} places
                      </Link>
                    }
                  />
                )}
              </>
            )}
          </ScoresProvider>
        )}
      </AppPage>
    </PlacesProvider>
  );
}

function PlacesFallback() {
  return (
    <AppPage
      section="places"
      toolbar={<div className="h-12 w-110 max-w-[calc(100vw-420px)] min-w-72 rounded-pill bg-white/70" />}
    >
      <div aria-busy className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <div className="h-10 w-48 rounded-pill bg-avatar" />
          <div className="h-4 w-96 rounded-pill bg-avatar/70" />
        </div>
        <div className="h-[42px] w-[420px] rounded-pill bg-canvas" />
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-[18px] bg-surface-raised">
              <div className="aspect-[3/2] bg-avatar" />
              <div className="flex flex-col gap-2.5 p-3.5">
                <div className="h-3 w-32 rounded-pill bg-avatar" />
                <div className="h-6 w-44 rounded-pill bg-avatar" />
                <div className="h-4 w-full rounded-pill bg-avatar/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppPage>
  );
}
