import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CityFilter } from "@/components/places/city-filter";
import { cityCenter, placesHref, type PlacesQuery } from "@/components/places/format";
import { PlacesGrid } from "@/components/places/places-grid";
import { PlacesProvider } from "@/components/places/places-provider";
import { PlacesRail } from "@/components/places/places-rail";
import { PlacesSearch } from "@/components/places/places-search";
import { SavePlaceButton } from "@/components/places/save-place";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdvisor } from "@/lib/auth/advisor";
import { requirePageUser } from "@/lib/auth/server";
import { advisorCities, listAdvisorPlaces } from "@/lib/places";

// E My places: the advisor's own library of places, per city, with private
// notes. Filters live in the URL (?city=, ?q=, ?list=team) so the page stays
// a server component; the cards, the save flow and the rail controls are the
// client islands.

export const metadata: Metadata = { title: "My places · Tastebrief" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SUBTITLE = "Places you know and trust. On each trip, the ones in that city are scored for your client.";

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<PlacesFallback />}>
        <PlacesContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PlacesContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const teamEnabled = user.orgIds.length > 0;
  const list: "mine" | "team" = teamEnabled && one(params.list) === "team" ? "team" : "mine";
  const scope = list === "team" ? user : user.userId;
  const q = one(params.q).slice(0, 100);

  const [cities, advisor] = await Promise.all([advisorCities(scope), getAdvisor(user.userId)]);
  const requested = one(params.city);
  // Match the URL's city to the advisor's spelling ("lisbon" shows "Lisbon").
  const city = requested
    ? (cities.find((c) => c.city.toLowerCase() === requested.toLowerCase())?.city ?? requested)
    : "";
  const places = await listAdvisorPlaces(scope, { city: city || undefined, q: q || undefined });
  const total = cities.reduce((sum, c) => sum + c.count, 0);
  const query: Required<PlacesQuery> = { city, q, list };
  const near = city ? cityCenter(places, city) : null;
  const now = new Date().toISOString();

  return (
    <PlacesProvider initialTasteTags={advisor?.tasteTags ?? []}>
      <PageHeader
        title="My places"
        subtitle={total > 0 ? `${total} ${total === 1 ? "place" : "places"}. ${SUBTITLE}` : SUBTITLE}
        className="flex-wrap"
        actions={
          total > 0 ? (
            <>
              <CityFilter cities={cities} total={total} query={query} />
              <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-rule-strong" />
              <SavePlaceButton city={city || null} near={near} />
            </>
          ) : null
        }
      />

      <div className="flex flex-1 gap-10 px-7 pt-2 pb-7">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {total === 0 ? (
            <EmptyState
              title="Your places will show up here"
              body="Save the places you know and trust, with a private note. When a trip goes to that city, they are scored for your client."
              action={<SavePlaceButton variant="primary" />}
              className="py-24"
            />
          ) : (
            <>
              <PlacesSearch key={`${city}|${list}`} query={query} />
              {places.length > 0 ? (
                <PlacesGrid
                  places={places}
                  cityOrder={cities.map((c) => c.city)}
                  grouped={!city && cities.length > 1}
                  now={now}
                />
              ) : (
                <EmptyState
                  title="No places match"
                  body={
                    q
                      ? `Nothing in your places${city ? ` in ${city}` : ""} matches “${q}”. Search names, cities and notes.`
                      : `You have no saved places in ${city} yet.`
                  }
                  action={
                    <Link
                      href={placesHref({ list })}
                      className="text-ui font-semibold text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
                    >
                      Show all places
                    </Link>
                  }
                />
              )}
            </>
          )}
        </div>

        <PlacesRail
          query={query}
          mineCount={list === "mine" ? total : null}
          teamEnabled={teamEnabled}
          placeCount={total}
          blendMyTaste={advisor?.blendMyTaste ?? false}
        />
      </div>
    </PlacesProvider>
  );
}

function PlacesFallback() {
  return (
    <div aria-busy className="flex flex-col">
      <PageHeader title="My places" subtitle={SUBTITLE} />
      <div className="flex gap-10 px-7 pt-2 pb-7">
        <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-x-5 gap-y-8">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3.5">
              <div className="h-50 rounded-[18px] bg-avatar" />
              <div className="h-3 w-32 rounded-pill bg-avatar" />
              <div className="h-6 w-44 rounded-pill bg-avatar" />
              <div className="h-4 w-full rounded-pill bg-avatar/70" />
            </div>
          ))}
        </div>
        <div className="w-86 shrink-0 border-l border-ink/28 pl-8" />
      </div>
    </div>
  );
}
