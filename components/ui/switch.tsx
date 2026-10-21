import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { BookmarkGlyph } from "./bookmark-mark";

// An on/off control. `track` is the small 40 x 24 switch next to a label
// ("Blend my taste into searches"); `pill` is the "In my places" toggle on the
// place profile: ink fill with a bookmark when on, an outline when off. Both
// are role="switch" buttons, so Space and Enter flip them.
export function Switch({
  checked,
  onCheckedChange,
  label,
  variant = "track",
  icon,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Accessible name. For `pill` it is also the visible text. */
  label: string;
  variant?: "track" | "pill";
  /** Leading glyph for `pill`; defaults to the bookmark. */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  if (variant === "pill") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3.5 text-ui-sm leading-4 font-semibold transition-colors disabled:opacity-45",
          checked
            ? "border-transparent bg-ink text-surface hover:bg-text-4"
            : "border-nav-pill text-ink hover:border-ink hover:bg-ink/5",
          className,
        )}
      >
        {icon ?? <BookmarkGlyph size={12} filled={checked} />}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-pill border p-[3px] transition-colors disabled:opacity-45",
        checked ? "border-ink bg-ink" : "border-pill-outline hover:border-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 rounded-pill",
          checked ? "translate-x-4 bg-surface" : "translate-x-0 bg-ink",
        )}
      />
    </button>
  );
}
