import { cn } from "@/lib/ui/cn";

// The small round score for dense map pins when zoomed out: 34px surface
// disc, hairline ring, the number. `highlighted` adds the amber glow used for
// ask results.
export function ScoreDot({
  score,
  highlighted = false,
  className,
}: {
  score: number;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-[34px] shrink-0 items-center justify-center rounded-pill border border-pill-outline bg-surface text-meta leading-[14px] font-semibold text-ink shadow-pin",
        highlighted && "glow-ring border-transparent",
        className,
      )}
    >
      {score}
      <span className="sr-only"> match</span>
    </span>
  );
}
