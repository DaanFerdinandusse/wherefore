import type { ImageProps } from "next/image";

import { cn } from "@/lib/ui/cn";

import { FilmImage } from "./film-image";

// "Because she loves Via Carota and Lilia": the client favorites that drove
// a match, as overlapping round photos and one line of text. The text comes
// from the explainability data, never from the model.
export function BecauseRow({
  photos,
  text,
  size = 26,
  tone = "photo",
  className,
}: {
  /** Up to three favorite photos, in the order of their share. */
  photos: { src: ImageProps["src"]; alt: string }[];
  text: string;
  size?: 24 | 26;
  tone?: "photo" | "surface";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center",
        size === 26 ? "gap-2.5 text-ui" : "gap-2 text-ui-sm",
        tone === "photo" ? "text-white" : "text-ink",
        className,
      )}
    >
      <span className="flex shrink-0">
        {photos.slice(0, 3).map((photo, i) => (
          <span
            key={i}
            style={{ width: size, height: size }}
            className={cn(
              "relative overflow-hidden rounded-pill border-2",
              tone === "photo" ? "border-white" : "border-surface",
              i > 0 && "-ml-2",
            )}
          >
            <FilmImage src={photo.src} alt={photo.alt} sizes={`${size}px`} />
          </span>
        ))}
      </span>
      <span>{text}</span>
    </p>
  );
}
