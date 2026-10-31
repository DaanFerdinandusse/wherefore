"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Expand, Heart, X } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import type { SlotName, TripPlaceCard } from "@/lib/contracts";
import { isOpenSlot } from "@/lib/trips/day-parts";
import { cn } from "@/lib/ui/cn";

import { FavoritePlaceSheet, type FavoriteRef } from "../place-profile/favorite-place";
import { firstName } from "../place-profile/profile-format";
import { useTripStore } from "../store";
import { VerdictLine } from "../verdict-line";
import { startPlaceDrag, startSlotDrag } from "../workspace/dnd";
import { SLOT_LABELS } from "../workspace/format";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import {
  advisorNote,
  CATEGORY_NOUN,
  findingLabel,
  slotReasons,
  subLine,
  suggestionHint,
  tasteBadges,
  type PartDrop,
  type SlotReasons,
  type SlotView,
} from "./itinerary-model";
import { useSlotDrop } from "./slot-drop";

// One slot of a day. Every state shares the same columns (slot, photo, what is
// in it) so a day reads as a list of what is added and what is still open. A
// row holds the name, the type line and taste badges. The photo opens the
// place card (store.select); the rest of the row opens the reasons beneath it
// like an accordion. Every row takes a dropped place.

const COLUMNS =
  "grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 py-2 pr-2 pl-3 @[440px]:grid-cols-[84px_88px_minmax(0,1fr)_auto] @[440px]:gap-x-3.5 @[440px]:pl-4";

/** The slot name: its own column, or above the name when the panel is narrow. */
function SlotLabel({ slot, label, inline = false, className }: { slot: SlotName; label?: string; inline?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "label-caps font-semibold tracking-[0.12em]",
        inline ? "pb-0.5 @[440px]:hidden" : "hidden @[440px]:block",
        className ?? "text-text-2",
      )}
    >
      {label ?? SLOT_LABELS[slot]}
    </span>
  );
}

function ReasonsHeading({ children }: { children: string }) {
  return <h5 className="text-ui-sm leading-[18px] font-semibold text-ink">{children}</h5>;
}

