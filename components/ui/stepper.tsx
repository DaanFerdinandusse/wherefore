import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/ui/cn";

// A count with minus and plus: Adults and Children in the Travelers menu.
// The minus fades at the minimum and the plus at the maximum; the value is
// announced when it changes.
export function Stepper({
  label,
  value,
  onValueChange,
  min = 0,
  max = 20,
  className,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;
  const round =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-pill border transition-colors disabled:cursor-not-allowed";

  return (
    <div role="group" aria-label={label} className={cn("flex items-center justify-between py-1.5", className)}>
      <span className="text-body-lg leading-5.5 font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={!canDecrease}
          onClick={() => onValueChange(Math.max(min, value - 1))}
          className={cn(
            round,
            canDecrease ? "border-ink text-ink hover:border-ink hover:bg-ink/5" : "border-ink/20 text-ink/35",
          )}
        >
          <Minus size={16} strokeWidth={2} aria-hidden />
        </button>
        <output aria-live="polite" className="w-10 text-center text-body-lg leading-5 font-semibold text-ink">
          {value}
        </output>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={!canIncrease}
          onClick={() => onValueChange(Math.min(max, value + 1))}
          className={cn(
            round,
            canIncrease ? "border-ink text-ink hover:border-ink hover:bg-ink/5" : "border-ink/20 text-ink/35",
          )}
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
