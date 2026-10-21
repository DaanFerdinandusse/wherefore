import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// The header under the app bar: a Bodoni title ("Good morning, Sofía",
// "My places"), one line of context, and actions on the right (view toggle,
// filter pills, "+ Save a place"), aligned to the bottom of the title block.
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
    <div className={cn("flex items-end justify-between gap-8 px-7 pt-1 pb-[22px]", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-title leading-[54px] text-ink">{title}</h1>
        {subtitle ? <p className="text-body leading-[22px] text-text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
    </div>
  );
}
