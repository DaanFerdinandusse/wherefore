"use client";

import { useId, useRef, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/ui/cn";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";

// A panel anchored under its trigger: the trip bar menus (For who, When,
// Travelers), the user menu, the search results. Controlled with `open` and
// `onOpenChange`. While open, focus stays inside; Escape, a click outside
// and the trigger close it, and focus returns to the trigger. The panel
// rises in (the one authored motion).
export type PopoverTriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-haspopup": "dialog" | "menu";
};

export function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  align = "start",
  role = "dialog",
  className,
  panelClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render the trigger and spread the props onto a button. */
  trigger: (props: PopoverTriggerProps) => ReactNode;
  /** Accessible name of the panel ("Choose a client"). */
  label: string;
  align?: "start" | "center" | "end";
  role?: "dialog" | "menu";
  /** Classes for the wrapper that positions the panel. */
  className?: string;
  /** Classes for the panel: width, padding overrides. */
  panelClassName?: string;
  children: ReactNode;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(panelRef, open, () => onOpenChange(false), triggerRef);

  return (
    <div className={cn("relative inline-flex", className)}>
      {trigger({
        ref: triggerRef,
        onClick: () => onOpenChange(!open),
        "aria-expanded": open,
        "aria-controls": id,
        "aria-haspopup": role,
      })}
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role={role}
          aria-label={label}
          tabIndex={-1}
          className={cn(
            "rise-in absolute top-full z-50 mt-2 rounded-menu border border-rule-strong bg-surface p-3 shadow-menu focus-visible:outline-none",
            align === "start" && "left-0",
            align === "end" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            panelClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
