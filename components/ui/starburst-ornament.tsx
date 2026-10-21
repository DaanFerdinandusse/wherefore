import { cn } from "@/lib/ui/cn";

// The fine-line starburst from the traveler view footer. Decorative only; it
// takes the text color.
export function StarburstOrnament({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className={cn("shrink-0 text-ink", className)}>
      <path
        d="M22 2v40M2 22h40M7.9 7.9l28.2 28.2M36.1 7.9 7.9 36.1M14.3 3.5l15.4 37M29.7 3.5l-15.4 37M3.5 14.3l37 15.4M3.5 29.7l37-15.4M18.1 2.4l7.8 39.2M25.9 2.4l-7.8 39.2M2.4 18.1l39.2 7.8M2.4 25.9l39.2-7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </svg>
  );
}
