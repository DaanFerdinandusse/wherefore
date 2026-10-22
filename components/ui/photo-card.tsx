import Link from "next/link";
import type { ImageProps } from "next/image";
import type { ReactNode } from "react";

import { imagePolicy } from "@/lib/images/source";
import { cn } from "@/lib/ui/cn";

import { FilmImage } from "./film-image";

// The board card shell: a full-bleed photo, badges top left (match pill, your
// place), one action top right (the + button or "+ Add to Day 2"), and at the
// bottom the type line, the name in Hanken 300 and any extra rows (because,
// your note). Three name sizes: lg 44 (featured), md 30, sm 26. The card
// takes its size from `className` (for example h-[300px]); there is no default height. With `href`, the whole card opens the
// place; badges and the action stay separately clickable above the link.
// Provider photos load directly over the warm card background (imagePolicy in
// lib/images/source.ts), so the card never shows an empty frame while the
// slow origin answers, and a failed photo leaves the warm background.
export type PhotoCardSize = "sm" | "md" | "lg";

const nameClasses: Record<PhotoCardSize, string> = {
  lg: "text-card-lg leading-12",
  md: "text-card-md leading-9",
  sm: "text-card-sm leading-[30px]",
};

export function PhotoCard({
  src,
  alt,
  name,
  typeLine,
  size = "md",
  badges,
  action,
  href,
  highlighted = false,
  priority,
  className,
  children,
}: {
  src: ImageProps["src"];
  alt: string;
  name: string;
  /** "Seafood · Roma Norte · $$$", only from provider tags. */
  typeLine?: string;
  size?: PhotoCardSize;
  badges?: ReactNode;
  action?: ReactNode;
  href?: string;
  /** Amber glow when the place is highlighted from chat or the map. */
  highlighted?: boolean;
  priority?: boolean;
  className?: string;
  /** Rows under the name: BecauseRow, YourNoteRow. */
  children?: ReactNode;
}) {
  const policy = imagePolicy(src);
  const inset = size === "lg" ? "top-[18px] left-[18px] right-[18px]" : "top-4 left-4 right-4";
  return (
    <article
      data-image-source={policy.source}
      className={cn(
        "group relative isolate overflow-hidden rounded-photo bg-avatar shadow-card transition-shadow",
        highlighted && "glow-ring",
        className,
      )}
    >
      <FilmImage
        src={src}
        alt={alt}
        priority={priority}
        sizes={
          policy.unoptimized
            ? undefined
            : size === "lg"
              ? "(min-width: 1280px) 640px, 60vw"
              : "(min-width: 1280px) 340px, 33vw"
        }
        className="transition-transform duration-300 group-hover:scale-[1.015]"
      />
      <div aria-hidden className="photo-shade absolute inset-0" />

      {href ? (
        <Link href={href} className="absolute inset-0 z-10 rounded-photo" aria-label={`Open ${name}`} />
      ) : null}

      {badges || action ? (
        <div className={cn("pointer-events-none absolute z-20 flex items-start justify-between gap-2", inset)}>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">{badges}</div>
          <div className="pointer-events-auto">{action}</div>
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute z-20 flex flex-col",
          size === "lg" ? "right-6 bottom-[22px] left-6 gap-1.5" : "right-5 bottom-[18px] left-5 gap-1",
        )}
      >
        {typeLine ? (
          <p className={cn("text-ui-sm leading-4 font-medium text-white/86", size === "lg" && "tracking-[0.02em]")}>
            {typeLine}
          </p>
        ) : null}
        <h3 className={cn("font-light tracking-[-0.02em] text-white", nameClasses[size])}>{name}</h3>
        {children ? <div className="pointer-events-auto flex flex-col gap-1.5 pt-1">{children}</div> : null}
      </div>
    </article>
  );
}
