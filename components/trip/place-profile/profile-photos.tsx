"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Images, X } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/ui/cn";

import { MapsPhotosLink } from "./maps-photos-link";
import type { PlacePhoto } from "./place-photos";

// The left column: the arch photo with "1 of N photos", two smaller photos and
// "See all N photos". Scrolled (03b), the two small photos move on top and
// the large one below, without the arch. Google photos carry their author
// attribution wherever they show, as Google requires.

// Provider and Google photos are served from hosts and a signed-in proxy route
// the image optimizer cannot fetch for us, so the browser loads them directly.
const IMAGE_PROPS = { unoptimized: true } as const;

function Attribution({ photo, className }: { photo: PlacePhoto; className?: string }) {
  if (!photo.attributions) return null;
  const author = photo.attributions.find((a) => a.displayName);
  return (
    <span
      className={cn(
        "pointer-events-auto absolute right-3 bottom-3 max-w-[calc(100%-24px)] truncate rounded-pill bg-ink/45 px-2.5 py-1 text-micro text-white backdrop-blur-[10px]",
        className,
      )}
    >
      From Google
      {author ? (
        <>
          {" · "}
          {author.uri ? (
            <a href={author.uri} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {author.displayName}
            </a>
          ) : (
            author.displayName
          )}
        </>
      ) : null}
    </span>
  );
}

function SeeAllButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-pill border border-white/30 bg-ink/35 px-3 py-[7px] text-ui-sm font-semibold text-white backdrop-blur-[14px] transition-colors hover:bg-ink/55"
    >
      <Images size={14} strokeWidth={2} aria-hidden />
      See all {count} photos
    </button>
  );
}

function OpenPhoto({ photo, sizes, priority, onOpen }: { photo: PlacePhoto; sizes: string; priority?: boolean; onOpen: (src: string) => void }) {
  return (
    <button type="button" aria-label={`View ${photo.alt}`} aria-haspopup="dialog" onClick={() => onOpen(photo.src)}
      className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-offset-[-4px]">
      <FilmImage src={photo.src} alt={photo.alt} sizes={sizes} priority={priority} {...IMAGE_PROPS} />
    </button>
  );
}

function SmallPhoto({ photo, className, children, onOpen }: { photo: PlacePhoto; className?: string; children?: React.ReactNode; onOpen: (src: string) => void }) {
  return (
    <div className={cn("relative overflow-hidden rounded-photo bg-avatar", className)}>
      <OpenPhoto photo={photo} sizes="284px" onOpen={onOpen} />
      <Attribution photo={photo} className="top-3 bottom-auto" />
      {children}
    </div>
  );
}

export function ProfilePhotos({
  photos,
  name,
  scrolled,
  onSeeAll,
  onOpenPhoto,
}: {
  photos: PlacePhoto[];
  name: string;
  scrolled: boolean;
  onSeeAll: () => void;
  onOpenPhoto: (src: string) => void;
}) {
  const [first, second, third] = photos;
  const count = photos.length;

  if (!first) {
    return (
      <div className="arch-top flex h-full items-center justify-center bg-avatar text-ui text-text-2">
        No photos yet
      </div>
    );
  }

  if (scrolled && second) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex h-[296px] shrink-0 gap-3">
          <SmallPhoto onOpen={onOpenPhoto} photo={second} className="flex-1" />
          {third ? <SmallPhoto onOpen={onOpenPhoto} photo={third} className="flex-1" /> : null}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-photo bg-avatar">
          <OpenPhoto photo={first} sizes="580px" onOpen={onOpenPhoto} />
          <Attribution photo={first} />
          <SeeAllButton count={count} onClick={onSeeAll} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className={cn("relative min-h-0", second ? "h-[520px] shrink-0" : "flex-1")}>
        {/* ArchPhoto's shape and caption, with the image loaded unoptimized (see IMAGE_PROPS). */}
        <div className="@container relative size-full">
          <div className="arch-top-fluid relative size-full overflow-hidden bg-avatar">
            <OpenPhoto photo={first} sizes="580px" priority onOpen={onOpenPhoto} />
          </div>
          <span className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-pill border border-white/30 bg-ink/35 px-3 py-[7px] text-ui-sm font-semibold text-white backdrop-blur-[14px]">
            <Images size={14} strokeWidth={2} aria-hidden />
            {count === 1 ? "1 photo" : `1 of ${count} photos`}
          </span>
        </div>
        <Attribution photo={first} className="bottom-4" />
      </div>
      {second ? (
        <div className="flex min-h-0 flex-1 gap-3">
          <SmallPhoto onOpen={onOpenPhoto} photo={second} className="flex-1">
            {!third && count > 1 ? <SeeAllButton count={count} onClick={onSeeAll} /> : null}
          </SmallPhoto>
          {third ? (
            <SmallPhoto onOpen={onOpenPhoto} photo={third} className="flex-1">
              <SeeAllButton count={count} onClick={onSeeAll} />
            </SmallPhoto>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only">{`${count} photos of ${name}`}</span>
    </div>
  );
}

/** "See all N photos": a horizontal strip over the sheet. Esc closes the strip, not the sheet. */
export function PhotoStrip({ photos, name, photosUrl, onClose, onOpenPhoto }: { photos: PlacePhoto[]; name: string; photosUrl?: string; onClose: () => void; onOpenPhoto: (src: string) => void }) {
  const regionRef = useRef<HTMLDivElement>(null);
  useEffect(() => regionRef.current?.querySelector("button")?.focus(), []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={`All photos of ${name}`}
      onKeyDown={onKeyDown}
      className="rise-in absolute inset-0 z-30 flex flex-col gap-5 rounded-panel bg-surface p-8"
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-section">
          {name} <span className="font-sans text-ui text-text-2">{photos.length} photos</span>
        </p>
        <div className="flex items-center gap-4">
          {photosUrl ? <MapsPhotosLink href={photosUrl} /> : null}
          <IconButton
            label="Close the photos"
            icon={<X size={16} strokeWidth={2.2} />}
            variant="soft"
            onClick={onClose}
          />
        </div>
      </div>
      <ul className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto pb-2">
        {photos.map((photo, i) => (
          <li key={`${photo.src}-${i}`} className="relative aspect-[4/5] h-full shrink-0 snap-start overflow-hidden rounded-photo bg-avatar">
            <OpenPhoto photo={photo} sizes="600px" onOpen={onOpenPhoto} />
            <Attribution photo={photo} />
          </li>
        ))}
      </ul>
    </div>
  );
}
