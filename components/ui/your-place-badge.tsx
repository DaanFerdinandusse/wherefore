import type { ReactNode } from "react";
import { Sparkle } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import { BookmarkGlyph } from "./bookmark-mark";

// Small labels that sit on a photo next to the match pill. YourPlaceBadge
// marks a place from the advisor's own list; PhotoBadge is the generic chip
// (for example "New from your ask" on a surface fill).
export function PhotoBadge({
  icon,
  tone = "dark",
  className,
  children,
}: {
  icon?: ReactNode;
  tone?: "dark" | "surface";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] rounded-pill py-[7px] pr-3 pl-2.5 text-ui font-semibold whitespace-nowrap",
        tone === "dark"
          ? "border border-surface/30 bg-ink/72 text-surface backdrop-blur-[16px]"
          : "bg-surface text-ink",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function YourPlaceBadge({ className }: { className?: string }) {
  return (
    <PhotoBadge icon={<BookmarkGlyph size={12} />} className={className}>
      Your place
    </PhotoBadge>
  );
}

export function NewFromAskBadge({ className }: { className?: string }) {
  return (
    <PhotoBadge tone="surface" icon={<Sparkle size={12} strokeWidth={2} fill="currentColor" aria-hidden />} className={className}>
      New from your ask
    </PhotoBadge>
  );
}
