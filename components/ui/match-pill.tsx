import { cn } from "@/lib/ui/cn";

// The taste match score on a photo. `md` sits on board cards ("★ 94 match",
// dark translucent glass by default, `light` glass as on the first board
// design); `sm` is the ink chip under a map photo pin ("★ 94"); `xs` is the
// corner number on a chat result tile ("91").

/** The five point star from the designs, in currentColor. */
export function StarGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" fill="currentColor" />
    </svg>
  );
}

export function MatchPill({
  score,
  showLabel = true,
  size = "md",
  tone = "dark",
  className,
}: {
  score: number;
  /** Adds the word "match" after the number (md only). */
  showLabel?: boolean;
  size?: "md" | "sm" | "xs";
  tone?: "dark" | "light";
  className?: string;
}) {
  if (size === "xs") {
    return (
      <span className={cn("inline-flex rounded-pill bg-ink/70 px-[7px] py-0.5 text-micro font-semibold text-surface", className)}>
        {score}
        <span className="sr-only"> match</span>
      </span>
    );
  }

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-[5px] rounded-pill bg-ink px-2.5 py-1 text-meta leading-[14px] font-semibold text-surface",
          className,
        )}
      >
        <StarGlyph size={10} />
        {score}
        <span className="sr-only"> match</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border py-[7px] pr-3 pl-2 text-ui font-semibold text-white backdrop-blur-[16px]",
        tone === "dark" ? "border-surface/30 bg-match-pill" : "border-white/40 bg-white/25",
        className,
      )}
    >
      <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-pill bg-ink text-white">
        <StarGlyph size={12} />
      </span>
      <span>
        {score}
        {showLabel ? " match" : <span className="sr-only"> match</span>}
      </span>
    </span>
  );
}
