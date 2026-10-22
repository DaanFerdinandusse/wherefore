"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { ChevronDown, Route, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { Tabs } from "@/components/ui/tabs";

import { UserMenu } from "./user-menu";
import { Wordmark } from "./wordmark";

// The top bar inside a trip: wordmark, the trip switcher (client and city,
// dates, opens a menu of other trips), the Discover / Itinerary / Traveler
// view tabs in the middle, then "How we got this", "Share itinerary" and the
// avatar menu. Below 1280px "How we got this" folds into an icon button so
// the bar fits at 1024.
export type TripView = "discover" | "itinerary" | "traveler";

export type TripSwitcherItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  imageSrc?: ImageProps["src"];
};

const VIEWS: { value: TripView; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "itinerary", label: "Itinerary" },
  { value: "traveler", label: "Traveler view" },
];

function Thumb({ src, size }: { src?: ImageProps["src"]; size: number }) {
  return (
    <span style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-pill bg-avatar">
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="film object-cover" /> : null}
    </span>
  );
}

export function TripTopBar({
  trip,
  otherTrips = [],
  view,
  onViewChange,
  onHowWeGotThis,
  onShare,
  sharing = false,
  share,
  userName,
  onSignOut,
}: {
  trip: { title: string; datesLabel: string; imageSrc?: ImageProps["src"] };
  /** Trips to switch to, newest first. */
  otherTrips?: TripSwitcherItem[];
  view: TripView;
  onViewChange: (view: TripView) => void;
  onHowWeGotThis: () => void;
  onShare?: () => void;
  /** Shows a spinner on Share while the link is being made. */
  sharing?: boolean;
  /** Replaces the Share button, for a control with its own menu (the workspace's ShareButton). */
  share?: ReactNode;
  userName: string;
  onSignOut: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <header className="flex h-[76px] shrink-0 items-center gap-4 px-7">
      <div className="flex min-w-max flex-1 basis-0 items-center gap-3 xl:gap-5">
        <Wordmark />
        <span aria-hidden className="h-7 w-px shrink-0 bg-rule-strong max-xl:hidden" />
        <Menu
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          label="Switch trip"
          panelClassName="w-[400px]"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`Switch trip, current: ${trip.title}, ${trip.datesLabel}`}
              className="flex max-w-[180px] items-center gap-2.5 rounded-pill border border-nav-pill py-1.5 pr-3.5 pl-1.5 text-left transition-colors hover:border-ink hover:bg-ink/5 xl:max-w-[260px]"
            >
              <Thumb src={trip.imageSrc} size={32} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui font-semibold text-ink">{trip.title}</span>
                <span className="truncate text-meta text-text-muted">{trip.datesLabel}</span>
              </span>
              <ChevronDown size={14} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
            </button>
          )}
        >
          <MenuLabel>Other trips</MenuLabel>
          {otherTrips.length === 0 ? (
            <p className="px-3 pb-2 text-ui text-text-2">No other trips yet.</p>
          ) : (
            otherTrips.map((item) => (
              <MenuItem
                key={item.id}
                href={item.href}
                title={item.title}
                description={item.subtitle}
                leading={<Thumb src={item.imageSrc} size={44} />}
                chevron
                onSelect={() => setSwitcherOpen(false)}
              />
            ))
          )}
        </Menu>
      </div>

      <Tabs
        label="Trip views"
        items={VIEWS}
        value={view}
        onValueChange={onViewChange}
        className="shrink-0 [&>button]:max-xl:px-3.5"
      />

      <div className="flex min-w-max flex-1 basis-0 items-center justify-end gap-3.5">
        <button
          type="button"
          onClick={onHowWeGotThis}
          aria-label="How we got this"
          className="label-caps -mx-2 inline-flex h-10 items-center rounded-pill px-2 leading-4 text-text-3 transition-colors hover:bg-ink/5 hover:text-ink max-xl:mx-0 max-xl:w-10 max-xl:justify-center max-xl:px-0"
        >
          <Route size={16} strokeWidth={2} aria-hidden className="xl:hidden" />
          <span className="max-xl:hidden">How we got this</span>
        </button>
        {share ?? (
          <Button icon={<Share size={16} strokeWidth={2} aria-hidden />} onClick={onShare} loading={sharing}>
            Share itinerary
          </Button>
        )}
        <UserMenu userName={userName} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
