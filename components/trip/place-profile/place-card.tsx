"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  BedDouble,
  Bookmark,
  Check,
  Clock,
  Coffee,
  Heart,
  Landmark,
  MapPin,
  MessageCircle,
  Plus,
  Quote,
  Star,
  Utensils,
  Wine,
  X,
} from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { likeLine } from "@/lib/agent/taste-overlap";
import type { Category, ItinerarySlot, SlotName, SlotTarget, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import type { GoogleAttribution } from "@/lib/google/contracts";
import type { TripPlaceProfileDriver } from "@/lib/trips/profile-types";
import { cn } from "@/lib/ui/cn";

import { startPlaceDrag } from "../workspace/dnd";

import { PlaceChips } from "../place-chips";

import { PhotoViewer } from "./photo-viewer";
import { LoadingPhoto } from "./loading-photo";
import { keywordBars, shortAuthor } from "./card-format";
import { ReviewsPanel, VisitPanel } from "./place-card-panels";
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
  variant?: "thread" | "overlay";
  onClose?: () => void;
  actions: PlaceCardActions;
  onHover?: (tripPlaceId: string | null) => void;
};

type Tab = "for" | "visit" | "reviews";

export type CardPhoto = { src: string; alt: string; attributions?: GoogleAttribution[] };

const CATEGORY_ICON: Record<Category, typeof Utensils> = {
  eat: Utensils,
  drink: Wine,
  coffee: Coffee,
  see: Landmark,
  stay: BedDouble,
  other: MapPin,
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
  variant = "thread",
  onClose,
  actions,
  onHover,
}: PlaceCardProps) {
  const client = firstName(trip.clientName);
  const [tab, setTab] = useState<Tab>("for");
  const [gallery, setGallery] = useState<{ placeId: string; src: string } | null>(null);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const photosExpanded = expandedPlaceId === card.placeId;
  const { profile, failed: profileFailed } = useTripPlaceProfile(true, card.tripPlaceId);
  const place = profile?.place ?? null;
  const wantFull = tab !== "for";
  const { details, full, fullLoading, basicLoading } = useGoogleDetails(card.placeId, Boolean(place?.googlePlaceId), true, wantFull);

  const photos = useMemo<CardPhoto[]>(() => {
    const provider = (place?.images.length ? place.images : card.imageUrl ? [{ url: card.imageUrl }] : []).map((image, i) => ({
      src: image.url,
      alt: `${card.name}, photo ${i + 1}`,
    }));
    const google = (details?.photos ?? []).map((photo, i) => ({
      src: photo.url,
      alt: `${card.name}, photo ${provider.length + i + 1}`,
      attributions: photo.attributions,
    }));
    return [...provider, ...google];
  }, [place, card.imageUrl, card.name, details]);

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
        <h3 className="min-w-0 text-card-xs font-semibold text-ink">{card.name}</h3>
        <div className="flex items-center gap-2">
          <CardTabs value={tab} onChange={setTab} client={client} />
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

      <div>
        <PhotoStrip
          photos={photos}
          loading={(!profile && !profileFailed) || basicLoading}
          name={card.name}
          tall={variant === "overlay"}
          tripPlaceId={card.tripPlaceId}
          expanded={photosExpanded}
          onExpand={() => setExpandedPlaceId(card.placeId)}
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

        {photosExpanded ? (
          <div role="region" aria-label={`More photos of ${card.name}`} className="mt-1.5 grid grid-cols-3 gap-1.5" data-testid="place-card-gallery">
            {photos.slice(3).map((photo, index) => (
              <button
                key={`${photo.src}-${index}`}
                type="button"
                aria-label={`View photo ${index + 4} of ${card.name}`}
                aria-haspopup="dialog"
                onClick={() => setGallery({ placeId: card.placeId, src: photo.src })}
                className="relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-lg bg-avatar focus-visible:outline-offset-[-4px]"
              >
                <LoadingPhoto photo={photo} sizes="240px" />
                <GoogleCredit attributions={photo.attributions} />
              </button>
            ))}
          </div>
        ) : null}

        {gallery?.placeId === card.placeId ? (
          <PhotoViewer photos={photos} name={card.name} initialSrc={gallery.src} onClose={() => setGallery(null)} />
        ) : null}
      </div>

      {tab === "for" ? (
        <ForPanel card={card} client={client} drivers={profile?.drivers ?? []} clientNote={clientNote} />
      ) : tab === "visit" ? (
        <VisitPanel
          card={card}
          place={place}
          details={full}
          loading={fullLoading}
          target={target}
          trip={trip}
          client={client}
        />
      ) : (
        <ReviewsPanel
          details={full}
          loading={fullLoading}
          terms={[...(card.keywords ?? []).map((k) => k.name), ...(card.dishes ?? [])]}
        />
      )}

      <CardActions card={card} trip={trip} slots={slots} target={target} client={client} actions={actions} />
    </article>
  );
}

