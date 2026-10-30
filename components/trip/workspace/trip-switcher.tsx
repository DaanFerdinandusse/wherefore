"use client";

import type { ImageProps } from "next/image";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { floatingPill } from "@/components/shell/top-nav";
import { FilmImage } from "@/components/ui/film-image";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/ui/cn";

// The trip pill next to the menu button (G1): a round photo, "Ana Ruiz ·
// Lisbon" over "14 to 18 May · 4 nights", and a chevron that opens the
// owner's other trips. Development fixtures sit last under "Dev".

export type TripSwitcherItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  imageSrc?: ImageProps["src"];
  /** A trip made by the dev fixtures: listed last, under "Dev" (development only). */
  dev?: boolean;
};

function Thumb({ src, size }: { src?: ImageProps["src"]; size: number }) {
  return (
    <span style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-pill bg-avatar">
      {src ? <FilmImage src={src} alt="" sizes={`${size}px`} /> : null}
    </span>
  );
}

export function TripSwitcher({
  title,
  subtitle,
  imageSrc,
  otherTrips,
}: {
  title: string;
  subtitle: string;
  imageSrc?: ImageProps["src"];
  otherTrips: TripSwitcherItem[];
}) {
  const [open, setOpen] = useState(false);
  const realTrips = otherTrips.filter((item) => !item.dev);
  const devTrips = otherTrips.filter((item) => item.dev);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      label="Switch trip"
      panelClassName="w-[400px] max-w-[calc(100vw-32px)]"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Switch trip, current: ${title}, ${subtitle}`}
          className={cn(
            floatingPill,
            "flex h-11 min-w-0 items-center gap-2.5 py-[5px] pr-3.5 pl-[5px] text-left transition-colors hover:bg-surface-raised",
          )}
        >
          <Thumb src={imageSrc} size={34} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-semibold text-ink">{title}</span>
            <span className="truncate text-meta text-text-muted">{subtitle}</span>
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
        </button>
      )}
    >
      <MenuLabel>Other trips</MenuLabel>
      {realTrips.length === 0 ? (
        <p className="px-3 pb-2 text-ui text-text-2">No other trips yet.</p>
      ) : (
        realTrips.map((item) => (
          <MenuItem
            key={item.id}
            href={item.href}
            title={item.title}
            description={item.subtitle}
            leading={<Thumb src={item.imageSrc} size={44} />}
            chevron
            onSelect={() => setOpen(false)}
          />
        ))
      )}
      {devTrips.length > 0 ? (
        <>
          <MenuSeparator />
          <MenuLabel>Dev</MenuLabel>
          {devTrips.map((item) => (
            <MenuItem
              key={item.id}
              href={item.href}
              title={item.title}
              description={item.subtitle}
              onSelect={() => setOpen(false)}
            />
          ))}
        </>
      ) : null}
    </Menu>
  );
}
