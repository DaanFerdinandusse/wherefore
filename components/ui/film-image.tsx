"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

import { imagePolicy, unsplashLoader } from "@/lib/images/source";
import { cn } from "@/lib/ui/cn";

// next/image with the warm film grade of the designs (the `film` utility).
// Every place photo goes through this so provider and Google images match.
// Defaults to filling its parent: give the parent a size and `position: relative`.
//
// How the bytes load comes from imagePolicy (lib/images/source.ts): provider
// images and our photo proxy load directly (unoptimized, explicit size, lazy,
// async, warm placeholder background); Unsplash covers ask its CDN for each
// width; everything else uses the optimizer.
// A photo that fails to load is removed, so the frame's warm background shows
// instead of a broken image. Explicit `unoptimized`, `loading` or `decoding`
// props win over the policy.
export function FilmImage({
  className,
  alt,
  fill,
  width,
  height,
  sizes,
  src,
  unoptimized,
  loading,
  decoding,
  priority,
  preload,
  onError,
  ...props
}: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps["src"] | null>(null);
  if (failedSrc !== null && failedSrc === src) return null;

  const policy = imagePolicy(src);
  const direct = unoptimized ?? policy.unoptimized;
  const useFill = fill ?? (width === undefined && height === undefined);
  // Direct images keep an explicit intrinsic size even when they fill the
  // frame: the img is absolutely positioned and covers it like `fill` does.
  const sized = useFill && direct && policy.width !== undefined && policy.height !== undefined;

  return (
    <Image
      src={src}
      alt={alt}
      fill={(useFill && !sized) || undefined}
      width={sized ? policy.width : useFill ? undefined : width}
      height={sized ? policy.height : useFill ? undefined : height}
      sizes={direct ? sizes : (sizes ?? (useFill ? "(min-width: 1024px) 50vw, 100vw" : undefined))}
      unoptimized={direct || undefined}
      loader={policy.source === "unsplash" ? unsplashLoader : undefined}
      priority={priority}
      preload={preload}
      loading={loading ?? (priority || preload ? undefined : direct ? policy.loading : undefined)}
      decoding={decoding ?? (direct ? policy.decoding : undefined)}
      data-image-source={policy.source}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
      className={cn(
        "film object-cover",
        sized && "absolute inset-0 size-full",
        direct && policy.placeholder && "bg-avatar",
        className,
      )}
      {...props}
    />
  );
}
