import type { TripCover } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

// The credit a trip cover must carry where it is shown large: the
// photographer and Unsplash, both linked, with the utm params Unsplash asks
// for. White on the photo: the parent places it over the image.

const UNSPLASH_LINK = "https://unsplash.com/?utm_source=wherefore&utm_medium=referral";

export function CoverCredit({ cover, className }: { cover: TripCover; className?: string }) {
  return (
    <p className={cn("text-micro text-white/80 [text-shadow:0_1px_3px_rgb(22_19_15/0.6)]", className)}>
      Photo by{" "}
      <a href={cover.creditUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        {cover.creditName}
      </a>{" "}
      on{" "}
      <a href={UNSPLASH_LINK} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        Unsplash
      </a>
    </p>
  );
}
