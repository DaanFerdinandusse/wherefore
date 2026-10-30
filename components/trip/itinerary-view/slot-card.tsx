"use client";

import type { ReactNode } from "react";
import {
  BedDouble,
  Coffee,
  Heart,
  Landmark,
  MapPin,
  Martini,
  MessageCircle,
  Tag,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import type { Category, TripPlaceCard } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { useTripStore } from "../store";
import { startPlaceDrag, startSlotDrag } from "../workspace/dnd";
import { SLOT_LABELS } from "../workspace/format";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import {
  findingLabel,
  headline,
  openLabel,
  orderItems,
  slotChip,
  subLine,
  suggestionHint,
  whyBox,
  type SlotView,
  type WhyBox,
} from "./itinerary-model";
import { useSlotDrop } from "./slot-drop";

// A filled slot in the itinerary panel (T3): the photo carries the slot chip
// and the italic headline, then the name and type line, what to order, and
// the Why box. `feature` is the wide dinner card: a taller photo, the order
// list and the Why box side by side. Open slots show as a dashed row, a
// running search as "Finding dinner in the chat", a suggestion from the chat
// as the amber strip (J1b). Every one of them takes a dropped place.

export const CATEGORY_ICON: Record<Category, (props: { size: number }) => ReactNode> = {
  eat: ({ size }) => <UtensilsCrossed size={size} strokeWidth={2} aria-hidden />,
  drink: ({ size }) => <Martini size={size} strokeWidth={2} aria-hidden />,
  coffee: ({ size }) => <Coffee size={size} strokeWidth={2} aria-hidden />,
  see: ({ size }) => <Landmark size={size} strokeWidth={2} aria-hidden />,
  stay: ({ size }) => <BedDouble size={size} strokeWidth={2} aria-hidden />,
  other: ({ size }) => <MapPin size={size} strokeWidth={2} aria-hidden />,
};

function WhyBoxView({ box, className }: { box: WhyBox; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[9px] rounded-row bg-why px-3.5 py-3", className)}>
      <p className="flex items-center gap-1.5 text-ui-sm leading-4 font-semibold text-ink">
        <Heart size={14} strokeWidth={2} aria-hidden className="text-amber" />
        {box.title}
      </p>
      {box.note ? (
        <>
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-[18px] leading-[22px] tracking-normal text-ink italic">&ldquo;{box.note.text}&rdquo;</p>
            <p className="text-meta text-amber-deep">{box.note.label}</p>
          </div>
          {box.lines.length > 0 ? <span aria-hidden className="h-px shrink-0 bg-amber/20" /> : null}
        </>
      ) : null}
      {box.lines.map((line) => (
        <p key={line.text} className="flex items-start gap-2 text-ui-sm leading-[18px] text-ink">
          {line.kind === "favorite" ? (
            line.imageUrl ? (
              <span className="relative mt-px size-[15px] shrink-0 overflow-hidden rounded-pill bg-avatar">
                <FilmImage src={line.imageUrl} alt="" sizes="15px" />
              </span>
            ) : (
              <Heart size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-amber-deep" />
            )
          ) : line.kind === "keyword" ? (
            <MessageCircle size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-amber-deep" />
          ) : (
            <Tag size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-amber-deep" />
          )}
          <span className="min-w-0">{line.text}</span>
        </p>
      ))}
    </div>
  );
}

function OrderList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-[5px]">
      <p className="text-ui-sm leading-[18px] font-semibold text-ink">Order</p>
      <ul className="flex flex-col gap-[5px]">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-ui-sm leading-[18px] text-ink">
            <span aria-hidden className="size-[5px] shrink-0 rounded-pill bg-amber-dot" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

type CardProps = {
  view: SlotView & { card: TripPlaceCard };
  clientName: string;
  countryCode?: string;
  favoriteImages: Map<string, string>;
  actions: WorkspaceActions;
  feature?: boolean;
};

export function SlotCard({ view, clientName, countryCode, favoriteImages, actions, feature = false }: CardProps) {
  const { card } = view;
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const lit = useTripStore((s) => s.highlightedPlaceId === card.tripPlaceId || s.selectedPlaceId === card.tripPlaceId);
  const ref = { day: view.day, slot: view.slot, position: view.position };
  const drop = useSlotDrop(ref, actions);

  const title = headline(card);
  const order = orderItems(card);
  const why = whyBox(card, clientName, { slotNote: view.row, favoriteImages });
  const Icon = CATEGORY_ICON[card.category];
  const where = `Day ${view.day} ${SLOT_LABELS[view.slot].toLowerCase()}`;

  const photo = (
    <div
      className={cn(
        "relative flex shrink-0 flex-col justify-end overflow-hidden rounded-[16px] bg-avatar",
        feature ? "h-[248px] px-5 py-[18px]" : "h-[176px] px-3.5 py-3",
        lit && "glow-ring",
      )}
    >
      {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes={feature ? "620px" : "320px"} /> : null}
      <span aria-hidden className="photo-shade absolute inset-0" />
      {title ? (
        <p
          className={cn(
            "relative font-display text-why italic",
            feature ? "text-[38px] leading-[40px]" : "text-[21px] leading-[24px] tracking-normal",
          )}
        >
          {title}
        </p>
      ) : null}
      <span
        className={cn(
          "absolute flex items-center gap-1.5 rounded-pill bg-ink/70 font-semibold text-white",
          feature ? "top-3 left-3 h-7 px-2.5 text-ui-sm leading-4" : "top-2.5 left-2.5 h-[26px] px-[9px] text-meta",
        )}
      >
        <Icon size={feature ? 14 : 13} />
        {slotChip(view.slot, card.category)}
      </span>
      <button
        type="button"
        onClick={() => void actions.clearSlotAt(view.day, view.slot, view.position)}
        aria-label={`Take ${card.name} out of ${where}`}
        className="absolute top-2.5 right-2.5 inline-flex size-8 items-center justify-center rounded-pill bg-ink/70 text-white opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:bg-ink focus-visible:opacity-100"
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );

  const name = (
    <div className="flex flex-col gap-px">
      <h4 className={cn("font-semibold text-ink", feature ? "text-[17px] leading-[22px]" : "text-body-lg leading-[21px]")}>
        {card.name}
      </h4>
      <p className="text-ui-sm leading-[17px] text-text-3">{subLine(card, countryCode)}</p>
    </div>
  );

  return (
    <article
      {...drop.handlers}
      draggable
      onDragStart={(e) => {
        startSlotDrag(e, ref);
        startPlaceDrag(e, card.tripPlaceId);
      }}
      onMouseEnter={() => setHighlight(card.tripPlaceId)}
      onMouseLeave={() => setHighlight(null)}
      aria-label={`${where}: ${card.name}`}
      className={cn(
        "group/card relative flex min-w-0 cursor-grab flex-col rounded-[18px] active:cursor-grabbing",
        feature ? "gap-3.5" : "gap-3",
        drop.over && "outline-2 outline-offset-4 outline-glow outline-dashed",
      )}
    >
      {/* The whole card opens the place in a modal; the clear button sits above it. */}
      <button
        type="button"
        onClick={() => select(card.tripPlaceId)}
        aria-label={`View ${card.name} details`}
        className="absolute inset-0 z-0 rounded-[18px]"
      />
      <div className="pointer-events-none relative flex flex-col gap-3 [&_button]:pointer-events-auto">
        {photo}
        {feature ? (
          <div className="flex flex-col gap-4 @[520px]:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-0.5 py-1">
              {name}
              <OrderList items={order} />
            </div>
            {why ? <WhyBoxView box={why} className="min-w-0 flex-1 self-start" /> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-0.5">
            {name}
            <OrderList items={order} />
            {why ? <WhyBoxView box={why} /> : null}
          </div>
        )}
      </div>
    </article>
  );
}

/** An open slot of a filled day: a dashed drop row. */
export function OpenSlotRow({ view, actions }: { view: SlotView; actions: WorkspaceActions }) {
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  return (
    <div
      {...drop.handlers}
      className={cn(
        "flex min-h-14 items-center gap-4 rounded-[16px] border-[1.5px] border-dashed border-ink/15 px-4 py-3 transition-colors",
        drop.over && "border-glow bg-why/60",
      )}
    >
      <span className="label-caps w-[100px] shrink-0 font-semibold tracking-[0.12em] text-text-2">{SLOT_LABELS[view.slot]}</span>
      <span className="text-ui text-text-2">
        {view.row?.note.trim() && view.row.noteSource !== "agent" ? view.row.note : "Open. Drag a place here, or ask in the chat."}
      </span>
    </div>
  );
}

/** "Finding dinner in the chat": the slot a running search is for. */
export function FindingRow({ view, compact = false }: { view: SlotView; compact?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-4 rounded-row bg-why",
        compact ? "py-2 pr-2.5 pl-3.5" : "min-h-14 px-4 py-3",
      )}
    >
      <span className="label-caps w-[100px] shrink-0 font-semibold tracking-[0.12em] text-amber">{SLOT_LABELS[view.slot]}</span>
      <span className="flex flex-1 items-center gap-2 text-ui text-amber-deep">
        <Spinner size={13} />
        {findingLabel(view.slot)}
      </span>
      {compact ? <span aria-hidden className="h-14 w-[84px] shrink-0 rounded-[10px] border-[1.5px] border-dashed border-amber/50" /> : null}
    </div>
  );
}

