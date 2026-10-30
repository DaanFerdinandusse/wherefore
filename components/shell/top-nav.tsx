"use client";

import { useState, type ReactNode } from "react";
import { Bookmark, BriefcaseBusiness, ChevronDown, Menu as MenuIcon, Users } from "lucide-react";

import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/ui/cn";

import { useShell } from "./shell-store";

// The two controls above every page: the round menu button that opens the
// nav drawer, and the section pill ("Trips · 6 in progress") that switches
// between Trips, Clients and My places. The trip workspace puts its own trip
// switcher next to the menu button instead of the section pill.

export type AppSection = "trips" | "clients" | "places";

export const SECTIONS: { key: AppSection; label: string; href: string; icon: ReactNode }[] = [
  { key: "trips", label: "Trips", href: "/trips", icon: <BriefcaseBusiness size={16} strokeWidth={2} aria-hidden /> },
  { key: "clients", label: "Clients", href: "/clients", icon: <Users size={16} strokeWidth={2} aria-hidden /> },
  { key: "places", label: "My places", href: "/places", icon: <Bookmark size={16} strokeWidth={2} aria-hidden /> },
];

/** The shared look of the two floating controls: a surface pill with a soft shadow. */
export const floatingPill = "rounded-pill bg-surface shadow-[0_1px_3px_rgb(22_19_15/0.08)]";

export function MenuButton({ className }: { className?: string }) {
  const openDrawer = useShell((s) => s.openDrawer);
  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label="Open menu"
      className={cn(
        floatingPill,
        "inline-flex size-11 shrink-0 items-center justify-center text-ink transition-colors hover:bg-surface-raised",
        className,
      )}
    >
      <MenuIcon size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function SectionPill({ section, detail }: { section: AppSection; detail?: string }) {
  const [open, setOpen] = useState(false);
  const current = SECTIONS.find((item) => item.key === section) ?? SECTIONS[0];
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      label="Go to"
      panelClassName="w-[280px]"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`${current.label}${detail ? `, ${detail}` : ""}. Go to another section`}
          className={cn(
            floatingPill,
            "flex h-11 items-center gap-2.5 py-[5px] pr-3.5 pl-[5px] text-left transition-colors hover:bg-surface-raised",
          )}
        >
          <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-pill bg-ink text-surface">
            {current.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-semibold text-ink">{current.label}</span>
            {detail ? <span className="truncate text-meta text-text-muted">{detail}</span> : null}
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
        </button>
      )}
    >
      {SECTIONS.map((item) => (
        <MenuItem
          key={item.key}
          href={item.href}
          title={item.label}
          leading={
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-pill",
                item.key === section ? "bg-ink text-surface" : "bg-avatar text-ink",
              )}
            >
              {item.icon}
            </span>
          }
          onSelect={() => setOpen(false)}
        />
      ))}
    </Menu>
  );
}
