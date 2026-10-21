"use client";

import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/ui/cn";

// Section tabs in uppercase labels: Discover / Itinerary / Traveler view.
// `pill` is the trip top bar in the designs (active = ink fill); `underline`
// is the quieter variant for in-page sections. Arrow keys, Home and End move
// between tabs and select them (automatic activation, one tab stop).
export type TabItem<V extends string> = { value: V; label: string; disabled?: boolean };

export function Tabs<V extends string>({
  items,
  value,
  onValueChange,
  variant = "pill",
  label,
  panelIdPrefix,
  className,
}: {
  items: TabItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  variant?: "pill" | "underline";
  /** Accessible name of the tab list ("Trip views"). */
  label: string;
  /** When set, each tab points at `${prefix}-${value}` with aria-controls. */
  panelIdPrefix?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    const current = enabled.indexOf(items.findIndex((item) => item.value === value));
    let next: number | undefined;
    if (event.key === "ArrowRight") next = enabled[(current + 1) % enabled.length];
    if (event.key === "ArrowLeft") next = enabled[(current - 1 + enabled.length) % enabled.length];
    if (event.key === "Home") next = enabled[0];
    if (event.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onValueChange(items[next].value);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex items-center", variant === "pill" ? "gap-1 p-1" : "gap-6", className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${item.value}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "label-caps whitespace-nowrap leading-4 transition-colors disabled:opacity-45",
              variant === "pill"
                ? cn(
                    "rounded-pill px-[18px] py-2",
                    selected ? "bg-ink text-surface" : "text-text-3 hover:bg-ink/5 hover:text-ink",
                  )
                : cn(
                    "border-b-[1.5px] pt-2 pb-[7px]",
                    selected ? "border-ink text-ink" : "border-transparent text-text-3 hover:text-ink",
                  ),
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