/** J1b: an open slot with a place the chat suggested. Drag the place here or add it from its card. */
export function SuggestionStrip({ view, actions }: { view: SlotView & { suggestion: TripPlaceCard }; actions: WorkspaceActions }) {
  const select = useTripStore((s) => s.select);
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  const place = view.suggestion;
  const Icon = CATEGORY_ICON[place.category];
  return (
    <div
      {...drop.handlers}
      className={cn(
        "flex items-center gap-4 rounded-[16px] bg-why p-3 transition-shadow @max-[480px]:flex-col @max-[480px]:items-stretch",
        drop.over && "glow-ring",
      )}
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => startPlaceDrag(e, place.tripPlaceId)}
        onClick={() => select(place.tripPlaceId)}
        aria-label={`View ${place.name} details`}
        className="relative h-28 w-[168px] shrink-0 cursor-grab overflow-hidden rounded-[12px] bg-avatar opacity-65 outline-[1.5px] outline-offset-[3px] outline-amber outline-dashed @max-[480px]:w-full"
      >
        {place.imageUrl ? <FilmImage src={place.imageUrl} alt="" sizes="168px" /> : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="label-caps flex items-center gap-1.5 font-semibold tracking-[0.12em] text-amber">
          <Icon size={13} />
          {openLabel(view.slot)}
        </p>
        <p className="text-body-lg leading-[21px] font-semibold text-ink">{place.name} suggested in chat</p>
        <p className="text-ui-sm leading-[18px] text-amber-deep">{suggestionHint(place)}</p>
      </div>
    </div>
  );
}
