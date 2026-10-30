import type { CSSProperties } from "react";
import { Heart, Star, Utensils } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { initials } from "@/lib/ui/initials";
import { cn } from "@/lib/ui/cn";

import { dishList, type PhotoFrame as PhotoFrameSpec } from "./format";
import { PhotoFrame } from "./photo-frame";

// Small pieces shared by the place blocks and the stay section. Server
// components: FilmImage is the only client part.

/** A round photo of a favorite, or its initials on the warm avatar when we have no photo. */
export function FavoritePhoto({
  name,
  src,
  ring,
  className,
}: {
  name: string;
  src?: string;
  /** "glow": the thin ring next to a reason. "band": the double ring of the favorites band. */
  ring: "glow" | "band";
  /** The size: "size-14" and the like. */
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-avatar font-display text-body-lg text-ink",
        ring === "glow" ? "ring-2 ring-glow" : "shadow-[0_0_0_3px_var(--color-sand),0_0_0_5px_var(--color-sand-ring)]",
        className,
      )}
    >
      {initials(name)}
      {src ? <FilmImage src={src} alt="" sizes="80px" /> : null}
    </span>
  );
}

/** The advisor's initials on ink, as in the hero, the notes and the footer. */
export function AdvisorInitials({ name, size }: { name: string; size: 36 | 40 | 52 }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-ink font-semibold text-white",
        size === 52 ? "text-action" : "text-ui-sm",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** The italic reason with the favorite's photo next to it. */
export function ReasonRow({
  text,
  favorite,
  favoriteSrc,
  compact = false,
}: {
  text: string;
  favorite: string;
  favoriteSrc?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-start", compact ? "gap-3.5" : "gap-3.5 @3xl:gap-[18px]")}>
      <FavoritePhoto
        name={favorite}
        src={favoriteSrc}
        ring="glow"
        className={compact ? "size-10" : "mt-0.5 size-10 @3xl:size-14"}
      />
      <p
        className={cn(
          "font-display text-ink italic",
          compact ? "text-reason-sm" : "text-reason-sm @3xl:text-reason",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/** "Loved for  Oysters · Fresh fish": review keywords, above a hairline. */
export function LovedFor({ keywords, compact = false }: { keywords: readonly string[]; compact?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2.5 border-t border-rule text-ink",
        compact ? "pt-3.5 text-body" : "pt-4 text-body-lg",
      )}
    >
      <Heart aria-hidden className="mt-0.5 size-[18px] shrink-0 text-amber" strokeWidth={2} />
      <span>
        <span className="font-semibold text-amber">Loved for</span>
        {"  "}
        {keywords.join(" · ")}
      </span>
    </p>
  );
}

/** "Order oysters, grilled octopus, scallops": the place's own specialty dishes. */
export function DishesChip({ dishes }: { dishes: readonly string[] }) {
  return (
    <p className="flex items-start gap-2.5 self-start rounded-card bg-glow/18 py-[9px] pr-4 pl-3 text-action text-ink">
      <Utensils aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.8} />
      <span>
        <span className="font-semibold">Order</span> {dishList(dishes)}
      </span>
    </p>
  );
}

/** "Four nights · 5-star hotel". */
export function StayFacts({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2.5 text-body-lg text-ink">
      <Star aria-hidden className="size-[18px] shrink-0 text-amber" strokeWidth={2} />
      {text}
    </p>
  );
}

/** The advisor's slot note, shown only when they marked it for the traveler: "From Sofía". */
export function AdvisorNote({ note, advisorName }: { note: string; advisorName: string | null }) {
  const advisor = advisorName?.trim();
  const first = advisor?.split(/\s+/)[0];
  return (
    <div className="flex items-start gap-3.5 border-t border-rule pt-5">
      {advisor ? <AdvisorInitials name={advisor} size={36} /> : null}
      <div className="flex flex-col gap-[3px]">
        <p className="text-ui font-semibold text-amber">{first ? `From ${first}` : "From your advisor"}</p>
        <p className="text-body-lg text-ink">{note}</p>
      </div>
    </div>
  );
}

/**
 * One to three photos across the page at one height: each frame grows by its
 * aspect ratio. On a phone the first photo runs full width and the rest
 * share the row under it.
 */
export function PhotoRow({ frames, alt }: { frames: readonly PhotoFrameSpec[]; alt: string }) {
  if (frames.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 @3xl:flex-nowrap @3xl:gap-3">
      {frames.map((frame, i) => (
        <PhotoFrame
          key={frame.src}
          src={frame.src}
          alt={i === 0 ? alt : ""}
          sizes="(min-width: 1024px) 50vw, 100vw"
          style={{ "--r": frame.mobileRatio, "--r-wide": frame.ratio, "--g": frame.grow } as CSSProperties}
          className={
            i === 0
              ? "aspect-(--r) basis-full @3xl:aspect-(--r-wide) @3xl:basis-0 @3xl:grow-(--g)"
              : "aspect-(--r) basis-0 grow @3xl:aspect-(--r-wide) @3xl:grow-(--g)"
          }
        />
      ))}
    </div>
  );
}
