"use client";

import { useState } from "react";

import { cn } from "@/lib/ui/cn";
import { FilmImage } from "@/components/ui/film-image";
import type { PlacePhoto } from "./place-photos";

/**
 * Keep the reserved photo frame visible until the image loads or fails.
 * `contain` is the viewer: the whole photo, without the film grade. `previewSrc`
 * is a smaller copy to show underneath while the photo loads.
 */
export function LoadingPhoto({ photo, sizes, contain = false, previewSrc }: { photo?: PlacePhoto; sizes: string; contain?: boolean; previewSrc?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  return (
    <>
      {status === "loading" && !previewSrc ? (
        <span role="status" className="absolute inset-0 skeleton-sheen motion-safe:animate-pulse">
          <span className="sr-only">Loading photo</span>
        </span>
      ) : null}
      {status === "failed" && contain && !previewSrc ? <span className="absolute inset-0 flex items-center justify-center text-ui text-text-2">This photo could not load. Choose another photo.</span> : null}
      {previewSrc ? (
        <FilmImage src={previewSrc} alt="" sizes={sizes} unoptimized className={cn(contain && "object-contain! filter-none!")} />
      ) : null}
      {photo ? (
        <FilmImage
          src={photo.src}
          alt={photo.alt}
          sizes={sizes}
          unoptimized
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={cn(status === "loaded" ? "opacity-100" : "opacity-0", contain && "object-contain! filter-none!")}
        />
      ) : null}
    </>
  );
}
