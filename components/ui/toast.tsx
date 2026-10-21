import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// A plain confirmation at the bottom center ("Link copied", "Contramar added
// to Day 2 lunch"), with an optional action ("Undo"). Presentational: the
// caller decides when it shows and hides. It rises in when it appears.
export function Toast({
  message,
  action,
  position = "fixed",
  className,
}: {
  message: string;
  /** A small text button, for example Undo. */
  action?: ReactNode;
  /** `static` renders in place (for previews). */
  position?: "fixed" | "static";
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rise-in z-50 inline-flex items-center gap-4 rounded-pill bg-ink py-3 pr-3 pl-5 text-ui font-medium text-surface shadow-menu",
        !action && "pr-5",
        position === "fixed" && "fixed bottom-6 left-1/2 -translate-x-1/2",
        className,
      )}
    >
      <span>{message}</span>
      {action}
    </div>
  );
}

/** The text button that goes in a Toast. */
export function ToastAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill px-2 py-0.5 font-semibold text-glow underline decoration-1 underline-offset-[3px] hover:decoration-2"
    >
      {children}
    </button>
  );
}
