"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// A modal sheet over a soft blurred scrim: the place profile (`right`: a
// large panel anchored to the right edge, 16px from the viewport) and smaller
// dialogs (`center`). Built on the native <dialog> like the lightbox in
// itinerary-canvas, so Escape, the focus trap, focus return and the top layer
// come from the platform. A click on the scrim closes it; the page behind
// does not scroll while it is open. The panel rises in.
export function Sheet({
  open,
  onClose,
  label,
  side = "right",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name ("Contramar"). */
  label: string;
  side?: "right" | "center";
  /** Panel classes: width, height, padding. */
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Drive the native modal from the controlled prop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-scrim-soft backdrop:backdrop-blur-[6px] open:flex",
        "fixed inset-0 h-dvh w-screen",
        side === "right" ? "items-stretch justify-end p-4" : "items-center justify-center p-6",
      )}
    >
      {open ? (
        <div
          className={cn(
            "rise-in relative overflow-auto rounded-panel bg-surface shadow-panel",
            side === "right" ? "h-full w-[min(1224px,calc(100vw-32px))]" : "max-h-full w-[min(560px,100%)] p-8",
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