function PhotoChip({ icon: Icon, children }: { icon?: typeof Utensils; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-photo-chip py-1.5 pr-2.75 pl-2.25 text-ui-sm leading-4 font-semibold text-white">
      {Icon ? <Icon aria-hidden className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

function GoogleCredit({ attributions }: { attributions?: GoogleAttribution[] }) {
  const author = shortAuthor(attributions?.[0]?.displayName);
  if (!attributions) return null;
  return (
    <span className="absolute right-2 bottom-2 rounded-pill bg-photo-chip px-2 py-0.5 text-meta font-medium text-white">
      Google{author ? ` · ${author}` : ""}
    </span>
  );
}

/** Photo frames reserve space while details load and open the selected image. */
function PhotoStrip({ photos, loading, name, tall, chips, tripPlaceId, onOpenGallery, expanded, onExpand }: {
  photos: CardPhoto[];
  loading: boolean;
  name: string;
  tall: boolean;
  chips: ReactNode;
  tripPlaceId: string;
  onOpenGallery: (src: string) => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const slotCount = loading ? 3 : Math.min(photos.length, 3);
  const onDragStart = (event: DragEvent) => startPlaceDrag(event, tripPlaceId);
  const height = tall ? "h-62" : "h-50";

  if (slotCount === 0) {
    return (
      <div draggable onDragStart={onDragStart} className={cn("relative flex items-end rounded-photo bg-avatar p-3.5", height)}>
        <span className="absolute inset-0 flex items-center justify-center font-display text-card-md text-text-2">{name[0]}</span>
        <div className="relative flex flex-wrap gap-1.5">{chips}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 gap-1.5", height)} draggable onDragStart={onDragStart} data-testid="place-card-photos">
      {Array.from({ length: slotCount }, (_, index) => {
        const photo = photos[index];
        const hasMore = index === 2 && photos.length > 3 && !expanded;
        return (
          <button
            key={index}
            type="button"
            disabled={!photo}
            onClick={() => {
              if (hasMore) onExpand();
              else if (photo) onOpenGallery(photo.src);
            }}
            aria-label={hasMore ? `Open more photos of ${name}` : `View photo ${index + 1} of ${name}`}
            aria-haspopup={hasMore ? undefined : "dialog"}
            aria-expanded={hasMore ? false : undefined}
            className={cn(
              "relative overflow-hidden bg-avatar text-left focus-visible:outline-offset-[-4px]",
              hasMore ? "cursor-pointer" : "enabled:cursor-zoom-in",
              slotCount === 1 ? "w-full rounded-photo" : index === 0 ? "w-[52%] shrink-0 rounded-l-photo rounded-r-lg" :
                index === slotCount - 1 ? "min-w-0 grow rounded-l-lg rounded-r-photo" : "w-[27.5%] shrink-0 rounded-lg",
            )}
          >
            <LoadingPhoto key={photo?.src ?? "pending"} photo={photo} sizes={index === 0 ? "380px" : "200px"} />
            {hasMore ? (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/50 px-2 text-center text-white">
                <span className="text-card-xs font-semibold">+{photos.length - 3}</span>
                <span className="text-ui-sm font-semibold">Open more photos</span>
              </span>
            ) : null}
            <GoogleCredit attributions={photo?.attributions} />
            {index === 0 ? <span className="absolute bottom-3.5 left-3.5 flex flex-wrap gap-1.5">{chips}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function CardTabs({ value, onChange, client }: { value: Tab; onChange: (tab: Tab) => void; client: string }) {
  const tabs: { value: Tab; label: string; icon: typeof Heart }[] = [
    { value: "for", label: `For ${client}`, icon: Heart },
    { value: "visit", label: "Visit info", icon: Clock },
    { value: "reviews", label: "Reviews", icon: Star },
  ];
  return (
    <div role="tablist" aria-label="Place details" className="flex items-center gap-0.5 rounded-pill bg-track p-0.75">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`place-card-tab-${tab.value}`}
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-ui leading-4.5 transition-colors",
              selected ? "bg-surface-raised font-semibold text-ink shadow-soft" : "font-medium text-text-3 hover:text-ink",
            )}
          >
            <Icon aria-hidden className={cn("size-3.5", selected && tab.value === "for" && "text-amber")} strokeWidth={2.2} />
            {tab.label}
          </button>
        );
      })}
    </div>
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
            return (
              <div key={driver.entityId} className="flex items-center gap-2.5">
                {photo ? (
                  <span className="relative size-7.5 shrink-0 overflow-hidden rounded-pill bg-avatar">
                    <FilmImage src={photo} alt="" sizes="30px" unoptimized />
                  </span>
                ) : (
                  <span aria-hidden className="flex size-7.5 shrink-0 items-center justify-center rounded-pill bg-avatar font-display text-ui text-text-2">
                    {driver.name[0]}
                  </span>
                )}
                <span className="min-w-0 grow truncate text-body leading-5 font-semibold text-ink">{driver.name}</span>
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
    </div>
  );
}

function CardActions({
  card,
  trip,
  slots,
  target,
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
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const days = useMemo(() => tripDays(trip, slots), [trip, slots]);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const current = slots.find((s) => s.tripPlaceId === card.tripPlaceId);
  const picked: SlotChoice = target ? { day: target.day, slot: target.slot } : (choice ?? nextFreeSlot(card.category, days, slots));
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
