"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Plus, X } from "lucide-react";

import type { PlaceProfileProps } from "@/components/trip/contracts";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StarGlyph } from "@/components/ui/match-pill";
import { Pill } from "@/components/ui/pill";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { TripPlaceProfile } from "@/lib/trips/profile-types";
import { cn } from "@/lib/ui/cn";

import { HoursAndContact, Reviews } from "./profile-details";
import {
  currentSlotOf,
  directionsUrl,
  firstName,
  formatCount,
  googleHoursRows,
  nextFreeSlot,
  openState,
  priceSigns,
  providerHoursRows,
  shortAddress,
  slotChoiceLabel,
  telHref,
  tripDays,
  type SlotChoice,
} from "./profile-format";
import { PhotoViewer } from "./photo-viewer";
import { placePhotos } from "./place-photos";
import { PhotoStrip, ProfilePhotos } from "./profile-photos";
import { WhyBlock } from "./profile-why";
import { YourPick } from "./profile-your-pick";
import { SlotPicker } from "./slot-picker";
import { useGoogleDetails, useTripPlaceProfile } from "./use-profile-data";

// The place profile sheet (Paper 03 and 03b): a 1224 x 868 sheet over the
// scrim. Left, the photos; right, a scroll column (name, why, your pick,
// about, hours and contact, reviews) with the actions pinned below it. Once
// the title scrolls out, a compact header (name, score, close) takes its
// place. The card comes from the workspace store; the rest of the place
// loads from /api/trip-places/<id>, Google basic details when the sheet
// opens and the full tier when the Hours section scrolls into view.

export type PlaceProfileSheetProps = PlaceProfileProps & {
  /** Optional: the profile already loaded on the server (skips the first fetch). */
  initialProfile?: TripPlaceProfile;
};

export function PlaceProfile(props: PlaceProfileSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} label={props.card.name} className="overflow-hidden!">
      <PlaceProfileBody key={props.card.tripPlaceId} {...props} />
    </Sheet>
  );
}

