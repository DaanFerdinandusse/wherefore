"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

/**
 * While `active`, keeps Tab inside `ref`, closes on Escape and on a pointer
 * down outside `ref` (and outside `ignoreRef`, usually the trigger), and
 * moves focus to the first focusable element. Focus goes back to whatever
 * had it before when the trap ends.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  ignoreRef?: RefObject<HTMLElement | null>,
) {
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusableIn(container)[0];
    (first ?? container).focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (!container) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableIn(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (container?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      dismiss();
    }

    container.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, ref, ignoreRef]);
}
