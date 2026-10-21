import type { ImageProps } from "next/image";
import { Images } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import { FilmImage } from "./film-image";

// The arch-topped photo of the place profile: a true half circle on top
// (`arch-top-fluid`, sized from the wrapper's width), 24px corners below, and
// an optional caption chip ("1 of 214 photos"). Size it with `className`
// (width plus height or an aspect ratio).
export function ArchPhoto({
  src,
  alt,
  caption,
  priority,
  sizes = "(min-width: 1280px) 580px, 45vw",
  className,
}: {
  src: ImageProps["src"];
  alt: string;
  /** Count caption, only from real photo counts. */
  caption?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div className={cn("@container relative", className)}>
      <div className="arch-top-fluid relative size-full overflow-hidden bg-avatar">
        <FilmImage src={src} alt={alt} priority={priority} sizes={sizes} />
      </div>
      {caption ? (
        <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-pill border border-white/30 bg-ink/35 px-3 py-[7px] text-ui-sm font-semibold text-white backdrop-blur-[14px]">
          <Images size={14} strokeWidth={2} aria-hidden />
          {caption}
        </span>
      ) : null}
    </div>
  );
}
