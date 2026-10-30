"use client";

import type { DragEvent, ReactNode, Ref } from "react";
import { BedDouble, Clock, Coffee, Heart, Landmark, MapPin, Star, Utensils, Wine } from "lucide-react";

import type { Category } from "@/lib/contracts";
import type { GoogleAttribution } from "@/lib/google/contracts";
import { cn } from "@/lib/ui/cn";

import { shortAuthor } from "./card-format";
import { LoadingPhoto } from "./loading-photo";
import type { PlacePhoto } from "./place-photos";

// The pieces the place card and the favorite card share: the photo strip with
// its chips and the three tabs.

export type CardTab = "for" | "visit" | "reviews";

export const CATEGORY_ICON: Record<Category, typeof Utensils> = {
  eat: Utensils,
  drink: Wine,
  coffee: Coffee,
  see: Landmark,
  stay: BedDouble,
  other: MapPin,
};

export function PhotoChip({ icon: Icon, children }: { icon?: typeof Utensils; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-photo-chip py-1.5 pr-2.75 pl-2.25 text-ui-sm leading-4 font-semibold text-white">
      {Icon ? <Icon aria-hidden className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

export function GoogleCredit({ attributions, top = false }: { attributions?: GoogleAttribution[]; top?: boolean }) {
  const author = shortAuthor(attributions?.[0]?.displayName);
  if (!attributions) return null;
  return (
    <span className={cn("absolute right-2 rounded-pill bg-photo-chip px-2 py-0.5 text-meta font-medium text-white", top ? "top-2" : "bottom-2")}>
      Google{author ? ` · ${author}` : ""}
    </span>
  );
}

/** Photo frames reserve space while details load and open the selected image. */
export function PhotoStrip({ photos, loading, name, tall, chips, onDragStart, onOpenGallery, expanded = false, galleryId, moreTileRef, onExpand }: {
  photos: PlacePhoto[];
  loading: boolean;
  name: string;
  tall: boolean;
  chips: ReactNode;
  /** A trip place can be dragged onto a slot. */
  onDragStart?: (event: DragEvent) => void;
  onOpenGallery: (src: string) => void;
  expanded?: boolean;
  galleryId?: string;
  moreTileRef?: Ref<HTMLButtonElement>;
  /** Without it the third tile opens the viewer, which holds every photo. */
  onExpand?: () => void;
}) {
  const slotCount = loading ? 3 : Math.min(photos.length, 3);
  const height = tall ? "h-62" : "h-50";

  if (slotCount === 0) {
    return (
      <div draggable={Boolean(onDragStart)} onDragStart={onDragStart} className={cn("relative flex items-end rounded-photo bg-avatar p-3.5", height)}>
        <span className="absolute inset-0 flex items-center justify-center font-display text-card-md text-text-2">{name[0]}</span>
        <div className="relative flex flex-wrap gap-1.5">{chips}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 gap-1.5", height)} draggable={Boolean(onDragStart)} onDragStart={onDragStart} data-testid="place-card-photos">
      {Array.from({ length: slotCount }, (_, index) => {
        const photo = photos[index];
        const hasMore = Boolean(onExpand) && index === 2 && photos.length > 3 && !expanded;
        return (
          <button
            key={index}
            ref={index === 2 ? moreTileRef : undefined}
            type="button"
            disabled={!photo}
            onClick={() => {
              if (hasMore) onExpand?.();
              else if (photo) onOpenGallery(photo.src);
            }}
            aria-label={hasMore ? `Open more photos of ${name}` : `View photo ${index + 1} of ${name}`}
            aria-haspopup={hasMore ? undefined : "dialog"}
            aria-expanded={hasMore ? false : undefined}
            aria-controls={hasMore ? galleryId : undefined}
            data-photo-toggle={hasMore ? true : undefined}
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
            {/* The first tile's chips sit along the bottom, so its credit goes on top. */}
            <GoogleCredit attributions={photo?.attributions} top={index === 0} />
            {index === 0 ? <span className="absolute bottom-3.5 left-3.5 flex flex-wrap gap-1.5">{chips}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The first tab is the card's own: "For Ana" on a trip place, "About" on a favorite. */
export function CardTabs({ value, onChange, first, firstIcon = Heart }: {
  value: CardTab;
  onChange: (tab: CardTab) => void;
  first: string;
  firstIcon?: typeof Heart;
}) {
  const tabs: { value: CardTab; label: string; icon: typeof Heart }[] = [
    { value: "for", label: first, icon: firstIcon },
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
