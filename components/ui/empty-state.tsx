import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// What a list shows before it has anything: a Bodoni title that says what
// will appear ("Her trips will show up here"), one line on how to get there,
// and the action that does it. Dashed frame by default, as on the client
// profile.
export function EmptyState({
  title,
  body,
  action,
  bordered = true,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3.5 px-8 py-16 text-center",
        bordered && "rounded-photo border border-dashed border-pill-outline",
        className,
      )}
    >
      <h3 className="font-display text-empty text-ink">{title}</h3>
      {body ? <p className="max-w-[480px] text-body leading-[22px] text-text-2">{body}</p> : null}
      {action}
    </div>
  );
}
