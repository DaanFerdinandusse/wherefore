import { cn } from "@/lib/ui/cn";

// The hairline that separates days, rail sections and menu groups.
// `strong` is the darker rule between columns (the itinerary rail edge).
export function Rule({
  orientation = "horizontal",
  strong = false,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  strong?: boolean;
  className?: string;
}) {
  const color = strong ? "border-rule-strong" : "border-rule";
  if (orientation === "vertical") {
    return <span role="separator" aria-orientation="vertical" className={cn("inline-block self-stretch border-l", color, className)} />;
  }
  return <hr className={cn("border-0 border-t", color, className)} />;
}
