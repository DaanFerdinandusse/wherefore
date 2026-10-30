"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { cn } from "@/lib/ui/cn";
import { LoadingPhoto } from "./loading-photo";
import { MapsPhotosLink } from "./maps-photos-link";
import type { PlacePhoto } from "./place-photos";

/** Native modal keeps focus in the viewer and returns it to the clicked photo. */
export function PhotoViewer({ photos, name, initialSrc, photosUrl, onClose }: {
  photos: PlacePhoto[];
  name: string;
  initialSrc: string;
  photosUrl?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedSrc, setSelectedSrc] = useState(initialSrc);
  const index = Math.max(0, photos.findIndex((photo) => photo.src === selectedSrc));
  const photo = photos[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const { overflow } = document.documentElement.style;
    dialog?.showModal();
    // showModal focuses the first control, which can be the Google Maps link.
    closeRef.current?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.documentElement.style.overflow = overflow;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  function move(direction: number) {
    const next = photos[(index + direction + photos.length) % photos.length];
    if (next) setSelectedSrc(next.src);
  }

  const control = "inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-track text-ink hover:bg-rule disabled:opacity-40";

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={`Photos of ${name}`}
      className="fixed inset-0 m-auto h-[90dvh] max-h-none w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden rounded-panel bg-surface p-0 text-ink shadow-panel backdrop:bg-scrim-soft backdrop:backdrop-blur-[6px]"
      onClose={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
        <header className="flex shrink-0 items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-card-xs sm:text-card-md">{name}</h2>
          {photosUrl ? <MapsPhotosLink href={photosUrl} /> : null}
          <button ref={closeRef} type="button" aria-label="Close photos" onClick={onClose} className={control}><X aria-hidden className="size-5" /></button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-avatar">
          {photo ? (
            <LoadingPhoto
              key={photo.src}
              photo={{ ...photo, src: photo.fullSrc ?? photo.src }}
              previewSrc={photo.fullSrc && photo.fullSrc !== photo.src ? photo.src : undefined}
              sizes="1100px"
              contain
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => move(-1)} className={control}><ChevronLeft aria-hidden className="size-5" /></button>
          <div className="min-w-0 flex-1 text-center text-ui-sm text-text-2">
            <p aria-live="polite">{index + 1} of {photos.length}</p>
            {photo?.attributions ? <p className="truncate text-meta">Google{photo.attributions.map((author) => author.displayName).filter(Boolean).map((author) => ` · ${author}`).join("")}</p> : null}
          </div>
          <button type="button" aria-label="Next photo" disabled={photos.length < 2} onClick={() => move(1)} className={control}><ChevronRight aria-hidden className="size-5" /></button>
        </div>
        <div ref={stripRef} role="group" aria-label="Choose a photo" className="flex shrink-0 gap-2 overflow-x-auto p-1">
          {photos.map((item, position) => (
            <button
              key={`${item.src}-${position}`}
              type="button"
              aria-label={`View photo ${position + 1}`}
              aria-pressed={position === index}
              onClick={() => setSelectedSrc(item.src)}
              className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-avatar sm:h-20 sm:w-28", position === index ? "ring-2 ring-amber ring-offset-2 ring-offset-surface" : "opacity-65 hover:opacity-100")}
            >
              <FilmImage src={item.src} alt="" sizes="112px" unoptimized />
            </button>
          ))}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
