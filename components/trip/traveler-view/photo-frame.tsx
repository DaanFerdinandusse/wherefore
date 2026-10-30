"use client";

import { type CSSProperties, useState } from "react";

import { FilmImage } from "@/components/ui/film-image";
import { cn } from "@/lib/ui/cn";

/**
 * A rounded photo frame with a fixed aspect ratio (the ratio and flex grow
 * come in as CSS variables). A photo that fails to load takes its frame with
 * it, so the other photos of the row close the gap instead of leaving an
 * empty block.
 */
export function PhotoFrame({
  src,
  alt,
  className,
  style,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  sizes: string;
  priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;
  return (
    <div style={style} className={cn("relative overflow-hidden rounded-card bg-avatar", className)}>
      <FilmImage src={src} alt={alt} sizes={sizes} priority={priority} onError={() => setFailedSrc(src)} />
    </div>
  );
}
