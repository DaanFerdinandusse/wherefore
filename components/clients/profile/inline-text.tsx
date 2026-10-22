"use client";

import { useRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

// Text that is its own input: the client's name (Bodoni title) and home city
// on the profile. It reads as plain text until focused, then shows the
// editing underline. The input grows with its text (a hidden copy sizes it).
// Enter commits, Escape cancels; both leave the field. Blur commits.
export function InlineText({
  value,
  onValueChange,
  onCommit,
  onCancel,
  label,
  placeholder,
  underline = false,
  className,
  inputClassName,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className"> & {
  value: string;
  onValueChange: (value: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  label: string;
  placeholder: string;
  /** Show the editing underline even without focus (a new client's empty name). */
  underline?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  return (
    <span
      className={cn(
        "relative inline-grid max-w-full border-b-[1.5px] transition-colors",
        underline ? "border-ink" : "border-transparent hover:border-rule-strong",
        "focus-within:border-ink",
        className,
      )}
    >
      <span aria-hidden className={cn("invisible col-start-1 row-start-1 overflow-hidden whitespace-pre", inputClassName)}>
        {value || placeholder}
      </span>
      <input
        ref={ref}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        // The hidden copy sets the width; size 1 keeps the input's own minimum out of it.
        size={1}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            ref.current?.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            onCancel?.();
            ref.current?.blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) cancelled.current = false;
          else onCommit?.();
        }}
        className={cn(
          "col-start-1 row-start-1 w-full min-w-0 bg-transparent text-inherit placeholder:text-text-muted focus-visible:outline-none disabled:cursor-not-allowed",
          inputClassName,
        )}
        {...inputProps}
      />
    </span>
  );
}
