"use client";

import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import { Popover, type PopoverTriggerProps } from "./popover";

// A list of actions in a Popover: the For who menu (recent clients, "Find a
// client", "New client"), the user menu (Sign out), the trip switcher. Arrow
// keys move between items, Home and End jump, Tab closes. Rows highlight on
// hover and focus with the canvas fill, as in the designs.
export function Menu({
  open,
  onOpenChange,
  trigger,
  label,
  align,
  className,
  panelClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  label: string;
  align?: "start" | "center" | "end";
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      onOpenChange(false);
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next].focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      label={label}
      align={align}
      role="menu"
      className={className}
      panelClassName={panelClassName}
    >
      <div onKeyDown={onKeyDown} className="flex flex-col">
        {children}
      </div>
    </Popover>
  );
}

export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="presentation" className={cn("label-caps px-3 pt-2 pb-2.5 leading-[14px] text-text-2", className)}>
      {children}
    </p>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <hr role="separator" className={cn("my-2.5 border-0 border-t border-rule", className)} />;
}

const rowClasses =
  "group flex w-full items-center gap-3.5 rounded-row px-3 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:-outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

export function MenuItem({
  leading,
  title,
  description,
  trailing,
  chevron = false,
  href,
  onSelect,
  disabled = false,
  className,
}: {
  /** Avatar or 44px icon circle. */
  leading?: ReactNode;
  title: string;
  description?: string;
  /** Right side content, for example a small outline button label. */
  trailing?: ReactNode;
  /** Shows the chevron on hover and focus ("opens more"). */
  chevron?: boolean;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-lg leading-5 font-semibold text-ink">{title}</span>
        {description ? <span className="text-ui-sm text-text-2">{description}</span> : null}
      </span>
      {trailing}
      {chevron ? (
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} role="menuitem" className={cn(rowClasses, className)} onClick={onSelect}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={cn(rowClasses, className)}
    >
      {content}
    </button>
  );
}
