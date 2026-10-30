import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// The title block at the top of a panel body: a Bodoni title ("Trips",
// "Clients", "Lisbon"), one line of context, and actions on the right
// (filters, a client picker), aligned to the bottom of the title block.
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-8", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-section text-ink">{title}</h1>
        {subtitle ? <p className="text-body leading-[22px] text-text-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
    </div>
  );
}
