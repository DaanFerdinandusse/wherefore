import Link from "next/link";

import { cn } from "@/lib/ui/cn";

// "Wherefore" in Bodoni, linking home to the trips overview.
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/trips"
      className={cn("font-display text-wordmark leading-8 whitespace-nowrap text-ink tracking-[-0.03em]", className)}
    >
      Wherefore
    </Link>
  );
}
