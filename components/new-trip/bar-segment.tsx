"use client";

import type { ReactNode } from "react";

import { Menu } from "@/components/ui/menu";
import { Popover, type PopoverTriggerProps } from "@/components/ui/popover";
import { cn } from "@/lib/ui/cn";

// One segment of the booking-style trip bar: an uppercase label over the
// current value (or a muted placeholder). It opens its own panel under the
// bar. The open segment lifts onto the raised surface with an outline; the
// hairline dividers hide next to it, as in the designs.
export type SegmentKey = "who" | "where" | "when" | "travelers";

export function BarSegment({
  label,
  value,
  placeholder,
  open,
  onOpenChange,
  divider,
  className,
  panelLabel,
  kind = "dialog",
  align = "start",
  panelClassName,
  children,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show the hairline on the left (not for the first segment or next to the open one). */
  divider: boolean;
  /** Width share in the bar, for example "flex-[1.3_1_0px]". */
  className?: string;
  panelLabel: string;
  kind?: "dialog" | "menu";
  align?: "start" | "center" | "end";
  panelClassName?: string;
  children: ReactNode;
}) {
  const trigger = (props: PopoverTriggerProps) => (
    <button
      {...props}
      type="button"
      className={cn(
        "relative flex h-[68px] w-full min-w-0 flex-col justify-center gap-[3px] rounded-pill border px-6 text-left transition-colors",
        open
          ? "border-nav-pill bg-surface-raised shadow-card"
          : "border-transparent hover:bg-surface-hover",
      )}
    >
      <span className="label-caps font-semibold text-ink">{label}</span>
      <span className={cn("truncate text-body-lg leading-5", value ? "text-ink" : "text-text-2")}>
        {value ?? placeholder}
      </span>
    </button>
  );

  const shared = {
    open,
    onOpenChange,
    trigger,
    label: panelLabel,
    align,
    className: cn("relative flex min-w-0", className),
    panelClassName: cn("mt-6! px-3! pt-5! pb-3!", panelClassName),
  };

  return (
    <>
      <span
        aria-hidden
        className={cn("h-[52px] w-px shrink-0 bg-rule-strong transition-opacity", divider ? "opacity-100" : "opacity-0")}
      />
      {kind === "menu" ? <Menu {...shared}>{children}</Menu> : <Popover {...shared}>{children}</Popover>}
    </>
  );
}

/** The 44px leading circle of a menu row: an icon on an outline or ink disc. */
export function RowIcon({ children, tone = "outline", shape = "round" }: { children: ReactNode; tone?: "outline" | "ink"; shape?: "round" | "square" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        shape === "round" ? "size-11 rounded-pill" : "size-12 rounded-[12px]",
        tone === "ink" ? "bg-ink text-surface" : "border border-pill-outline text-ink",
      )}
    >
      {children}
    </span>
  );
}
