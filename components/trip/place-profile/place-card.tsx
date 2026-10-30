"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Bookmark, Check, ChevronUp, Heart, MapPin, MessageCircle, Plus, Quote, Utensils, X } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { likeLine } from "@/lib/agent/taste-overlap";
import type { Category, ItinerarySlot, PlaceVerdict, SlotName, SlotTarget, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { slotHolds } from "@/lib/trips/day-parts";
import type { TripPlaceProfileDriver } from "@/lib/trips/profile-types";
import { cn } from "@/lib/ui/cn";

import { VerdictLine } from "../verdict-line";
import { startPlaceDrag } from "../workspace/dnd";

import { PlaceChips } from "../place-chips";

import { PhotoViewer } from "./photo-viewer";
import { LoadingPhoto } from "./loading-photo";
import { keywordBars } from "./card-format";
import { FavoritePlaceSheet, type FavoriteRef } from "./favorite-place";
import { MapsPhotosLink } from "./maps-photos-link";
import { CardTabs, CATEGORY_ICON, GoogleCredit, PhotoChip, PhotoStrip, type CardTab } from "./place-card-parts";
import { ReviewsPanel, VisitPanel } from "./place-card-panels";
import { placePhotos } from "./place-photos";
import { firstName, namedDrivers, nextFreeSlot, priceSigns, tripDays, type SlotChoice } from "./profile-format";
import { SlotPicker } from "./slot-picker";
import { useGoogleDetails, useTripPlaceProfile } from "./use-profile-data";

// The place card in the chat (Paper J1, J1b, J1c; variant A of "J1 card
// variants"): the name, three tabs (For Ana, Visit info, Reviews), a photo
// strip with chips and the actions. The same card is the recommendation in the
// thread and the place opened from the itinerary or the map (variant
// "overlay", closable). Every word is code over facts: review keywords with
// counts, the favorites and their shares, shared tags, the advisor's notes,
// and Google's facts with their source. A missing fact hides its element.

export type PlaceCardActions = {
  addToSlot: (tripPlaceId: string, day: number, slot: SlotName) => Promise<boolean>;
  removePlace: (tripPlaceId: string) => Promise<void>;
  restorePlace: (tripPlaceId: string) => Promise<void>;
};

export type PlaceCardProps = {
  card: TripPlaceCard;
  trip: TripSnapshot["trip"];
  slots: ItinerarySlot[];
  /** The slot a recommendation is for: the main action adds the place there. */
  target?: SlotTarget;
  /** A sentence of the advisor's notes on the client that names something the place is known for. */
  clientNote?: { text: string; matches: string[] };
  /** The agent's line on this place, when it weighed it. */
  verdict?: PlaceVerdict;
  variant?: "thread" | "overlay";
  onClose?: () => void;
  actions: PlaceCardActions;
  onHover?: (tripPlaceId: string | null) => void;
};

const CATEGORY_WORD: Record<Category, string> = {
  eat: "Restaurant",
  drink: "Bar",
  coffee: "Coffee",
  see: "Sight",
  stay: "Hotel",
  other: "Place",
};

export function PlaceCard({
  card,
  trip,
  slots,
  target,
  clientNote,
  verdict,
  variant = "thread",
  onClose,
  actions,
  onHover,
}: PlaceCardProps) {
  const client = firstName(trip.clientName);
  const [tab, setTab] = useState<CardTab>("for");
  const [gallery, setGallery] = useState<{ placeId: string; src: string } | null>(null);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [openedPhotosId, setOpenedPhotosId] = useState<string | null>(null);
  const photosExpanded = expandedPlaceId === card.placeId;
  const galleryId = useId();
  const moreTileRef = useRef<HTMLButtonElement>(null);
  const collapsePhotos = () => {
    setExpandedPlaceId(null);
    // The grid turns inert as it closes, so focus goes back to the tile that opened it.
    // A plain focus() would jump the thread and cut the fade off.
    const tile = moreTileRef.current;
    tile?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tile?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  };
  const { profile, failed: profileFailed } = useTripPlaceProfile(true, card.tripPlaceId);
  const place = profile?.place ?? null;
  const wantFull = tab !== "for";
  // Google starts with the profile, not after it. A place without a listing answers 404.
  const { details, full, fullLoading, basicLoading } = useGoogleDetails(card.placeId, !profile || Boolean(place?.googlePlaceId), true, wantFull);
  const profileLoading = !profile && !profileFailed;

  const photos = useMemo(
    () => placePhotos(card.name, place?.images, card.imageUrl, details?.photos, "card"),
    [place, card.imageUrl, card.name, details],
  );
  const photosLoading = basicLoading || (profileLoading && !details?.photos.length);
  const morePhotos = photosLoading ? [] : photos.slice(3);

  const neighborhood = card.neighborhood ?? place?.neighborhood ?? undefined;
  const kind = place?.kind ?? CATEGORY_WORD[card.category];
  const price = priceSigns(card.priceLevel ?? place?.priceLevel);
  const removed = card.status === "removed";

  return (
    <article
      aria-label={card.name}
      data-testid="place-card"
      data-trip-place-id={card.tripPlaceId}
      data-variant={variant}
      onMouseEnter={() => onHover?.(card.tripPlaceId)}
      onMouseLeave={() => onHover?.(null)}
      className={cn("@container rise-in flex flex-col gap-3.5", removed && "opacity-60")}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <div className="flex min-w-0 items-center gap-2.25">
          <h3 className="min-w-0 text-card-xs font-semibold text-ink">{card.name}</h3>
          {verdict?.stand === "pick" ? (
            <span className="shrink-0 rounded-pill bg-amber-dot px-2.25 text-meta leading-5.5 font-semibold text-white" data-testid="place-card-stand">
              Picked
            </span>
          ) : verdict?.stand === "backup" ? (
            <span className="shrink-0 rounded-pill bg-why px-2.25 text-meta leading-5.5 font-semibold text-amber-deep ring-1 ring-amber-dot/50 ring-inset" data-testid="place-card-stand">
              Backup
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <CardTabs value={tab} onChange={setTab} first={`For ${client}`} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the card"
              title="Close the card"
              data-testid="place-card-close"
              className="inline-flex size-9 items-center justify-center rounded-pill bg-track text-text-3 hover:bg-rule hover:text-ink"
            >
              <X aria-hidden className="size-4" strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      </div>

      {verdict ? (
        <p className="px-1 text-chat text-ink" data-testid="place-card-verdict">
          <VerdictLine verdict={verdict} />
        </p>
      ) : null}

      <div>
        <PhotoStrip
          // Google's photos are the ones the card shows. Until they arrive the
          // frames hold the chip's photo, blurred, so a tile never swaps one
          // sharp photo for a different one and never sits empty.
          photos={photosLoading ? [] : photos}
          loading={photosLoading}
          previewSrc={card.imageUrl}
          name={card.name}
          tall={variant === "overlay"}
          onDragStart={(event) => startPlaceDrag(event, card.tripPlaceId, card.category)}
          expanded={photosExpanded}
          galleryId={galleryId}
          moreTileRef={moreTileRef}
          onExpand={() => {
            setExpandedPlaceId(card.placeId);
            setOpenedPhotosId(card.placeId);
          }}
          onOpenGallery={(src) => setGallery({ placeId: card.placeId, src })}
          chips={
            <>
              <PhotoChip icon={CATEGORY_ICON[card.category]}>{kind}</PhotoChip>
              {neighborhood ? <PhotoChip icon={MapPin}>{neighborhood}</PhotoChip> : null}
              {price ? (
                <PhotoChip>
                  <span className="sr-only">Price level </span>
                  {price}
                </PhotoChip>
              ) : null}
              {card.yourPlace ? <PhotoChip icon={Bookmark}>Your place</PhotoChip> : null}
              <PlaceChips place={card} variant="photo" />
            </>
          }
        />

        {morePhotos.length > 0 ? (
          // Stays mounted so closing can play; inert keeps a closed grid out of reach.
          // Its photos wait for the first open: a closed grid is laid out, so lazy would load them all.
          <div key={card.placeId} id={galleryId} className="place-photos-reveal" data-expanded={photosExpanded} inert={!photosExpanded}>
            <div className="place-photos-clip">
              <div role="region" aria-label={`More photos of ${card.name}`} className="grid grid-cols-3 gap-1.5 pt-1.5" data-testid="place-card-gallery">
                {morePhotos.map((photo, index) => (
                  <button
                    key={`${photo.src}-${index}`}
                    type="button"
                    aria-label={`View photo ${index + 4} of ${card.name}`}
                    aria-haspopup="dialog"
                    onClick={() => setGallery({ placeId: card.placeId, src: photo.src })}
                    className="relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-lg bg-avatar focus-visible:outline-offset-[-4px]"
                  >
                    {openedPhotosId === card.placeId ? <LoadingPhoto photo={photo} sizes="240px" /> : null}
                    <GoogleCredit attributions={photo.attributions} />
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pr-1">
                <button
                  type="button"
                  data-photo-toggle
                  onClick={collapsePhotos}
                  aria-label={`Collapse photos of ${card.name}`}
                  aria-expanded={photosExpanded}
                  aria-controls={galleryId}
                  data-testid="place-card-collapse-photos"
                  className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-track pr-3.5 pl-2.75 text-ui font-semibold text-text-3 transition-colors hover:bg-rule hover:text-ink focus-visible:outline-offset-[-4px]"
                >
                  <ChevronUp aria-hidden className="size-4" strokeWidth={2.2} />
                  Collapse photos
                </button>
                {details?.photosUrl ? <MapsPhotosLink href={details.photosUrl} /> : null}
              </div>
            </div>
          </div>
        ) : null}

        {gallery?.placeId === card.placeId ? (
          <PhotoViewer photos={photos} name={card.name} initialSrc={gallery.src} photosUrl={details?.photosUrl} onClose={() => setGallery(null)} />
        ) : null}
      </div>

      {tab === "for" ? (
        <ForPanel card={card} client={client} drivers={profile?.drivers ?? []} clientNote={clientNote} />
      ) : tab === "visit" ? (
        <VisitPanel
          card={card}
          place={place}
          details={full}
          loading={profileLoading || fullLoading}
          target={target}
          trip={trip}
          client={client}
        />
      ) : (
        <ReviewsPanel
          details={full}
          loading={profileLoading || fullLoading}
          terms={[...(card.keywords ?? []).map((k) => k.name), ...(card.dishes ?? [])]}
        />
      )}

      <CardActions card={card} trip={trip} slots={slots} target={target} client={client} actions={actions} />
    </article>
  );
}

/** "People talk about" bars and the Why box (J1, "For Ana"). */
function ForPanel({
  card,
  client,
  drivers,
  clientNote,
}: {
  card: TripPlaceCard;
  client: string;
  drivers: TripPlaceProfileDriver[];
  clientNote?: { text: string; matches: string[] };
}) {
  const bars = keywordBars(card.keywords);
  const noted = new Set((clientNote?.matches ?? []).map((m) => m.toLowerCase()));
  const named = namedDrivers(card.because).slice(0, 3);
  const like = likeLine(card.because);
  const photos = new Map(drivers.map((d) => [d.entityId, d.imageUrl]));
  const tags = card.sharedTags.slice(0, 4);
  const quote = card.yourPlace?.note?.trim()
    ? { text: card.yourPlace.note.trim(), caption: "Your note" }
    : clientNote
      ? { text: clientNote.text, caption: `Your note on ${client}` }
      : null;
  const hasWhy = card.score !== undefined || named.length > 0 || tags.length > 0 || quote;
  const dishes = bars.length === 0 ? (card.dishes ?? []).slice(0, 5) : [];
  const [favorite, setFavorite] = useState<FavoriteRef | null>(null);

  if (bars.length === 0 && dishes.length === 0 && !hasWhy) {
    return <p className="px-1 text-ui text-text-2">No match details for {client} yet.</p>;
  }

  return (
    <div className="flex gap-2.5 @max-[600px]:flex-col" data-testid="place-card-for">
      {bars.length > 0 ? (
        <section className="flex grow-5 basis-0 flex-col gap-1 rounded-card bg-surface-raised px-4.5 py-4 shadow-soft">
          <h4 className="flex items-center gap-2 pb-1.5 text-ui leading-4.5 font-semibold text-text-3">
            <MessageCircle aria-hidden className="size-4 text-amber" strokeWidth={2} />
            People talk about
          </h4>
          <ul className="flex flex-col">
            {bars.map((bar) => (
              <li key={bar.name} className="flex h-8.5 items-center gap-2.5">
                <span className="flex w-37.5 shrink-0 items-center gap-2">
                  <span className="truncate text-body leading-5 font-semibold text-ink">{bar.name}</span>
                  {noted.has(bar.name.toLowerCase()) ? (
                    <span className="shrink-0 rounded-pill bg-why px-2 py-0.5 text-meta font-semibold text-amber">In your note</span>
                  ) : null}
                </span>
                <span className="flex h-2 grow rounded-pill bg-track" aria-hidden>
                  <span className={cn("h-2 rounded-pill", bar.top ? "bg-amber-dot" : "bg-glow")} style={{ width: `${bar.width}%` }} />
                </span>
                <span className="w-9 shrink-0 text-right text-ui leading-4.5 font-medium text-text-3">
                  {bar.count}
                  <span className="sr-only"> reviews</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : dishes.length > 0 ? (
        <section className="flex grow-5 basis-0 flex-col gap-2 rounded-card bg-surface-raised px-4.5 py-4 shadow-soft">
          <h4 className="flex items-center gap-2 pb-1 text-ui leading-4.5 font-semibold text-text-3">
            <Utensils aria-hidden className="size-4 text-amber" strokeWidth={2} />
            Known for
          </h4>
          <ul className="flex flex-col gap-1.5">
            {dishes.map((dish) => (
              <li key={dish} className="flex items-center gap-2 text-body text-ink">
                <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-amber-dot" />
                {dish}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasWhy ? (
        <section
          aria-label={`Why ${client}`}
          className={cn("flex basis-0 flex-col gap-2.75 rounded-card bg-why px-4.5 py-4", bars.length || dishes.length ? "grow-3" : "grow")}
        >
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-body leading-5 font-semibold text-ink">
              <Heart aria-hidden className="size-4 text-amber" strokeWidth={2} />
              Why {client}
            </h4>
            {card.score !== undefined ? (
              <p className="flex items-baseline gap-1.25" data-testid="place-card-score">
                <span className="font-display text-match-score tracking-[-0.03em] text-ink">{card.score}</span>
                <span className="text-meta font-medium tracking-[0.14em] text-amber uppercase">match</span>
              </p>
            ) : null}
          </div>
          {like ? <p className="text-body leading-5 text-ink" data-testid="place-card-like">{like}</p> : null}
          {named.map((driver) => {
            const photo = photos.get(driver.entityId);
            const avatar = photo ? (
              <span className="relative size-7.5 shrink-0 overflow-hidden rounded-pill bg-avatar">
                <FilmImage src={photo} alt="" sizes="30px" unoptimized />
              </span>
            ) : (
              <span aria-hidden className="flex size-7.5 shrink-0 items-center justify-center rounded-pill bg-avatar font-display text-ui text-text-2">
                {driver.name[0]}
              </span>
            );
            return (
              <div key={driver.entityId} className="flex items-center gap-2.5">
                {driver.media ? (
                  <span className="flex min-w-0 grow items-center gap-2.5">
                    {avatar}
                    <span className="min-w-0 truncate text-body leading-5 font-semibold text-ink">{driver.name}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setFavorite({ entityId: driver.entityId, name: driver.name })}
                    data-testid="favorite-open"
                    className="group flex min-w-0 grow cursor-pointer items-center gap-2.5 rounded-pill text-left"
                  >
                    {avatar}
                    <span className="min-w-0 truncate text-body leading-5 font-semibold text-ink underline decoration-ink/30 underline-offset-2 group-hover:decoration-ink">
                      {driver.name}
                    </span>
                  </button>
                )}
                <span className="flex h-1.5 w-14 shrink-0 rounded-pill bg-ink/8" aria-hidden>
                  <span className="h-1.5 rounded-pill bg-amber" style={{ width: `${Math.max(4, driver.share)}%` }} />
                </span>
                <span className="w-9 shrink-0 text-right text-body leading-5 font-medium text-amber">{driver.share}%</span>
              </div>
            );
          })}
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Shared taste">
              {tags.map((tag) => (
                <li key={tag.tagId} className="rounded-pill bg-white/65 px-2.5 py-1 text-ui-sm leading-4.25 text-text-3">
                  {tag.name}
                </li>
              ))}
            </ul>
          ) : null}
          {quote ? (
            <figure className="flex flex-col gap-0.5 border-t border-amber/15 pt-2.25">
              <blockquote className="flex items-start gap-2">
                <Quote aria-hidden className="mt-1 size-3.5 shrink-0 fill-amber text-amber" strokeWidth={0} />
                <p className="font-display text-note-quote text-ink italic">{quote.text}</p>
              </blockquote>
              <figcaption className="pl-5.5 text-meta text-amber">{quote.caption}</figcaption>
            </figure>
          ) : null}
        </section>
      ) : null}

      <FavoritePlaceSheet favorite={favorite} client={client} onClose={() => setFavorite(null)} />
    </div>
  );
}

function CardActions({
  card,
  trip,
  slots,
  target: asked,
  client,
  actions,
}: {
  card: TripPlaceCard;
  trip: TripSnapshot["trip"];
  slots: ItinerarySlot[];
  target?: SlotTarget;
  client: string;
  actions: PlaceCardActions;
}) {
  // A search aimed at a slot can turn up a place that slot may not hold: the picker offers the ones that fit.
  const target = asked && slotHolds(asked.slot, card.category) ? asked : undefined;
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const days = useMemo(() => tripDays(trip, slots), [trip, slots]);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const current = slots.find((s) => s.tripPlaceId === card.tripPlaceId);
  const picked: SlotChoice = target
    ? { day: target.day, slot: target.slot }
    : (choice ?? (current ? { day: current.day, slot: current.slot } : nextFreeSlot(card.category, days, slots)));
  const inTarget = Boolean(current && current.day === picked.day && current.slot === picked.slot);
  const isStay = picked.slot === "stay";

  if (card.status === "removed") {
    return (
      <div className="flex items-center gap-3 px-1" role="status">
        <p className="text-ui text-text-2">Off the list for {client}.</p>
        <button
          type="button"
          onClick={() => void actions.restorePlace(card.tripPlaceId)}
          className="text-ui font-semibold text-ink underline decoration-ink/40 underline-offset-2"
        >
          Undo
        </button>
      </div>
    );
  }

  const add = async () => {
    setBusy("add");
    try {
      await actions.addToSlot(card.tripPlaceId, picked.day, picked.slot);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("remove");
    try {
      await actions.removePlace(card.tripPlaceId);
    } finally {
      setBusy(null);
    }
  };

  const addLabel = target
    ? isStay
      ? `Set as ${target.label}`
      : `Add to ${target.label}`
    : "Add to itinerary";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="place-card-actions">
      {!target ? <SlotPicker value={picked} onChange={setChoice} days={days} slots={slots} category={card.category} tripPlaceId={card.tripPlaceId} /> : null}
      {inTarget ? (
        <span className="inline-flex h-10 items-center gap-2 rounded-pill bg-why px-4 text-ui font-semibold text-amber" data-testid="place-card-added">
          <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
          {target ? `In ${target.label}` : "In the itinerary"}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy !== null}
          data-testid="place-card-add"
          className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink px-4 text-ui font-semibold text-white transition-colors hover:bg-text-4 disabled:opacity-60"
        >
          <Plus aria-hidden className="size-3.5" strokeWidth={2.4} />
          {addLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy !== null}
        data-testid="place-card-remove"
        className="inline-flex h-10 items-center rounded-pill border border-ink/55 px-4 text-ui font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-60"
      >
        Not for {client}
      </button>
    </div>
  );
}
