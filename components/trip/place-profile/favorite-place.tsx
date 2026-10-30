"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { Heart, Info, MapPin, X } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import type { TripPlaceProfilePlace } from "@/lib/trips/profile-types";

import { CardTabs, CATEGORY_ICON, PhotoChip, PhotoStrip, type CardTab } from "./place-card-parts";
import { ReviewsPanel, VisitPanel } from "./place-card-panels";
import { placePhotos } from "./place-photos";
import { PhotoViewer } from "./photo-viewer";
import { priceSigns } from "./profile-format";
import { useFavoritePlace, useGoogleDetails } from "./use-profile-data";

// A favorite named in a "Why Ana" list, opened over whatever named it: the
// same photos, Visit info and Reviews as a place card, with About in place of
// the match. It is a reminder of what the place is, usually in another city
// and not on the trip, so it has no actions. Artists and films have no place
// to open: the lists show them as plain names.

export type FavoriteRef = { entityId: string; name: string };

function stayInside(event: SyntheticEvent) {
  event.stopPropagation();
}

export function FavoritePlaceSheet({
  favorite,
  client,
  onClose,
}: {
  favorite: FavoriteRef | null;
  client: string;
  onClose: () => void;
}) {
  return (
    // Esc here closes this sheet, not the place card or the chat around it.
    <div className="contents" onKeyDown={stayInside} onClick={stayInside}>
      <Sheet
        open={Boolean(favorite)}
        onClose={onClose}
        label={favorite?.name ?? "Favorite place"}
        side="center"
        // Anchored to the top: the tabs change the card's height and must stay under the pointer.
        className="mt-[5dvh] max-h-[calc(100%-5dvh)]! w-[min(900px,100%)]! self-start bg-canvas! p-6!"
      >
        {favorite ? <FavoriteCard key={favorite.entityId} favorite={favorite} client={client} onClose={onClose} /> : null}
      </Sheet>
    </div>
  );
}

function FavoriteCard({ favorite, client, onClose }: { favorite: FavoriteRef; client: string; onClose: () => void }) {
  const { name } = favorite;
  const [tab, setTab] = useState<CardTab>("for");
  const [gallerySrc, setGallerySrc] = useState<string | null>(null);
  const { value, problem } = useFavoritePlace(favorite.entityId);
  const place = value?.place ?? null;
  const category = value?.category ?? "other";
  const { details, full, fullLoading, basicLoading } = useGoogleDetails(place?.id ?? null, Boolean(place?.googlePlaceId), true, tab !== "for");
  const photos = useMemo(() => placePhotos(name, place?.images, undefined, details?.photos), [name, place, details]);
  const placeLoading = !place && !problem;
  const photosLoading = placeLoading || basicLoading;
  const where = [place?.neighborhood, place?.city].filter(Boolean).join(", ");
  const price = priceSigns(place?.priceLevel);

  return (
    <article aria-label={name} data-testid="favorite-card" className="@container rise-in flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <h3 className="min-w-0 text-card-xs font-semibold text-ink">{name}</h3>
        <div className="flex items-center gap-2">
          {problem ? null : <CardTabs value={tab} onChange={setTab} first="About" firstIcon={Info} />}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${name}`}
            title={`Close ${name}`}
            data-testid="favorite-card-close"
            className="inline-flex size-9 items-center justify-center rounded-pill bg-track text-text-3 hover:bg-rule hover:text-ink"
          >
            <X aria-hidden className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {problem ? (
        <p className="px-1 text-ui text-text-2" role={problem === "failed" ? "alert" : undefined}>
          {problem === "failed" ? `${name} did not load. Close this and try again.` : `No place details for ${name}.`}
        </p>
      ) : (
        <>
          <div>
            <PhotoStrip
              photos={photosLoading ? [] : photos}
              loading={photosLoading}
              name={name}
              tall
              onOpenGallery={setGallerySrc}
              chips={
                <>
                  {place?.kind ? <PhotoChip icon={CATEGORY_ICON[category]}>{place.kind}</PhotoChip> : null}
                  {where ? <PhotoChip icon={MapPin}>{where}</PhotoChip> : null}
                  {price ? (
                    <PhotoChip>
                      <span className="sr-only">Price level </span>
                      {price}
                    </PhotoChip>
                  ) : null}
                  <PhotoChip icon={Heart}>{client}&apos;s favorite</PhotoChip>
                </>
              }
            />
            {gallerySrc ? (
              <PhotoViewer photos={photos} name={name} initialSrc={gallerySrc} photosUrl={details?.photosUrl} onClose={() => setGallerySrc(null)} />
            ) : null}
          </div>

          {tab === "for" ? (
            <AboutPanel place={place} name={name} />
          ) : tab === "visit" ? (
            <VisitPanel card={{ name, category }} place={place} details={full} loading={placeLoading || fullLoading} client={client} />
          ) : (
            <ReviewsPanel details={full} loading={placeLoading || fullLoading} terms={[]} />
          )}
        </>
      )}
    </article>
  );
}

function AboutPanel({ place, name }: { place: TripPlaceProfilePlace | null; name: string }) {
  const box = "flex flex-col gap-3 rounded-card bg-surface-raised px-4.5 py-4 shadow-soft";
  if (!place) {
    return (
      <section aria-busy className={box}>
        <span aria-hidden className="skeleton-shimmer block h-3.5 w-full rounded-pill" />
        <span aria-hidden className="skeleton-shimmer block h-3.5 w-3/4 rounded-pill" />
      </section>
    );
  }
  const paragraphs = [place.shortDescription, ...place.aboutParagraphs].flatMap((text) => (text ? [text] : []));
  return (
    <section aria-label={`About ${name}`} className={box} data-testid="favorite-card-about">
      {paragraphs.length > 0 ? (
        paragraphs.map((text) => (
          <p key={text} className="text-body leading-5.5 text-ink">
            {text}
          </p>
        ))
      ) : (
        <p className="text-ui text-text-2">No description of {name} yet.</p>
      )}
      {place.features.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Features">
          {place.features.map((feature) => (
            <li key={feature} className="rounded-pill bg-track px-2.5 py-1 text-ui-sm leading-4.25 text-text-3">
              {feature}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