function PlaceProfileBody({
  trip,
  card,
  clientName,
  slots,
  open,
  onClose,
  onAddToSlot,
  onRemove,
  onToggleMyPlace,
  onEditNote,
  initialProfile,
}: PlaceProfileSheetProps) {
  const client = firstName(clientName);
  const { profile, failed, refresh } = useTripPlaceProfile(open, card.tripPlaceId, initialProfile);
  const place = profile?.place ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const hoursRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [wantFull, setWantFull] = useState(false);

  const { details, full } = useGoogleDetails(card.placeId, Boolean(place?.googlePlaceId), open, wantFull);

  // The compact header shows once the title has scrolled out of the column.
  useEffect(() => {
    const root = scrollRef.current;
    const title = titleRef.current;
    if (!root || !title) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { root, threshold: 0 });
    observer.observe(title);
    return () => observer.disconnect();
  }, []);

  // Google's full tier (hours, rating, reviews) only once Hours is in view.
  useEffect(() => {
    const root = scrollRef.current;
    const section = hoursRef.current;
    if (!root || !section || wantFull) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setWantFull(true);
      },
      { root, rootMargin: "0px 0px 120px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [wantFull, place]);

  // Photos: the provider's until Google's load, then Google's alone.
  const photos = useMemo(
    () => placePhotos(card.name, place?.images, card.imageUrl, details?.photos),
    [place, card.imageUrl, card.name, details],
  );
  const [stripOpen, setStripOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  // "In my places" and "Your pick".
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const saved = savedOverride ?? Boolean(card.yourPlace || profile?.advisorPlace);
  const advisorPlaceId = card.yourPlace?.advisorPlaceId ?? profile?.advisorPlace?.id;
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const note = noteOverride ?? card.yourPlace?.note ?? profile?.advisorPlace?.note ?? "";
  const showPick = saved && Boolean(card.yourPlace || profile?.advisorPlace);

  // Slot picker.
  const days = useMemo(() => tripDays(trip, slots), [trip, slots]);
  const current = currentSlotOf(card.tripPlaceId, slots);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const selected = choice ?? current ?? nextFreeSlot(card.category, days, slots);
  const alreadyThere = current !== null && current.day === selected.day && current.slot === selected.slot;

  const [busy, setBusy] = useState<"add" | "remove" | "save" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "add" | "remove" | "save", action: () => Promise<void> | void, failure: string) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      console.warn("[place-profile]", cause);
      setError(failure);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function toggleSaved(next: boolean) {
    setSavedOverride(next);
    const ok = await run("save", () => onToggleMyPlace(card.tripPlaceId, next), "Your places did not update. Try again.");
    if (!ok) setSavedOverride(!next);
    else refresh();
  }

  async function addToSlot() {
    await run(
      "add",
      () => onAddToSlot(card.tripPlaceId, selected.day, selected.slot),
      "The itinerary did not update. Try again.",
    );
  }

  async function removeAndReplace() {
    const ok = await run("remove", () => onRemove(card.tripPlaceId, true), "The place was not removed. Try again.");
    if (ok) onClose();
  }

  const meta = [place?.kind, card.neighborhood ?? place?.neighborhood].filter(Boolean).join(" · ");
  const street = shortAddress(card.address ?? place?.address);
  const price = priceSigns(place?.priceLevel ?? details?.priceLevel);
  const rating = full?.rating ?? place?.rating ?? undefined;
  const open_ = full ? openState({ openNow: full.openNow, openingHours: full.openingHours, utcOffsetMinutes: full.utcOffsetMinutes }) : null;

  const hours = full?.openingHours?.length
    ? googleHoursRows(full.openingHours, days)
    : providerHoursRows(place?.hours ?? [], days);
  const address = full?.address ?? details?.address ?? place?.address ?? card.address ?? null;
  const website = full?.website ?? place?.website ?? null;
  const phone = full?.phone ?? place?.phone ?? null;

  const aboutParagraphs = [place?.shortDescription, ...(place?.aboutParagraphs ?? [])].filter(
    (p): p is string => Boolean(p),
  );

  return (
    <div className="relative flex h-full gap-10 py-5 pr-9 pl-5">
      <div className="h-full w-[min(580px,50%)] shrink-0">
        <ProfilePhotos onOpenPhoto={setViewerSrc} photos={photos} name={card.name} scrolled={compact} onSeeAll={() => setStripOpen(true)} />
      </div>

      <div className="relative flex min-w-0 grow flex-col">
        {compact ? (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-rule-strong bg-surface pt-1 pb-4">
            <p className="flex min-w-0 items-baseline gap-3.5">
              <span className="truncate font-display text-section text-ink">{card.name}</span>
              {card.score !== undefined ? (
                <span className="shrink-0 text-ui font-semibold text-ink">{card.score} match</span>
              ) : null}
            </p>
            <IconButton label="Close" icon={<X size={16} strokeWidth={2.2} />} variant="soft" onClick={onClose} />
          </div>
        ) : null}

        <div ref={scrollRef} className="-mr-4 min-h-0 flex-1 overflow-y-auto pt-4 pr-4 pb-6">
          <div className="flex flex-col gap-[26px]">
            <header className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <p className="grow text-ui font-medium text-text-muted">{meta}</p>
                <Switch
                  variant="pill"
                  label="In my places"
                  checked={saved}
                  disabled={busy === "save"}
                  onCheckedChange={(next) => void toggleSaved(next)}
                />
                <IconButton label="Close" icon={<X size={16} strokeWidth={2.2} />} variant="soft" onClick={onClose} />
              </div>
              <h2 ref={titleRef} className="font-display text-place leading-[70px] text-ink">
                {card.name}
              </h2>
              <ul className="flex flex-wrap items-center gap-x-[18px] gap-y-1 pt-1 text-ui text-text-3">
                {street ? (
                  <li className="flex items-center gap-1.5">
                    <MapPin size={15} strokeWidth={2} aria-hidden className="text-text-muted" />
                    {street}
                  </li>
                ) : null}
                {price ? (
                  <li>
                    <span className="sr-only">Price level </span>
                    {price}
                  </li>
                ) : null}
                {rating !== undefined ? (
                  <li className="flex items-center gap-1.5">
                    <StarGlyph size={14} className="text-ink" />
                    <span className="font-semibold text-ink">{rating.toFixed(1)}</span>
                    {full?.ratingCount !== undefined ? <span>({formatCount(full.ratingCount)} reviews)</span> : null}
                  </li>
                ) : null}
                {open_ ? (
                  <li className="flex items-center gap-1.5 font-medium">
                    <span aria-hidden className={cn("size-[7px] rounded-pill", open_.open ? "bg-green" : "bg-text-2")} />
                    <span className={open_.open ? "text-green" : "text-text-2"}>{open_.text}</span>
                  </li>
                ) : null}
              </ul>
            </header>

            <WhyBlock
              clientFirstName={client}
              score={card.score}
              because={card.because}
              sharedTags={card.sharedTags}
              drivers={profile?.drivers ?? []}
            />

            {showPick ? (
              <YourPick
                note={note}
                savedAt={profile?.advisorPlace?.savedAt}
                inTrips={profile?.advisorPlace?.inTrips}
                onSaveNote={
                  onEditNote && advisorPlaceId
                    ? async (next) => {
                        await onEditNote(advisorPlaceId, next);
                        setNoteOverride(next);
                      }
                    : undefined
                }
              />
            ) : null}

            {aboutParagraphs.length > 0 || (place?.features.length ?? 0) > 0 ? (
              <section className="flex flex-col gap-3">
                <h3 className="label-caps leading-[14px] text-ink">About</h3>
                <div className="flex flex-col gap-3">
                  {aboutParagraphs.map((paragraph, i) => (
                    <p key={i} className="text-body leading-[23px] text-text-4">
                      {paragraph}
                    </p>
                  ))}
                </div>
                {place && place.features.length > 0 ? (
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {place.features.map((feature) => (
                      <li key={feature}>
                        <Pill>{feature}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : failed ? (
              <p className="text-ui text-text-2">The place details did not load. Close the profile and open it again.</p>
            ) : null}

            {place ? (
              <HoursAndContact
                sectionRef={hoursRef}
                hours={hours}
                address={address}
                directionsHref={directionsUrl(card.name, place.googlePlaceId, address)}
                website={website}
                phoneHref={phone ? telHref(phone) : null}
              />
            ) : null}

            {place?.googlePlaceId ? <Reviews details={full} loading={wantFull && !full} /> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 pt-3 pb-3">
          {confirmRemove ? (
            <div className="flex items-center gap-2.5" role="group" aria-label={`Not for ${client}`}>
              <p className="grow text-body text-text-3">
                <span className="font-semibold text-ink">Not for {client}?</span> We will suggest a replacement.
              </p>
              <Button size="lg" onClick={() => void removeAndReplace()} loading={busy === "remove"}>
                Remove and replace
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setConfirmRemove(false)} disabled={busy === "remove"}>
                Keep it
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <SlotPicker
                value={selected}
                onChange={setChoice}
                days={days}
                slots={slots}
                category={card.category}
                tripPlaceId={card.tripPlaceId}
              />
              <Button
                size="lg"
                className="grow"
                icon={alreadyThere ? <Check size={16} strokeWidth={2.4} /> : <Plus size={16} strokeWidth={2.4} />}
                onClick={() => void addToSlot()}
                loading={busy === "add"}
                disabled={alreadyThere}
              >
                {alreadyThere ? `In ${slotChoiceLabel(selected)}` : "Add to itinerary"}
              </Button>
              <Button size="lg" variant="ghost" className="px-4" onClick={() => setConfirmRemove(true)}>
                Not for {client}
              </Button>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-ui-sm text-amber">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {viewerSrc && open ? <PhotoViewer photos={photos} name={card.name} initialSrc={viewerSrc} photosUrl={details?.photosUrl} onClose={() => setViewerSrc(null)} /> : null}
      {stripOpen ? <PhotoStrip onOpenPhoto={setViewerSrc} photos={photos} name={card.name} photosUrl={details?.photosUrl} onClose={() => setStripOpen(false)} /> : null}
    </div>
  );
}
