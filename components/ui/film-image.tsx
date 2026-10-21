import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/ui/cn";

// next/image with the warm film grade of the designs (the `film` utility).
// Every place photo goes through this so provider and Google images match.
// Defaults to `fill`: give the parent a size and `position: relative`.
export function FilmImage({ className, alt, fill, width, height, sizes, ...props }: ImageProps) {
  const useFill = fill ?? (width === undefined && height === undefined);
  return (
    <Image
      alt={alt}
      fill={useFill || undefined}
      width={useFill ? undefined : width}
      height={useFill ? undefined : height}
      sizes={sizes ?? (useFill ? "(min-width: 1024px) 50vw, 100vw" : undefined)}
      className={cn("film object-cover", className)}
      {...props}
    />
  );
}
