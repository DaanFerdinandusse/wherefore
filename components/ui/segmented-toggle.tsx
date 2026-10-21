"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// Pick one of a few views. `glass` is the Board / Map toggle that floats over
// the board above the dock; `outline` is Mine / Team and Exact dates /
// Not set yet; `quiet` is Board / Calendar / List on the trips page, where
// only the active option wears an outline. A radio group: arrow keys move
// and select.
export type SegmentOption<V extends string> = { value: V; label: string; icon?: ReactNode };

const containerClasses = {
  glass: "glass-control gap-1 rounded-pill border border-ink/18 p-1",
  outline: "gap-1 rounded-pill border border-pill-outline p-1",
  quiet: "gap-2",
} as const;

export function SegmentedToggle<V extends string>({
  options,
  value,
  onValueChange,
  variant = "outline",
  size = "md",
  label,
  className,
}: {
  options: SegmentOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  variant?: keyof typeof containerClasses;
  /** md: 34px options (Mine / Team); sm: 32px with wider padding (Exact dates / Not set yet). */
  size?: "md" | "sm";
  /** Accessible name ("View"). */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === value);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % options.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onValueChange(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center", containerClasses[variant], className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-pill text-ui transition-colors",
              size === "sm" ? "px-[18px] py-[7px]" : variant === "glass" ? "px-3.5 py-2" : "px-4 py-2",
              variant === "quiet"
                ? selected
                  ? "border border-nav-pill font-semibold text-ink"
                  : "border border-transparent font-medium text-text-muted hover:text-ink"
                : selected
                  ? "bg-ink font-semibold text-surface"
                  : "font-medium text-ink hover:bg-ink/5",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