/** The page under a row: why the place was recommended, then the way into the full card. */
function ReasonsPage({ reasons, client, onViewDetails }: { reasons: SlotReasons; client: string; onViewDetails: () => void }) {
  const { favorites, like, order, mentions, note } = reasons;
  const [favorite, setFavorite] = useState<FavoriteRef | null>(null);
  return (
    <div className="mx-2 mb-2 flex flex-col gap-3 rounded-row bg-why px-3.5 py-3 @[440px]:ml-[114px]">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-ui-sm leading-4 font-semibold text-ink">
          <Heart size={14} strokeWidth={2} aria-hidden className="text-amber" />
          {reasons.title}
        </p>
        {reasons.score !== undefined ? <p className="text-ui-sm leading-4 font-semibold text-amber">{reasons.score} match</p> : null}
      </div>
      {note ? (
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-[18px] leading-[22px] tracking-normal text-ink italic">&ldquo;{note.text}&rdquo;</p>
          <p className="text-meta text-amber-deep">{note.label}</p>
        </div>
      ) : null}
      {like ? <p className="text-ui-sm leading-[18px] text-ink">{like}</p> : null}
      <div className="grid gap-x-5 gap-y-3 @[540px]:grid-cols-2">
        {favorites.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <ReasonsHeading>Fans of</ReasonsHeading>
            {favorites.map((item) => {
              const avatar = item.imageUrl ? (
                <span className="relative size-[18px] shrink-0 overflow-hidden rounded-pill bg-avatar">
                  <FilmImage src={item.imageUrl} alt="" sizes="18px" />
                </span>
              ) : (
                <Heart size={14} strokeWidth={2} aria-hidden className="shrink-0 text-amber-deep" />
              );
              return (
                <div key={item.entityId} className="flex items-center gap-2 text-ui-sm leading-[18px] text-ink">
                  {item.media ? (
                    <span className="flex min-w-0 grow items-center gap-2">
                      {avatar}
                      <span className="min-w-0 truncate">{item.name}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setFavorite({ entityId: item.entityId, name: item.name })}
                      data-testid="favorite-open"
                      className="group flex min-w-0 grow cursor-pointer items-center gap-2 text-left"
                    >
                      {avatar}
                      <span className="min-w-0 truncate underline decoration-ink/30 underline-offset-2 group-hover:decoration-ink">{item.name}</span>
                    </button>
                  )}
                  <span aria-hidden className="flex h-1.5 w-9 shrink-0 rounded-pill bg-ink/8">
                    <span className="h-1.5 rounded-pill bg-amber" style={{ width: `${Math.max(4, item.share)}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-medium text-amber-deep">{item.share}%</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {order.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1">
            <ReasonsHeading>Order</ReasonsHeading>
            <ul className="flex flex-col gap-1">
              {order.map((item) => (
                <li key={item} className="flex items-center gap-2 text-ui-sm leading-[18px] text-ink">
                  <span aria-hidden className="size-[5px] shrink-0 rounded-pill bg-amber-dot" />
                  <span className="min-w-0 truncate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {mentions.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1 @[540px]:col-span-2">
            <ReasonsHeading>From the reviews</ReasonsHeading>
            <p className="text-ui-sm leading-[18px] text-ink">{mentions.join(". ")}.</p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onViewDetails}
        className="cursor-pointer self-start text-ui-sm leading-4 font-semibold text-ink underline decoration-ink/40 underline-offset-2 hover:decoration-ink"
      >
        View full details
      </button>
      <FavoritePlaceSheet favorite={favorite} client={client} onClose={() => setFavorite(null)} />
    </div>
  );
}

type PlaceRowProps = {
  view: SlotView & { card: TripPlaceCard };
  clientName: string;
  countryCode?: string;
  favoriteImages: Map<string, string>;
  actions: WorkspaceActions;
};

function PlaceRow({ view, clientName, countryCode, favoriteImages, actions }: PlaceRowProps) {
  const { card, verdict } = view;
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const lit = useTripStore((s) => s.highlightedPlaceId === card.tripPlaceId || s.selectedPlaceId === card.tripPlaceId);
  const ref = { day: view.day, slot: view.slot, position: view.position };
  const drop = useSlotDrop(ref, actions);
  const [open, setOpen] = useState(false);
  const reasonsId = useId();
  const reasons = slotReasons(card, clientName, { slotNote: view.row, favoriteImages });
  const badges = tasteBadges(card);
  const where = `Day ${view.day} ${SLOT_LABELS[view.slot].toLowerCase()}`;
  const viewDetails = () => select(card.tripPlaceId);
  // The part's header names the time, so a row in its open slot says what the place is.
  const inOpenSlot = isOpenSlot(view.slot);
  const label = inOpenSlot ? CATEGORY_NOUN[card.category] : undefined;
  const sub = subLine(card, countryCode, { noun: !inOpenSlot });

  return (
    <li
      {...drop.handlers}
      onMouseEnter={() => setHighlight(card.tripPlaceId)}
      onMouseLeave={() => setHighlight(null)}
      className={cn(
        "transition-[background-color,opacity] duration-200",
        drop.over && "bg-why/70 outline-2 -outline-offset-2 outline-glow outline-dashed",
      )}
    >
      <div
        draggable
        onDragStart={(e) => {
          startSlotDrag(e, ref);
          startPlaceDrag(e, card.tripPlaceId, card.category);
        }}
        className="group/row relative transition-colors hover:bg-surface-hover"
      >
        {/* The whole row works the arrow; the photo and the clear button sit above it. */}
        <button
          type="button"
          onClick={reasons ? () => setOpen(!open) : viewDetails}
          aria-expanded={reasons ? open : undefined}
          aria-controls={reasons ? reasonsId : undefined}
          aria-label={reasons ? `${open ? "Hide" : "Show"} why ${card.name} was recommended` : `View ${card.name} details`}
          className="absolute inset-0 z-0 cursor-pointer"
        />
        <div className={cn(COLUMNS, "pointer-events-none relative [&_button]:pointer-events-auto")}>
          <SlotLabel slot={view.slot} label={label} />
          <button
            type="button"
            onClick={viewDetails}
            aria-label={`View ${card.name} details`}
            className={cn(
              "group/photo relative h-14 cursor-pointer overflow-hidden rounded-[10px] bg-avatar @[440px]:h-[66px]",
              lit && "glow-ring",
            )}
          >
            {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="88px" /> : null}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-ink/35 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"
            >
              <Expand size={16} strokeWidth={2} />
            </span>
          </button>
          <div className="flex min-w-0 flex-col">
            <SlotLabel slot={view.slot} label={label} inline />
            <h5 className="truncate text-body leading-5 font-semibold text-ink">{card.name}</h5>
            {sub ? <p className="truncate text-ui-sm leading-[17px] text-text-3">{sub}</p> : null}
            {verdict ? (
              <VerdictLine verdict={verdict} className="line-clamp-2 text-ui-sm leading-[17px] text-text-3" />
            ) : badges.length > 0 ? (
              <ul aria-label="Shared taste" className="mt-1 flex h-[22px] flex-wrap gap-1 overflow-hidden">
                {badges.map((badge) => (
                  <li key={badge} className="rounded-pill bg-why px-2 text-meta leading-[22px] font-medium text-amber-deep">
                    {badge}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            {verdict ? (
              <span
                data-testid="slot-verdict"
                className={cn(
                  "mr-0.5 shrink-0 rounded-pill px-2 text-meta leading-5.5 font-semibold whitespace-nowrap",
                  verdict.catch ? "bg-why text-amber-deep" : "bg-amber-dot text-white",
                )}
              >
                {verdict.catch ? "One catch" : "Perfect fit"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void actions.clearSlotAt(view.day, view.slot, view.position)}
              aria-label={`Take ${card.name} out of ${where}`}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-pill text-text-2 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-ink/8 hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
            {reasons ? (
              <span
                aria-hidden
                className="inline-flex size-8 items-center justify-center rounded-pill text-text-2 transition-colors group-hover/row:bg-ink/8 group-hover/row:text-ink"
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className={cn("transition-transform duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-none", open && "rotate-180")}
                />
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {reasons ? (
        <div
          id={reasonsId}
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows] ease-[var(--ease-out-expo)] motion-reduce:transition-none",
            open ? "grid-rows-[1fr] duration-[400ms]" : "grid-rows-[0fr] duration-[260ms]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                "transition-[opacity,translate] ease-[var(--ease-out-expo)] motion-reduce:transition-none",
                open ? "translate-y-0 opacity-100 duration-[400ms]" : "-translate-y-2 opacity-0 duration-[180ms]",
              )}
            >
              <ReasonsPage reasons={reasons} client={firstName(clientName)} onViewDetails={viewDetails} />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** "Finding dinner in the chat": the slot a running search is for. */
function FindingRow({ view, actions }: { view: SlotView; actions: WorkspaceActions }) {
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  return (
    <li {...drop.handlers} role="status" className="bg-why">
      <div className={COLUMNS}>
        <SlotLabel slot={view.slot} className="text-amber" />
        <span aria-hidden className="h-10 rounded-[10px] border-[1.5px] border-dashed border-amber/50" />
        <div className="flex min-w-0 flex-col">
          <SlotLabel slot={view.slot} inline className="text-amber" />
          <p className="flex items-center gap-2 text-ui text-amber-deep">
            <Spinner size={13} />
            {findingLabel(view.slot)}
          </p>
        </div>
      </div>
    </li>
  );
}

/** A place the chat suggested for this open slot: dashed and faded until it is added. */
function SuggestionRow({ view, actions }: { view: SlotView & { suggestion: TripPlaceCard }; actions: WorkspaceActions }) {
  const select = useTripStore((s) => s.select);
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  const place = view.suggestion;
  return (
    <li
      {...drop.handlers}
      draggable
      onDragStart={(e) => startPlaceDrag(e, place.tripPlaceId, place.category)}
      className={cn("relative bg-why transition-shadow", drop.over && "glow-ring")}
    >
      <button
        type="button"
        onClick={() => select(place.tripPlaceId)}
        aria-label={`View ${place.name} details`}
        className="absolute inset-0 z-0 cursor-pointer"
      />
      <div className={cn(COLUMNS, "pointer-events-none relative")}>
        <SlotLabel slot={view.slot} className="text-amber" />
        <span className="relative h-14 overflow-hidden rounded-[10px] bg-avatar opacity-65 outline-[1.5px] outline-offset-2 outline-amber outline-dashed">
          {place.imageUrl ? <FilmImage src={place.imageUrl} alt="" sizes="88px" /> : null}
        </span>
        <div className="flex min-w-0 flex-col">
          <SlotLabel slot={view.slot} inline className="text-amber" />
          <p className="truncate text-body leading-5 font-semibold text-ink">{place.name}</p>
          <p className="text-ui-sm leading-[17px] text-amber-deep">{suggestionHint(place)}</p>
        </div>
        <ChevronRight size={16} strokeWidth={2} aria-hidden className="text-amber-deep" />
      </div>
    </li>
  );
}

/** Nothing in the slot yet. `hint` says how to fill it, once per itinerary. */
function OpenRow({ view, hint, actions }: { view: SlotView; hint: boolean; actions: WorkspaceActions }) {
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  const label = SLOT_LABELS[view.slot].toLowerCase();
  const note = advisorNote(view.row);
  return (
    <li {...drop.handlers} className={cn("transition-colors", drop.over && "bg-why/70")}>
      <div className={COLUMNS}>
        <SlotLabel slot={view.slot} />
        <span
          aria-hidden
          className={cn("h-10 rounded-[10px] border-[1.5px] border-dashed", drop.over ? "border-glow" : "border-ink/15")}
        />
        <div className="flex min-w-0 flex-col">
          <SlotLabel slot={view.slot} inline />
          <p className={cn("text-ui", drop.refusal ? "text-amber-deep" : "text-text-2")}>
            {drop.refusal ?? (drop.over ? `Drop to add to ${label}` : hint ? "Open. Drag a place here, or ask in the chat." : "Open")}
          </p>
          {note ? (
            <p title={note} className="truncate font-display text-[15px] leading-5 tracking-normal text-amber-deep italic">
              &ldquo;{note}&rdquo;
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** The row a drop makes: it opens at the end of a part while a place hovers over the part. */
export function NewRow({ label, drop }: { label: string; drop: PartDrop }) {
  const armed = drop === "armed";
  const open = armed || drop === "offered";
  const part = label.toLowerCase();
  return (
    <div
      aria-hidden={!open}
      data-testid="new-row"
      data-drop={drop}
      className={cn(
        "grid transition-[grid-template-rows] ease-[var(--ease-out-expo)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] duration-200" : "grid-rows-[0fr] duration-100",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={cn(COLUMNS, "border-t border-ink/7 transition-colors", armed && "bg-why/70")}>
          <span className="label-caps hidden font-semibold tracking-[0.12em] text-amber-deep @[440px]:block">New</span>
          <span aria-hidden className={cn("h-10 rounded-[10px] border-[1.5px] border-dashed", armed ? "border-glow" : "border-ink/15")} />
          <p className={cn("text-ui", armed ? "font-medium text-amber-deep" : "text-text-2")}>
            {armed ? `Drop to add to ${part}` : `Or drop here to add to ${part}`}
          </p>
        </div>
      </div>
    </div>
  );
}

export type SlotRowProps = Omit<PlaceRowProps, "view"> & { view: SlotView; hint: boolean };

export function SlotRow({ view, hint, actions, ...place }: SlotRowProps) {
  if (view.card) return <PlaceRow view={{ ...view, card: view.card }} actions={actions} {...place} />;
  if (view.finding) return <FindingRow view={view} actions={actions} />;
  if (view.suggestion) return <SuggestionRow view={{ ...view, suggestion: view.suggestion }} actions={actions} />;
  return <OpenRow view={view} hint={hint} actions={actions} />;
}
