import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import { Spinner } from "./spinner";

// A toggleable filter: "All 18", "Eat 7", or one pill per ask
// ("✦ Natural wine · Sat" with a spinner while it runs, its count when done,
// and a × to archive it). Active is the ink fill. The × is its own button
// next to the toggle, so both are reachable with the keyboard.
export function FilterPill({
  label,
  count,
  active = false,
  loading = false,
  icon,
  onClick,
  onRemove,
  removeLabel,
  className,
}: {
  label: string;
  count?: number;
  active?: boolean;
  /** Shows a spinner in place of the count. */
  loading?: boolean;
  /** Leading glyph, the sparkle for an ask. */
  icon?: ReactNode;
  onClick?: () => void;
  /** Adds a × that calls this. */
  onRemove?: () => void;
  /** Accessible name of the ×, defaults to "Remove {label}". */
  removeLabel?: string;
  className?: string;
}) {
  const tone = active
    ? "bg-ink text-surface border-transparent font-semibold"
    : "border-nav-pill text-ink font-medium hover:border-ink hover:bg-ink/5";

  return (
    <span
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-pill border text-ui transition-colors",
        tone,
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "inline-flex h-full items-center gap-2 whitespace-nowrap rounded-pill",
          icon ? "pl-3.5" : "pl-4",
          onRemove ? "pr-1" : loading ? "pr-3" : "pr-4",
        )}
      >
        {icon}
        <span>
          {label}
          {count !== undefined && !loading ? ` ${count}` : null}
        </span>
        {loading ? <Spinner size={14} label={`Finding ${label}`} /> : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${label}`}
          className={cn(
            "mr-1.5 ml-0.5 inline-flex size-6 items-center justify-center rounded-pill transition-colors",
            active ? "hover:bg-surface/15" : "hover:bg-ink/10",
          )}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
