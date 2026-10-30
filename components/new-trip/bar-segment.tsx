"use client";

import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/ui/cn";

// One segment of the booking-style trip bar (N1 to N4): an uppercase label
// over the current value, or a muted placeholder. The segment only toggles;
// the panel draws the open segment's dropdown under the sheet. The open
// segment is a white pill with an ink outline, and the hairline dividers hide
// next to it.
export type SegmentKey = "who" | "where" | "when" | "travelers";

export const SEGMENT_ORDER: SegmentKey[] = ["who", "where", "when", "travelers"];

export function BarSegment({
  label,
  value,
  placeholder,
  open,
  onToggle,
  buttonRef,
  controls,
  divider,
  className,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Id of the dropdown this segment opens. */
  controls: string;
  /** The hairline on the left: null for the first segment, false (hidden) next to the open one. */
  divider: boolean | null;
  /** Width share in the bar, for example "flex-[259_1_0px]". */
  className?: string;
}) {
  return (
    <>
      {divider !== null ? (
        <span
          aria-hidden
          className={cn("h-9 w-px shrink-0 bg-rule transition-opacity", divider ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? controls : undefined}
        aria-haspopup="dialog"
        className={cn(
          "flex h-[68px] min-w-0 flex-col justify-center gap-1 rounded-pill px-7 text-left transition-[background-color,box-shadow] focus-visible:outline-offset-0",
          open ? "bg-white shadow-card ring-[1.5px] ring-ink" : "hover:bg-surface",
          className,
        )}
      >
        <span className="label-caps leading-4 font-semibold tracking-[0.12em] text-text-2">{label}</span>
        <span className={cn("truncate text-body-lg leading-[22px]", value ? "font-medium text-ink" : "text-text-muted")}>
          {value ?? placeholder}
        </span>
      </button>
    </>
  );
}

/**
 * The quiet section label inside a dropdown ("Recent clients", "Who is
 * traveling"). `inset` replaces the default padding.
 */
export function DropLabel({ children, inset = "px-4 pt-3 pb-2" }: { children: ReactNode; inset?: string }) {
  return (
    <p className={cn("label-caps leading-4 font-semibold tracking-[0.12em] text-text-2", inset)}>
      {children}
    </p>
  );
}
