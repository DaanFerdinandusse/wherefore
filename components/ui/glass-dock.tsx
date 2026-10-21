import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// The frosted container at the bottom of the board and the trips page: the
// chat dock. `toggle` (the Board / Map SegmentedToggle) floats centered 17px
// above it. The parent positions the dock (usually absolute, bottom 24px);
// the dock sets its own look and padding, the content is the caller's.
export function GlassDock({
  toggle,
  label = "Assistant",
  className,
  children,
}: {
  toggle?: ReactNode;
  /** Accessible name of the region. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className={cn("w-[920px] max-w-full", className)}>
      <div className="relative">
        {toggle ? <div className="absolute bottom-full left-1/2 mb-[17px] -translate-x-1/2">{toggle}</div> : null}
        <div className="glass-dock flex flex-col gap-3.5 rounded-dock border border-white/60 p-[18px] shadow-dock">
          {children}
        </div>
      </div>
    </section>
  );
}
