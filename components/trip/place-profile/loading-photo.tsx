"use client";

import { useState } from "react";

import { FilmImage } from "@/components/ui/film-image";
import type { CardPhoto } from "./place-card";

/** Keep the reserved photo frame visible until the image loads or fails. */
export function LoadingPhoto({ photo, sizes }: { photo?: CardPhoto; sizes: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  return (
    <>
      {status === "loading" ? (
        <span role="status" className="absolute inset-0 skeleton-sheen motion-safe:animate-pulse">
          <span className="sr-only">Loading photo</span>
        </span>
      ) : null}
      {photo ? (
        <FilmImage
          src={photo.src}
          alt={photo.alt}
          sizes={sizes}
          unoptimized
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={status === "loaded" ? "opacity-100" : "opacity-0"}
        />
      ) : null}
    </>
  );
}
